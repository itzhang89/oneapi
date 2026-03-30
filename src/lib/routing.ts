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
const HTTP_BODY_METHODS = ['POST', 'PUT', 'PATCH'] as const;

export interface ProxyResult {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
  headers?: Record<string, string>;
  stream?: ReadableStream;
}

export interface RoutingContext {
  apiKey: string;
  method: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

// === Route Request ===
export async function routeRequest(ctx: RoutingContext): Promise<ProxyResult> {
  const { apiKey, method, path, body, headers, query } = ctx;

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
    return passthroughGemini(method, path, body, xGoogApiKey, headers, query);
  }

  // Direct NVIDIA passthrough via nvapi- prefix
  if (nvapiKey) {
    return passthroughNvidia(method, path, body, nvapiKey, headers, query);
  }

  // Provider API key routing
  const provider = findProviderByKey(apiKey);
  if (provider) {
    return passthroughToProvider(provider, method, path, body, headers, apiKey, query);
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

  return passthroughToProvider(targetProvider, method, path, body, headers, undefined, query);
}

// === Model Extraction ===
function extractModelFromRequest(method: string, path: string, body?: any): string | null {
  // Gemini: /models/{model}:generateContent or /models/{model}:streamGenerateContent
  const geminiMatch = path.match(/\/models\/([^:/?]+)(?::|$)/);
  if (geminiMatch) return geminiMatch[1];

  // OpenAI/Anthropic/NVIDIA: body.model
  if (body?.model) return body.model;

  // Extract from path
  const pathSegments = path.split('/').filter(Boolean);
  if (pathSegments.length > 0) {
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && !lastSegment.includes(':') && !lastSegment.includes('?')) {
      return lastSegment;
    }
  }

  return null;
}

// === Core Passthrough ===
async function passthroughToProvider(
    provider: Provider,
    method: string,
    path: string,
    body?: any,
    originalHeaders?: Record<string, string>,
    apiKeyOverride?: string,
    query?: Record<string, string>
): Promise<ProxyResult> {
  const apiKey = apiKeyOverride || getNextKeyForProvider(provider.id);
  if (!apiKey) {
    return { success: false, error: 'Provider has no API keys configured', status: 500 };
  }

  // Build URL with query parameters
  let url = `${provider.baseUrl}${path}`;
  const urlParams = new URLSearchParams();

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      urlParams.append(key, value);
    });
  }

  const headersOut: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Copy relevant headers from original request
  if (originalHeaders) {
    const headersToForward = ['user-agent', 'accept', 'accept-encoding', 'cache-control'];
    headersToForward.forEach(header => {
      const value = originalHeaders[header] || originalHeaders[header.toLowerCase()];
      if (value) {
        headersOut[header] = value;
      }
    });
  }

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
      urlParams.append('key', apiKey);
      break;
  }

  if (urlParams.toString()) {
    url += (url.includes('?') ? '&' : '?') + urlParams.toString();
  }

  return executeFetch(url, method, headersOut, body, provider.protocolType);
}

// === Direct Provider Passthroughs ===
async function passthroughGemini(
    method: string,
    path: string,
    body?: any,
    apiKey?: string,
    originalHeaders?: Record<string, string>,
    query?: Record<string, string>
): Promise<ProxyResult> {
  if (!apiKey) return { success: false, error: 'API key required', status: 500 };

  let url = `${GEMINI_DEFAULT_BASE_URL}${path}`;
  const urlParams = new URLSearchParams({ key: apiKey });

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (key !== 'key') { // Don't override the API key
        urlParams.append(key, value);
      }
    });
  }

  url += '?' + urlParams.toString();

  const headersOut: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Forward relevant headers
  if (originalHeaders) {
    const headersToForward = ['user-agent', 'accept', 'accept-encoding', 'cache-control'];
    headersToForward.forEach(header => {
      const value = originalHeaders[header] || originalHeaders[header.toLowerCase()];
      if (value) {
        headersOut[header] = value;
      }
    });
  }

  return executeFetch(url, method, headersOut, body, 'gemini');
}

async function passthroughNvidia(
    method: string,
    path: string,
    body?: any,
    apiKey?: string,
    originalHeaders?: Record<string, string>,
    query?: Record<string, string>
): Promise<ProxyResult> {
  if (!apiKey) return { success: false, error: 'API key required', status: 500 };

  let url = `${NVIDIA_DEFAULT_BASE_URL}${path}`;
  if (query) {
    const urlParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      urlParams.append(key, value);
    });
    if (urlParams.toString()) {
      url += '?' + urlParams.toString();
    }
  }

  const headersOut: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // Set appropriate Accept header for streaming
  if (body?.stream) {
    headersOut['Accept'] = 'text/event-stream';
  }

  // Forward relevant headers
  if (originalHeaders) {
    const headersToForward = ['user-agent', 'accept-encoding', 'cache-control'];
    headersToForward.forEach(header => {
      const value = originalHeaders[header] || originalHeaders[header.toLowerCase()];
      if (value && header !== 'accept') { // Don't override Accept header
        headersOut[header] = value;
      }
    });
  }

  return executeFetch(url, method, headersOut, body, 'nvidia');
}

// === Fetch Execution ===
async function executeFetch(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: any,
    protocolType?: ProtocolType
): Promise<ProxyResult> {
  try {
    const fetchOptions: RequestInit = { method, headers };

    if (body && HTTP_BODY_METHODS.includes(method as any)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const isStreaming = body?.stream ||
        path.includes('streamGenerateContent') ||
        responseHeaders['content-type']?.includes('text/event-stream');

    // Handle streaming responses
    if (isStreaming && response.body) {
      return {
        success: true,
        stream: response.body,
        status: response.status,
        headers: responseHeaders
      };
    }

    // Handle non-streaming responses
    const result = await parseResponse(response);
    return {
      success: response.ok,
      data: result.data,
      error: response.ok ? undefined : (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)),
      status: response.status,
      headers: responseHeaders
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      status: 500
    };
  }
}

async function parseResponse(response: Response): Promise<{ data: any }> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = await response.json();
      return { data };
    } catch (error) {
      // If JSON parsing fails, fall back to text
      const data = await response.text();
      return { data };
    }
  }

  const data = await response.text();
  return { data };
}

// === Format Conversion (保持原有的转换逻辑，但通常直接代理不需要) ===
export function convertRequestToProvider(model: string, request: any, protocolType: ProtocolType): any {
  if (protocolType === 'gemini') {
    const contents = request.messages?.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })) || [];

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
  // 在完全代理模式下，通常不需要转换响应格式
  // 保持原有逻辑以备特殊需要
  return response;
}