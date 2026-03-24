import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ProviderConfig {
  apiBaseUrl: string;
  keys: string[];
  currentIndex: number;
}

export interface UserApiKey {
  key: string;          // API key (hashed stored)
  name: string;         // 名称
  createdAt: number;    // 创建时间
  expiresAt: number | null;  // 过期时间 null=永不过期
  isActive: boolean;
}

export interface ApiKeysConfig {
  masterKey: string;    // 管理密码
  openai: ProviderConfig;
  gemini: ProviderConfig;
  anthropic: ProviderConfig;
  nvidia: ProviderConfig;
  userKeys: UserApiKey[];
}

export type ProviderType = 'openai' | 'gemini' | 'anthropic' | 'nvidia';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'api-keys.json');

// 生成随机 API key
export function generateApiKey(): string {
  return 'sk-' + crypto.randomBytes(24).toString('hex');
}

// Hash API key for storage
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// 验证 API key
export function verifyApiKey(key: string, hashed: string): boolean {
  return hashApiKey(key) === hashed;
}

// 验证 master key
export function verifyMasterKey(key: string): boolean {
  const config = loadConfig();
  return !!(config.masterKey && config.masterKey === key);
}

let cachedConfig: ApiKeysConfig | null = null;

export function loadConfig(): ApiKeysConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // 支持环境变量覆盖
  if (process.env.API_KEYS_JSON) {
    const parsed = JSON.parse(process.env.API_KEYS_JSON) as ApiKeysConfig;
    // masterKey 只从环境变量 TOKEN 读取，忽略配置文件中的值
    parsed.masterKey = process.env.TOKEN || '';
    cachedConfig = parsed;
    return cachedConfig;
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content) as ApiKeysConfig;
    // masterKey 只从环境变量 TOKEN 读取，忽略配置文件中的值
    parsed.masterKey = process.env.TOKEN || '';
    cachedConfig = parsed;
    return cachedConfig;
  }

  // 支持单个环境变量
  if (process.env.GEMINI_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    cachedConfig = {
      masterKey: process.env.TOKEN || '',
      openai: {
        apiBaseUrl: process.env.OPENAI_URL || 'https://api.openai.com/v1',
        keys: process.env.OPENAI_API_KEY ? [process.env.OPENAI_API_KEY] : [],
        currentIndex: 0,
      },
      gemini: {
        apiBaseUrl: process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
        keys: process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [],
        currentIndex: 0,
      },
      anthropic: {
        apiBaseUrl: process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1',
        keys: process.env.ANTHROPIC_API_KEY ? [process.env.ANTHROPIC_API_KEY] : [],
        currentIndex: 0,
      },
      nvidia: {
        apiBaseUrl: process.env.NVIDIA_URL || 'https://integrate.api.nvidia.com/v1',
        keys: process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : [],
        currentIndex: 0,
      },
      userKeys: [],
    };
    return cachedConfig!;
  }

  // 默认配置
  cachedConfig = {
    masterKey: process.env.TOKEN || '',
    openai: {
      apiBaseUrl: 'https://api.openai.com/v1',
      keys: [],
      currentIndex: 0,
    },
    gemini: {
      apiBaseUrl: process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
      keys: [],
      currentIndex: 0,
    },
    anthropic: {
      apiBaseUrl: 'https://api.anthropic.com/v1',
      keys: [],
      currentIndex: 0,
    },
    nvidia: {
      apiBaseUrl: process.env.NVIDIA_URL || 'https://integrate.api.nvidia.com/v1',
      keys: [],
      currentIndex: 0,
    },
    userKeys: [],
  };
  return cachedConfig;
}

