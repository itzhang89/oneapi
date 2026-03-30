import {
  loadConfig,
  findProviderByKey,
  validateUserApiKey,
  findProviderForModel,
  getNextKeyForProvider,
  Provider,
  ProtocolType,
} from './config';

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

// Route a request based on the API key
export async function routeRequest(ctx: RoutingContext): Promise<ProxyResult> {
  const { apiKey, method, path, body, headers } = ctx;

  let xGoogApiKey = headers?.['x-goog-api-key'] || headers?.['X-Goog-Api-Key'] || headers?.['x-Goog-Api-Key'] || headers?.['X-GOOG-API-KEY'];
  let authHeader = headers?.['Authorization'] || headers?.['authorization'];
  let bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let nvapiKey = bearerToken?.startsWith('nvapi-') ? bearerToken : null;

  // If x-goog-api-key header is present, forward directly to Gemini using default base URL
  if (xGoogApiKey) {
    return rawPassthroughToGeminiDefault(method, path, body, xGoogApiKey);
  }

  // If Bearer token starts with nvapi-, forward directly to NVIDIA using default base URL
  if (nvapiKey) {
    return rawPassthroughToNvidiaDefault(method, path, body, nvapiKey);
  }

  // Check if this is a provider API key
  const provider = findProviderByKey(apiKey);
  if (provider) {
    // For Gemini, we still need to convert the request format
    const model = extractModelFromRequest(method, path, body);
    if (provider.protocolType === 'gemini' && model) {
      const convertedBody = convertRequestToProvider(model, body || {}, provider.protocolType);
      // Use streamGenerateContent for streaming, generateContent for non-streaming
      // Note: body.stream is the original request's stream flag
      const isStreaming = body?.stream;
      const geminiPath = isStreaming
        ? `/models/${model}:streamGenerateContent`
        : `/models/${model}:generateContent`;
      // Return Gemini response directly without conversion
      return passthroughToProvider(provider, method, geminiPath, convertedBody, headers, apiKey);
    }
    return passthroughToProvider(provider, method, path, body, headers, apiKey);
  }

  // Check if this is a valid user API key
  const validation = validateUserApiKey(apiKey);
  if (!validation.valid) {
    return { success: false, error: 'Invalid or expired API key', status: 401 };
  }

  // For user keys, we need to find the target provider based on the model
  const model = extractModelFromRequest(method, path, body);
  if (!model) {
    return { success: false, error: 'Model not specified', status: 400 };
  }

  // Check if model is allowed for this user
  if (validation.allowedModels && validation.allowedModels.length > 0) {
    if (!validation.allowedModels.some(m =>
      model.toLowerCase().includes(m.toLowerCase()) ||
      m.toLowerCase().includes(model.toLowerCase())
    )) {
      return { success: false, error: 'Model not allowed for this API key', status: 403 };
    }
  }

  // Find a provider that supports this model
  const targetProvider = findProviderForModel(model, validation.allowedModels);
  if (!targetProvider) {
    return { success: false, error: `No provider available for model: ${model}`, status: 404 };
  }

  return passthroughToProvider(targetProvider, method, path, body, headers);
}

// Extract model from request (varies by protocol)
function extractModelFromRequest(method: string, path: string, body?: any): string | null {
  // Gemini: /models/{model}:generateContent
  const geminiMatch = path.match(/\/models\/([^:]+):generateContent/);
  if (geminiMatch) {
    return geminiMatch[1];
  }

  // OpenAI/Anthropic/NVIDIA: body.model
  if (body?.model) {
    return body.model;
  }

  // Try to extract from path
  const pathParts = path.split('/');
  const modelPart = pathParts[pathParts.length - 1];
  if (modelPart && !modelPart.includes(':')) {
    return modelPart;
  }

  return null;
}

