export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// Gemini API 请求格式转换
export function toGeminiRequest(model: string, request: ChatCompletionRequest) {
  const contents = request.messages.map((msg) => ({
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

// Gemini API 响应转换为 OpenAI 格式
export function fromGeminiResponse(response: any): any {
  const candidate = response.candidates?.[0];
  const content = candidate?.content?.parts?.[0]?.text || '';

  return {
    id: `gemini-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.modelVersion || 'gemini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

// Gemini 流式响应转换
export function fromGeminiStreamChunk(chunk: any): string {
  const candidate = chunk.candidates?.[0];
  const content = candidate?.content?.parts?.[0]?.text || '';

  if (!content) return '';

  return `data: ${JSON.stringify({
    id: `gemini-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'gemini',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  })}\n\n`;
}

// NVIDIA API 转换 (移除 nvidia/ 前缀)
export function toNvidiaRequest(model: string, request: ChatCompletionRequest) {
  // 移除 nvidia/ 前缀获取实际模型名
  const actualModel = model.startsWith('nvidia/') ? model.slice(7) : model;
  return {
    model: actualModel,
    messages: request.messages,
    stream: request.stream ?? false,
    temperature: request.temperature ?? 0.9,
    max_tokens: request.max_tokens ?? 2048,
  };
}

// NVIDIA 流式响应转换
export function fromNvidiaStreamChunk(line: string): string {
  if (!line.startsWith('data: ')) return '';

  try {
    const data = JSON.parse(line.slice(6));
    if (data.choices?.[0]?.delta?.content) {
      return line; // 已经是 OpenAI 格式
    }
  } catch {}

  return '';
}

// OpenAI API 请求转换 (直接透传)
export function toOpenAIRequest(model: string, request: ChatCompletionRequest) {
  return {
    model,
    messages: request.messages,
    stream: request.stream ?? false,
    temperature: request.temperature ?? 0.9,
    max_tokens: request.max_tokens ?? 2048,
  };
}

// Anthropic API 请求转换
export function toAnthropicRequest(model: string, request: ChatCompletionRequest) {
  // Anthropic 使用不同的格式
  return {
    model,
    messages: request.messages,
    stream: request.stream ?? false,
    temperature: request.temperature ?? 0.9,
    max_tokens: request.max_tokens ?? 2048,
  };
}

// Anthropic API 响应转换为 OpenAI 格式
export function fromAnthropicResponse(response: any): any {
  const content = response.content?.[0]?.text || '';

  return {
    id: `anthropic-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model || 'anthropic',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    },
  };
}

// Anthropic 流式响应转换
export function fromAnthropicStreamChunk(chunk: any): string {
  // Anthropic 流式响应格式
  const content = chunk.completion?.content?.[0]?.text ||
                  chunk.completion || '';

  if (!content) return '';

  return `data: ${JSON.stringify({
    id: `anthropic-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: chunk.model || 'anthropic',
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  })}\n\n`;
}

import { ProviderType } from './config';

// 解析 model 字符串，返回 provider 和处理后的 model 名
export function parseModel(model: string): { provider: ProviderType; actualModel: string } {
  // OpenAI 模型 (openai-*)
  if (model.startsWith('openai-')) {
    const actualModel = model.replace('openai-', '');
    return { provider: 'openai', actualModel };
  }

  // Anthropic 模型 (anthropic-*)
  if (model.startsWith('anthropic-')) {
    const actualModel = model.replace('anthropic-', '');
    return { provider: 'anthropic', actualModel };
  }

  // Gemini 模型 (gemini-*)
  if (model.startsWith('gemini-') || model.startsWith('models/gemini-')) {
    const actualModel = model.replace('models/', '');
    return { provider: 'gemini', actualModel };
  }

  // 其他所有模型默认走 NVIDIA (作为 fallback)
  return { provider: 'nvidia', actualModel: model };
}