export function saveConfig(config: ApiKeysConfig): void {
  cachedConfig = config;

  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getNextKey(provider: ProviderType): { key: string; index: number } | null {
  const config = loadConfig();
  const providerConfig = config[provider];

  if (!providerConfig || providerConfig.keys.length === 0) {
    return null;
  }

  const currentIndex = providerConfig.currentIndex;
  const key = providerConfig.keys[currentIndex];

  // 轮询到下一个
  providerConfig.currentIndex = (currentIndex + 1) % providerConfig.keys.length;
  saveConfig(config);

  return { key, index: currentIndex };
}

// 验证用户 API key
export function validateUserApiKey(key: string): boolean {
  const config = loadConfig();

  // 如果没有设置 master key，则不验证
  if (!config.masterKey) {
    return true;
  }

  const hashedKey = hashApiKey(key);
  const now = Date.now();

  return config.userKeys.some(userKey => {
    if (!userKey.isActive) return false;
    if (userKey.expiresAt && userKey.expiresAt < now) return false;
    return userKey.key === hashedKey;
  });
}

// 创建用户 API key
export function createUserApiKey(name: string, expiresInDays: number | null): UserApiKey {
  const config = loadConfig();
  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);

  // 确保 userKeys 数组存在
  if (!config.userKeys) {
    config.userKeys = [];
  }

  const userKey: UserApiKey = {
    key: hashedKey,
    name,
    createdAt: Date.now(),
    expiresAt: expiresInDays ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : null,
    isActive: true,
  };

  config.userKeys.push(userKey);
  saveConfig(config);

  // 返回原始 key（只在创建时显示一次）
  return { ...userKey, key: rawKey };
}

// 删除用户 API key
export function deleteUserApiKey(rawKey: string): boolean {
  const config = loadConfig();
  const hashedKey = hashApiKey(rawKey);
  const index = config.userKeys.findIndex(k => k.key === hashedKey);

  if (index === -1) return false;

  config.userKeys.splice(index, 1);
  saveConfig(config);
  return true;
}

// 获取用户 API keys（不返回 hash 后的 key）
export function listUserApiKeys(): Omit<UserApiKey, 'key'>[] {
  const config = loadConfig();
  return config.userKeys.map(k => ({
    name: k.name,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    isActive: k.isActive,
  }));
}

// 添加 provider API key
export function addProviderKey(provider: ProviderType, key: string): void {
  const config = loadConfig();
  if (!config[provider]) {
    return;
  }
  if (!config[provider].keys.includes(key)) {
    config[provider].keys.push(key);
    saveConfig(config);
  }
}

// 移除 provider API key
export function removeProviderKey(provider: ProviderType, key: string): void {
  const config = loadConfig();
  if (!config[provider]) {
    return;
  }
  const index = config[provider].keys.indexOf(key);
  if (index !== -1) {
    config[provider].keys.splice(index, 1);
    saveConfig(config);
  }
}

// 更新 provider API Base URL
export function updateProviderBaseUrl(provider: ProviderType, baseUrl: string): void {
  const config = loadConfig();
  if (!config[provider]) {
    return;
  }
  config[provider].apiBaseUrl = baseUrl;
  saveConfig(config);
}

// 获取 provider 配置
export function getProviderConfig(provider: ProviderType): ProviderConfig | null {
  const config = loadConfig();
  return config[provider] || null;
}

// 获取所有 provider 配置
export function getAllProviderConfigs(): Record<ProviderType, ProviderConfig> {
  const config = loadConfig();
  return {
    openai: config.openai,
    gemini: config.gemini,
    anthropic: config.anthropic,
    nvidia: config.nvidia,
  };
}

// Provider 模型信息
export interface ProviderModels {
  provider: ProviderType;
  models: string[];
  error?: string;
}

// 从各 provider 获取支持的模型列表
export async function fetchProviderModels(provider: ProviderType): Promise<ProviderModels> {
  const config = loadConfig();
  const providerConfig = config[provider];

  if (!providerConfig || providerConfig.keys.length === 0) {
    return { provider, models: [], error: 'No API key configured' };
  }

  const apiKey = providerConfig.keys[0];
  const baseUrl = providerConfig.apiBaseUrl;

  try {
    let models: string[] = [];

    if (provider === 'openai') {
      // OpenAI: GET /v1/models
      const response = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return { provider, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      models = data.data?.map((m: any) => m.id).filter((id: string) => !id.startsWith('gpt-4-')) || [];

    } else if (provider === 'anthropic') {
      // Anthropic: 模型列表（Anthropic 没有公开的 models list API，常用模型硬编码）
      models = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-sonnet-latest', 'claude-3-haiku-latest'];

    } else if (provider === 'gemini') {
      // Gemini: GET /v1/models
      const response = await fetch(`${baseUrl}?key=${apiKey}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        return { provider, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      models = data.models?.map((m: any) => m.name.replace('models/', '')).filter(Boolean) || [];

    } else if (provider === 'nvidia') {
      // NVIDIA: 获取可用模型
      const response = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return { provider, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      models = data.data?.map((m: any) => m.id) || [];
    }

    return { provider, models };
  } catch (error: any) {
    return { provider, models: [], error: error.message };
  }
}