// Direct passthrough to provider
async function passthroughToProvider(
  provider: Provider,
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>,
  apiKeyOverride?: string
): Promise<ProxyResult> {
  // Use provided API key (for direct provider key passthrough) or get from provider config
  const apiKey = apiKeyOverride || getNextKeyForProvider(provider.id);
  if (!apiKey) {
    return { success: false, error: 'Provider has no API keys configured', status: 500 };
  }

  let url = `${provider.baseUrl}${path}`;
  // Gemini API key goes in query params for streaming
  if (provider.protocolType === 'gemini') {
    url += `?key=${apiKey}`;
  }
  // const headersOut: Record<string, string> = {
  //   'Content-Type': 'application/json',
  //   ...(headers || {}),
  // };

  // Start with default headers, then add auth headers based on protocol
  const headersOut: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // Add auth header based on protocol type
  if (provider.protocolType === 'openai' || provider.protocolType === 'nvidia' || provider.protocolType === 'custom') {
    headersOut['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider.protocolType === 'anthropic') {
    headersOut['Authorization'] = `Bearer ${apiKey}`;
    headersOut['anthropic-version'] = '2023-06-01';
  } else if (provider.protocolType === 'gemini') {
    // delete headersOut['authorization'];
    // delete headersOut['Authorization'];
    headersOut['x-goog-api-key'] = apiKey;
  }
  // Gemini uses API key in query params, handled below

  try {
    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers: headersOut,
    };

    // Add body for POST/PUT/PATCH
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    // console.log(`Routing request to provider ${provider.id} at ${url} with method ${method}`);
    // console.log(`Request headers: ${JSON.stringify(headersOut)}`);
    // console.log(`Request body: ${fetchOptions.body}`);

    const response = await fetch(url, fetchOptions);

    // console.log(`Received response with status ${response.status} from provider ${provider.id}`);
    // console.log(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
    // console.log(`Response body: ${await response.clone().text()}`);

    // Handle streaming responses (check URL path for Gemini streaming)
    const isStreaming = body?.stream || path.includes('streamGenerateContent');
    if (isStreaming) {
      // For Gemini streaming, wrap the newline-JSON stream to proper SSE format
      if (provider.protocolType === 'gemini') {
        return {
          success: true,
          data: wrapGeminiStream(response.body!),
          status: response.status,
        };
      }
      return {
        success: true,
        data: response.body,
        status: response.status,
      };
    }

    // Read response
    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'string' ? data : JSON.stringify(data),
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

// Raw passthrough to NVIDIA - no transformations at all
async function rawPassthroughToNvidia(
  provider: Provider,
  method: string,
  path: string,
  body?: any,
  apiKey?: string
): Promise<ProxyResult> {
  if (!apiKey) {
    return { success: false, error: 'API key required', status: 500 };
  }

  const url = `${provider.baseUrl}${path}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': body?.stream ? 'text/event-stream' : 'application/json',
      },
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle streaming responses
    if (body?.stream) {
      return {
        success: true,
        data: response.body,
        status: response.status,
      };
    }

    // Return raw response - JSON as-is
    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'string' ? data : JSON.stringify(data),
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

// Raw passthrough to Gemini using default base URL (no provider config required)
async function rawPassthroughToGeminiDefault(
  method: string,
  path: string,
  body?: any,
  apiKey?: string
): Promise<ProxyResult> {
  if (!apiKey) {
    return { success: false, error: 'API key required', status: 500 };
  }

  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}${path}?key=${apiKey}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle streaming responses
    if (response.body) {
      return {
        success: true,
        data: response.body,
        status: response.status,
      };
    }

    // Return raw response - JSON as-is
    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'string' ? data : JSON.stringify(data),
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

// Raw passthrough to NVIDIA using default base URL (no provider config required)
async function rawPassthroughToNvidiaDefault(
  method: string,
  path: string,
  body?: any,
  apiKey?: string
): Promise<ProxyResult> {
  if (!apiKey) {
    return { success: false, error: 'API key required', status: 500 };
  }

  const baseUrl = 'https://integrate.api.nvidia.com/v1';
  const url = `${baseUrl}${path}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': body?.stream ? 'text/event-stream' : 'application/json',
      },
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle streaming responses
    if (body?.stream) {
      return {
        success: true,
        data: response.body,
        status: response.status,
      };
    }

    // Return raw response - JSON as-is
    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'string' ? data : JSON.stringify(data),
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

// Raw passthrough to Gemini - no transformations at all
async function rawPassthroughToGemini(
  provider: Provider,
  method: string,
  path: string,
  body?: any,
  apiKey?: string
): Promise<ProxyResult> {
  if (!apiKey) {
    return { success: false, error: 'API key required', status: 500 };
  }

  const url = `${provider.baseUrl}${path}?key=${apiKey}`;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Return raw response - stream as-is or JSON as-is
    if (response.body) {
      return {
        success: true,
        data: response.body,
        status: response.status,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error: typeof data === 'string' ? data : JSON.stringify(data),
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

// Convert OpenAI chat completions request to provider-specific format
export function convertRequestToProvider(model: string, request: any, protocolType: ProtocolType): any {
  if (protocolType === 'gemini') {
    // Convert to Gemini format
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
    // Anthropic uses messages format directly
    return {
      model,
      messages: request.messages,
      stream: request.stream ?? false,
      temperature: request.temperature ?? 0.9,
      max_tokens: request.max_tokens ?? 2048,
    };
  }

  // OpenAI, NVIDIA, custom - pass through with model replaced
  return {
    ...request,
    model,
  };
}

// Convert provider response to OpenAI format
export function convertResponseFromProvider(response: any, protocolType: ProtocolType): any {
  if (protocolType === 'gemini') {
    // Convert Gemini response to OpenAI format
    const candidate = response.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';
    return {
      id: `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.modelVersion || 'gemini',
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  if (protocolType === 'anthropic') {
    // Anthropic response to OpenAI format
    return {
      id: `anthropic-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || 'anthropic',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: response.content?.[0]?.text || '' },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  // OpenAI, NVIDIA, custom - pass through
  return response;
}

// Wrap Gemini's newline-JSON stream to proper SSE data: format
function wrapGeminiStream(inputStream: ReadableStream): ReadableStream {
  const reader = inputStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Gemini returns JSON objects separated by newlines
        // Wrap each as SSE data: event
        controller.enqueue(new TextEncoder().encode(`data: ${trimmed}\n\n`));
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}
