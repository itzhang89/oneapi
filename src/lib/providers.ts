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

// NVIDIA API 转换
export function toNvidiaRequest(model: string, request: ChatCompletionRequest) {
  return {
    model: model,
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

// Gemini 模型名映射 (OpenAI style -> Gemini API style)
const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-flash': 'gemini-2.0-flash',
  'gemini-1.5-flash': 'gemini-2.0-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
};

// NVIDIA 模型名映射 (OpenAI style -> NVIDIA NIM style)
const NVIDIA_MODEL_MAP: Record<string, string> = {
  'nvidia/llama3-70b': 'meta/llama-3.1-70b-instruct',
  'nvidia/llama3-8b': 'meta/llama-3.1-8b-instruct',
};

// 解析 model 字符串，返回 provider 和处理后的 model 名
export function parseModel(model: string): { provider: 'gemini' | 'nvidia' | null; actualModel: string } {
  if (model.startsWith('nvidia/')) {
    // NVIDIA 模型映射
    const mappedModel = NVIDIA_MODEL_MAP[model] || model;
    return { provider: 'nvidia', actualModel: mappedModel };
  }

  // gemini-* 或 models/gemini-* 都归为 gemini
  if (model.startsWith('gemini-') || model.startsWith('models/gemini-')) {
    // 映射模型名
    const mappedModel = GEMINI_MODEL_MAP[model] || model;
    // 移除 models/ 前缀
    const actualModel = mappedModel.replace('models/', '');
    return { provider: 'gemini', actualModel };
  }

  // 默认尝试 gemini，映射模型名
  const mappedModel = GEMINI_MODEL_MAP[model] || model;
  return { provider: 'gemini', actualModel: mappedModel };
}
