import {
  findProviderByKey,
  validateUserApiKey,
  findProviderForModel,
  getNextKeyForProvider,
  Provider,
  ProtocolType,
} from './config';

// === Constants ===

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const BEARER_PREFIX = 'Bearer ';
const NVAPI_PREFIX = 'nvapi-';
const SSE_DONE = 'data: [DONE]\n\n';
const HTTP_BODY_METHODS = ['POST', 'PUT', 'PATCH'] as const;

export interface ProxyResult {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
}

export interface RoutingContext {
  apiKey: string;
  method: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
}

// === Route Request ===

export async function routeRequest(ctx: RoutingContext): Promise<ProxyResult> {
  const { apiKey, method, path, body, headers } = ctx;

  // Extract special API keys from headers
  const xGoogApiKey = headers?.['x-goog-api-key']
    || headers?.['X-Goog-Api-Key']
    || headers?.['x-Goog-Api-Key']
    || headers?.['X-GOOG-API-KEY'];
  const authHeader = headers?.['Authorization'] || headers?.['authorization'];
  const bearerToken = authHeader?.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length) : null;
  const nvapiKey = bearerToken?.startsWith(NVAPI_PREFIX) ? bearerToken : null;

  // Direct Gemini passthrough via x-goog-api-key header
  if (xGoogApiKey) {
    return passthroughGemini(method, path, body, xGoogApiKey);
  }

  // Direct NVIDIA passthrough via nvapi- prefix
  if (nvapiKey) {
    return passthroughNvidia(method, path, body, nvapiKey);
  }

  // Provider API key routing
  const provider = findProviderByKey(apiKey);
  if (provider) {
    const model = extractModelFromRequest(method, path, body);
    if (provider.protocolType === 'gemini' && model) {
      const convertedBody = convertRequestToProvider(model, body || {}, provider.protocolType);
      const isStreaming = body?.stream;
      const geminiPath = isStreaming
        ? `/models/${model}:streamGenerateContent`
        : `/models/${model}:generateContent`;
      return passthroughToProvider(provider, method, geminiPath, convertedBody, headers, apiKey);
    }
    return passthroughToProvider(provider, method, path, body, headers, apiKey);
  }

  // User API key validation
  const validation = validateUserApiKey(apiKey);
  if (!validation.valid) {
    return { success: false, error: 'Invalid or expired API key', status: 401 };
  }

  const model = extractModelFromRequest(method, path, body);
  if (!model) {
    return { success: false, error: 'Model not specified', status: 400 };
  }

  // Check model restrictions
  if (validation.allowedModels?.length) {
    const allowed = validation.allowedModels.some(m =>
      model.toLowerCase().includes(m.toLowerCase()) ||
      m.toLowerCase().includes(model.toLowerCase())
    );
    if (!allowed) {
      return { success: false, error: 'Model not allowed for this API key', status: 403 };
    }
  }

  const targetProvider = findProviderForModel(model, validation.allowedModels);
  if (!targetProvider) {
    return { success: false, error: `No provider available for model: ${model}`, status: 404 };
  }

  return passthroughToProvider(targetProvider, method, path, body, headers);
}

// === Model Extraction ===

function extractModelFromRequest(method: string, path: string, body?: any): string | null {
  // Gemini: /models/{model}:generateContent
  const geminiMatch = path.match(/\/models\/([^:]+):generateContent/);
  if (geminiMatch) return geminiMatch[1];

  // OpenAI/Anthropic/NVIDIA: body.model
  if (body?.model) return body.model;

  // Extract from path last segment
  const pathParts = path.split('/');
  const modelPart = pathParts[pathParts.length - 1];
  if (modelPart && !modelPart.includes(':')) return modelPart;

  return null;
}

// === Core Passthrough ===

