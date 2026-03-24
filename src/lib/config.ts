import fs from 'fs';
import path from 'path';

export interface ProviderConfig {
  apiBaseUrl: string;
  keys: string[];
  currentIndex: number;
}

export interface ApiKeysConfig {
  gemini: ProviderConfig;
  nvidia: ProviderConfig;
}

const CONFIG_PATH = path.join(process.cwd(), 'config', 'api-keys.json');

let cachedConfig: ApiKeysConfig | null = null;

export function loadConfig(): ApiKeysConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // 支持环境变量覆盖
  if (process.env.API_KEYS_JSON) {
    cachedConfig = JSON.parse(process.env.API_KEYS_JSON);
    return cachedConfig!;
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    cachedConfig = JSON.parse(content);
    return cachedConfig!;
  }

  // 支持单个环境变量 (GEMINI_API_KEY, GEMINI_URL, NVIDIA_API_KEY)
  if (process.env.GEMINI_API_KEY || process.env.NVIDIA_API_KEY) {
    cachedConfig = {
      gemini: {
        apiBaseUrl: process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
        keys: process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [],
        currentIndex: 0,
      },
      nvidia: {
        apiBaseUrl: process.env.NVIDIA_URL || 'https://integrate.api.nvidia.com/v1',
        keys: process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : [],
        currentIndex: 0,
      },
    };
    return cachedConfig!;
  }

  // 默认配置
  cachedConfig = {
    gemini: {
      apiBaseUrl: process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
      keys: [],
      currentIndex: 0,
    },
    nvidia: {
      apiBaseUrl: process.env.NVIDIA_URL || 'https://integrate.api.nvidia.com/v1',
      keys: [],
      currentIndex: 0,
    },
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

export function getNextKey(provider: 'gemini' | 'nvidia'): { key: string; index: number } | null {
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
