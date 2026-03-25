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

  // Check if this is a provider API key (direct passthrough)
  const provider = findProviderByKey(apiKey);
  if (provider) {
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
  // Gemini: /v1beta/models/{model}:generateContent
  const geminiMatch = path.match(/\/v1beta\/models\/([^:]+):generateContent/);
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

  const url = `${provider.baseUrl}${path}`;
  const headersOut: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers || {}),
  };

  // Add auth header based on protocol type
  if (provider.protocolType === 'openai' || provider.protocolType === 'nvidia' || provider.protocolType === 'custom') {
    headersOut['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider.protocolType === 'anthropic') {
    headersOut['Authorization'] = `Bearer ${apiKey}`;
    headersOut['anthropic-version'] = '2023-06-01';
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

    // For Gemini, add API key to query string
    let finalUrl = url;
    if (provider.protocolType === 'gemini' && !url.includes('key=')) {
      const separator = url.includes('?') ? '&' : '?';
      finalUrl = `${url}${separator}key=${apiKey}`;
      // Remove authorization header for Gemini (API key is in URL)
      delete headersOut['authorization'];
      delete headersOut['Authorization'];
    }

    const response = await fetch(finalUrl, fetchOptions);

    // Handle streaming responses
    if (body?.stream) {
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