async function passthroughToProvider(
  provider: Provider,
  method: string,
  path: string,
  body?: any,
  _headers?: Record<string, string>,
  apiKeyOverride?: string
): Promise<ProxyResult> {
  const apiKey = apiKeyOverride || getNextKeyForProvider(provider.id);
  if (!apiKey) {
    return { success: false, error: 'Provider has no API keys configured', status: 500 };
  }

  let url = `${provider.baseUrl}${path}`;
  const headersOut: Record<string, string> = { 'Content-Type': 'application/json' };

  // Set auth headers based on protocol
  switch (provider.protocolType) {
    case 'openai':
    case 'nvidia':
    case 'custom':
      headersOut['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'anthropic':
      headersOut['Authorization'] = `Bearer ${apiKey}`;
      headersOut['anthropic-version'] = '2023-06-01';
      break;
    case 'gemini':
      headersOut['x-goog-api-key'] = apiKey;
      url += `?key=${apiKey}`;
      break;
  }

  const isStreaming = body?.stream || path.includes('streamGenerateContent');
  return executeFetch(url, method, headersOut, body, isStreaming, provider.protocolType);
}

// === Direct Provider Passthroughs ===

async function passthroughGemini(
  method: string,
  path: string,
  body?: any,
  apiKey?: string
): Promise<ProxyResult> {
  if (!apiKey) return { success: false, error: 'API key required', status: 500 };
  const url = `${GEMINI_DEFAULT_BASE_URL}${path}?key=${apiKey}`;
  const isStreaming = body?.stream || path.includes('streamGenerateContent');
  return executeFetch(url, method, { 'Content-Type': 'application/json' }, body, isStreaming, 'gemini');
}

async function passthroughNvidia(
  method: string,
  path: string,
  body?: any,
  apiKey?: string
): Promise<ProxyResult> {
  if (!apiKey) return { success: false, error: 'API key required', status: 500 };
  const url = `${NVIDIA_DEFAULT_BASE_URL}${path}`;
  const headersOut: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': body?.stream ? 'text/event-stream' : 'application/json',
  };
  return executeFetch(url, method, headersOut, body, body?.stream, 'nvidia');
}

// === Fetch Execution ===

async function executeFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: any,
  isStreaming?: boolean,
  protocolType?: ProtocolType
): Promise<ProxyResult> {
  try {
    const fetchOptions: RequestInit = { method, headers };
    if (body && HTTP_BODY_METHODS.includes(method as any)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle streaming
    if (isStreaming) {
      if (protocolType === 'gemini') {
        return { success: true, data: wrapGeminiStream(response.body!), status: response.status };
      }
      return { success: true, data: response.body, status: response.status };
    }

    // Parse response body
    const result = await parseResponse(response);
    if (!result.ok) {
      return { success: false, error: typeof result.data === 'string' ? result.data : JSON.stringify(result.data), status: response.status };
    }
    return { success: true, data: result.data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

async function parseResponse(response: Response): Promise<{ data: any; ok: boolean }> {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { data, ok: response.ok };
}

// === Format Conversion ===

export function convertRequestToProvider(model: string, request: any, protocolType: ProtocolType): any {
  if (protocolType === 'gemini') {
    const contents = request.messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
    return {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.9,
        maxOutputTokens: request.max_tokens ?? 2048,
      },
    };
  }

  if (protocolType === 'anthropic') {
    return {
      model,
      messages: request.messages,
      stream: request.stream ?? false,
      temperature: request.temperature ?? 0.9,
      max_tokens: request.max_tokens ?? 2048,
    };
  }

  return { ...request, model };
}

export function convertResponseFromProvider(response: any, protocolType: ProtocolType): any {
  if (protocolType === 'gemini') {
    const content = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.modelVersion || 'gemini',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  if (protocolType === 'anthropic') {
    return {
      id: `anthropic-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || 'anthropic',
      choices: [{ index: 0, message: { role: 'assistant', content: response.content?.[0]?.text || '' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  return response;
}

// === Gemini Stream Wrapper ===

function wrapGeminiStream(inputStream: ReadableStream): ReadableStream {
  const reader = inputStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(new TextEncoder().encode(SSE_DONE));
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        controller.enqueue(new TextEncoder().encode(`data: ${trimmed}\n\n`));
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}
