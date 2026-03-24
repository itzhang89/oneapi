import { loadConfig, getNextKey, ProviderType } from './config';
import {
  parseModel,
  ChatCompletionRequest,
  toGeminiRequest,
  toNvidiaRequest,
  toOpenAIRequest,
  toAnthropicRequest,
  fromGeminiResponse,
  fromGeminiStreamChunk,
  fromAnthropicResponse,
  fromAnthropicStreamChunk,
} from './providers';

export interface ProxyResult {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
}

export async function proxyRequest(
  request: ChatCompletionRequest
): Promise<ProxyResult> {
  const { provider, actualModel } = parseModel(request.model);

  if (!provider) {
    return { success: false, error: 'Unknown provider', status: 400 };
  }

  const keyInfo = getNextKey(provider);
  if (!keyInfo) {
    return { success: false, error: `No API key configured for ${provider}`, status: 500 };
  }

  const config = loadConfig();
  const providerConfig = config[provider];

  if (provider === 'openai') {
    return proxyOpenAI(providerConfig.apiBaseUrl, actualModel, request, keyInfo.key);
  }

  if (provider === 'gemini') {
    return proxyGemini(providerConfig.apiBaseUrl, actualModel, request, keyInfo.key);
  }

  if (provider === 'anthropic') {
    return proxyAnthropic(providerConfig.apiBaseUrl, actualModel, request, keyInfo.key);
  }

  if (provider === 'nvidia') {
    return proxyNvidia(providerConfig.apiBaseUrl, actualModel, request, keyInfo.key);
  }

  return { success: false, error: 'Unknown error', status: 500 };
}

async function proxyGemini(
  baseUrl: string,
  model: string,
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ProxyResult> {
  // 根据是否流式选择端点
  const endpoint = request.stream ? 'streamGenerateContent' : 'generateContent';
  const url = `${baseUrl}/${model}:${endpoint}?key=${apiKey}${request.stream ? '&alt=sse' : ''}`;

  const geminiRequest = toGeminiRequest(model, request);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequest),
      // @ts-ignore
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error, status: response.status };
    }

    if (request.stream) {
      // 流式响应需要特殊处理
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const chunk = JSON.parse(line);
                  const transformed = fromGeminiStreamChunk(chunk);
                  if (transformed) {
                    controller.enqueue(new TextEncoder().encode(transformed));
                  }
                } catch {}
              }
            }
          }
          // 发送结束
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        },
      });

      return {
        success: true,
        data: new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      };
    }

    const data = await response.json();
    return { success: true, data: fromGeminiResponse(data) };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

async function proxyNvidia(
  baseUrl: string,
  model: string,
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ProxyResult> {
  const url = `${baseUrl}/chat/completions`;
  const nvidiaRequest = toNvidiaRequest(model, request);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(nvidiaRequest),
      // @ts-ignore
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error, status: response.status };
    }

    if (request.stream) {
      return {
        success: true,
        data: response.body,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

async function proxyOpenAI(
  baseUrl: string,
  model: string,
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ProxyResult> {
  const url = `${baseUrl}/chat/completions`;
  const openaiRequest = toOpenAIRequest(model, request);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiRequest),
      // @ts-ignore
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error, status: response.status };
    }

    if (request.stream) {
      return {
        success: true,
        data: response.body,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}

async function proxyAnthropic(
  baseUrl: string,
  model: string,
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ProxyResult> {
  // Anthropic uses /v1/messages endpoint
  const url = `${baseUrl}/messages`;
  const anthropicRequest = toAnthropicRequest(model, request);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicRequest),
      // @ts-ignore
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error, status: response.status };
    }

    if (request.stream) {
      // Anthropic streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const chunk = JSON.parse(line);
                  const transformed = fromAnthropicStreamChunk(chunk);
                  if (transformed) {
                    controller.enqueue(new TextEncoder().encode(transformed));
                  }
                } catch {}
              }
            }
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        },
      });

      return {
        success: true,
        data: new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      };
    }

    const data = await response.json();
    return { success: true, data: fromAnthropicResponse(data) };
  } catch (error: any) {
    return { success: false, error: error.message, status: 500 };
  }
}
