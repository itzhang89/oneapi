import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type ProtocolType = 'openai' | 'gemini' | 'anthropic' | 'nvidia' | 'custom';

export interface Provider {
  id: string;                    // unique identifier
  name: string;                  // display name
  baseUrl: string;               // API base URL
  apiKeys: string[];             // provider's API keys
  protocolType: ProtocolType;    // protocol type
  supportedModels: string[];     // cached model list
  lastFetchedAt: number | null;  // timestamp of last model refresh
}

export interface UserApiKey {
  key: string;                   // hashed API key
  name: string;
  allowedModels: string[];       // empty = allow all
  createdAt: number;
  expiresAt: number | null;
  isActive: boolean;
}

export interface AppConfig {
  token: string;
  providers: Record<string, Provider>;
  userKeys: UserApiKey[];
}

const CONFIG_PATH = path.join(process.cwd(), 'config', 'api-keys.json');

// Generate random API key
export function generateApiKey(): string {
  return 'sk-' + crypto.randomBytes(24).toString('hex');
}

// Hash API key for storage
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Verify API key
export function verifyApiKey(key: string, hashed: string): boolean {
  return hashApiKey(key) === hashed;
}

// Verify admin token
export function verifyToken(token: string): boolean {
  const config = loadConfig();
  return !!(config.token && config.token === token);
}

// Find which provider owns this API key
export function findProviderByKey(apiKey: string): Provider | null {
  const config = loadConfig();
  for (const provider of Object.values(config.providers)) {
    if (provider.apiKeys.includes(apiKey)) {
      return provider;
    }
  }
  return null;
}

// Validate user API key
export function validateUserApiKey(key: string): { valid: boolean; allowedModels: string[] | null } {
  const config = loadConfig();
  const hashedKey = hashApiKey(key);
  const now = Date.now();

  for (const userKey of config.userKeys) {
    if (!userKey.isActive) continue;
    if (userKey.expiresAt && userKey.expiresAt < now) continue;
    if (userKey.key !== hashedKey) continue;
    return { valid: true, allowedModels: userKey.allowedModels };
  }

  return { valid: false, allowedModels: null };
}

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Support env var override
  if (process.env.API_KEYS_JSON) {
    const parsed = JSON.parse(process.env.API_KEYS_JSON) as AppConfig;
    parsed.token = process.env.TOKEN || parsed.token || '';
    cachedConfig = normalizeConfig(parsed);
    return cachedConfig;
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content) as AppConfig;
    parsed.token = process.env.TOKEN || parsed.token || '';
    cachedConfig = normalizeConfig(parsed);
    return cachedConfig;
  }

  // Build from individual env vars (legacy support)
  cachedConfig = buildConfigFromEnvVars();
  return cachedConfig;
}

// Normalize config to ensure all fields exist
function normalizeConfig(config: AppConfig): AppConfig {
  if (!config.providers) {
    config.providers = {};
  }
  if (!config.userKeys) {
    config.userKeys = [];
  }
  return config;
}

// Build config from individual env vars (backward compatible)
function buildConfigFromEnvVars(): AppConfig {
  const config: AppConfig = {
    token: process.env.TOKEN || '',
    providers: {},
    userKeys: [],
  };

  // OpenAI
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_URL) {
    config.providers.openai = {
      id: 'openai',
      name: 'OpenAI',
      baseUrl: process.env.OPENAI_URL || 'https://api.openai.com/v1',
      apiKeys: process.env.OPENAI_API_KEY ? [process.env.OPENAI_API_KEY] : [],
      protocolType: 'openai',
      supportedModels: [],
      lastFetchedAt: null,
    };
  }

  // Gemini
  if (process.env.GEMINI_API_KEY || process.env.GEMINI_URL) {
    config.providers.gemini = {
      id: 'gemini',
      name: 'Google Gemini',
      baseUrl: process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
      apiKeys: process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [],
      protocolType: 'gemini',
      supportedModels: [],
      lastFetchedAt: null,
    };
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_URL) {
    config.providers.anthropic = {
      id: 'anthropic',
      name: 'Anthropic',
      baseUrl: process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1',
      apiKeys: process.env.ANTHROPIC_API_KEY ? [process.env.ANTHROPIC_API_KEY] : [],
      protocolType: 'anthropic',
      supportedModels: [],
      lastFetchedAt: null,
    };
  }

  // NVIDIA
  if (process.env.NVIDIA_API_KEY || process.env.NVIDIA_URL) {
    config.providers.nvidia = {
      id: 'nvidia',
      name: 'NVIDIA',
      baseUrl: process.env.NVIDIA_URL || 'https://integrate.api.nvidia.com/v1',
      apiKeys: process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : [],
      protocolType: 'nvidia',
      supportedModels: [],
      lastFetchedAt: null,
    };
  }

  return config;
}

export function saveConfig(config: AppConfig): void {
  cachedConfig = config;

  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Get next API key for a provider (round-robin)
export function getNextKeyForProvider(providerId: string): string | null {
  const config = loadConfig();
  const provider = config.providers[providerId];

  if (!provider || provider.apiKeys.length === 0) {
    return null;
  }

  // Simple round-robin - for each provider, track current index
  // For now, just return the first key
  return provider.apiKeys[0];
}

// Find provider that supports a model
export function findProviderForModel(model: string, allowedModels: string[] | null): Provider | null {
  const config = loadConfig();

  // If allowedModels is specified, only consider those
  for (const provider of Object.values(config.providers)) {
    if (provider.apiKeys.length === 0) continue;

    const models = provider.supportedModels;
    if (models.length === 0) {
      // If provider has no cached models, allow routing to it (when user has no restrictions)
      if (!allowedModels || allowedModels.length === 0) {
        return provider;
      }
      continue;
    }

    // Check if model matches this provider's supported models
    const modelMatches = models.some(m =>
      model.toLowerCase().includes(m.toLowerCase()) ||
      m.toLowerCase().includes(model.toLowerCase())
    );

    if (modelMatches) {
      // Check if model is allowed for this user
      if (!allowedModels || allowedModels.length === 0 || allowedModels.includes(model)) {
        return provider;
      }
    }
  }

  return null;
}

// === Provider CRUD ===

export function createProvider(provider: Omit<Provider, 'supportedModels' | 'lastFetchedAt'>): Provider {
  const config = loadConfig();
  const newProvider: Provider = {
    ...provider,
    supportedModels: [],
    lastFetchedAt: null,
  };
  config.providers[provider.id] = newProvider;
  saveConfig(config);
  return newProvider;
}

export function updateProvider(id: string, updates: Partial<Provider>): Provider | null {
  const config = loadConfig();
  if (!config.providers[id]) return null;

  config.providers[id] = { ...config.providers[id], ...updates };
  saveConfig(config);
  return config.providers[id];
}

export function deleteProvider(id: string): boolean {
  const config = loadConfig();
  if (!config.providers[id]) return false;
  delete config.providers[id];
  saveConfig(config);
  return true;
}

export function getProvider(id: string): Provider | null {
  const config = loadConfig();
  return config.providers[id] || null;
}

export function listProviders(): Record<string, Provider> {
  const config = loadConfig();
  return { ...config.providers };
}

// === Provider API Key Management ===

export function addProviderKey(providerId: string, key: string): boolean {
  const config = loadConfig();
  const provider = config.providers[providerId];
  if (!provider) return false;
  if (!provider.apiKeys.includes(key)) {
    provider.apiKeys.push(key);
    saveConfig(config);
  }
  return true;
}

export function removeProviderKey(providerId: string, key: string): boolean {
  const config = loadConfig();
  const provider = config.providers[providerId];
  if (!provider) return false;
  const index = provider.apiKeys.indexOf(key);
  if (index !== -1) {
    provider.apiKeys.splice(index, 1);
    saveConfig(config);
    return true;
  }
  return false;
}

// === User API Key CRUD ===

export function createUserApiKey(name: string, expiresInDays: number | null, allowedModels: string[] = []): UserApiKey {
  const config = loadConfig();
  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);

  const userKey: UserApiKey = {
    key: hashedKey,
    name,
    allowedModels,
    createdAt: Date.now(),
    expiresAt: expiresInDays ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : null,
    isActive: true,
  };

  config.userKeys.push(userKey);
  saveConfig(config);

  // Return with raw key (only shown once)
  return { ...userKey, key: rawKey };
}

export function deleteUserApiKey(rawKey: string): boolean {
  const config = loadConfig();
  const hashedKey = hashApiKey(rawKey);
  const index = config.userKeys.findIndex(k => k.key === hashedKey);

  if (index === -1) return false;

  config.userKeys.splice(index, 1);
  saveConfig(config);
  return true;
}

// Delete user API key by name (used by admin since name is the identifier returned to UI)
export function deleteUserApiKeyByName(name: string): boolean {
  const config = loadConfig();
  const index = config.userKeys.findIndex(k => k.name === name);

  if (index === -1) return false;

  config.userKeys.splice(index, 1);
  saveConfig(config);
  return true;
}

export function listUserApiKeys(): Omit<UserApiKey, 'key'>[] {
  const config = loadConfig();
  return config.userKeys.map(k => ({
    name: k.name,
    allowedModels: k.allowedModels,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    isActive: k.isActive,
  }));
}

export function getUserKeyRaw(key: string): UserApiKey | null {
  const config = loadConfig();
  const hashedKey = hashApiKey(key);
  return config.userKeys.find(k => k.key === hashedKey) || null;
}

// === Model Fetching ===

export interface ProviderModels {
  provider: string;
  models: string[];
  error?: string;
}

// Fetch models from a provider and update cache
export async function fetchAndCacheModels(providerId: string): Promise<ProviderModels> {
  const config = loadConfig();
  const provider = config.providers[providerId];

  if (!provider) {
    return { provider: providerId, models: [], error: 'Provider not found' };
  }

  if (provider.apiKeys.length === 0) {
    return { provider: providerId, models: [], error: 'No API key configured' };
  }

  const apiKey = provider.apiKeys[0];

  try {
    let models: string[] = [];

    if (provider.protocolType === 'openai' || provider.protocolType === 'custom') {
      // OpenAI compatible: GET /v1/models
      const response = await fetch(`${provider.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return { provider: providerId, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      models = data.data?.map((m: any) => m.id).filter(Boolean) || [];

    } else if (provider.protocolType === 'gemini') {
      // Gemini: GET /v1beta/models (append /models to baseUrl)
      const base = provider.baseUrl.replace(/\/$/, ''); // remove trailing slash
      const url = `${base}/models?key=${apiKey}`;
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        return { provider: providerId, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      models = data.models?.map((m: any) => m.name.replace('models/', '')).filter(Boolean) || [];

    } else if (provider.protocolType === 'anthropic') {
      // Anthropic: hardcoded list (no public models API)
      models = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-sonnet-latest', 'claude-3-haiku-latest'];

    } else if (provider.protocolType === 'nvidia') {
      // NVIDIA: GET /v1/models
      const response = await fetch(`${provider.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return { provider: providerId, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      models = data.data?.map((m: any) => m.id) || [];
    }

    // Update cache
    provider.supportedModels = models;
    provider.lastFetchedAt = Date.now();
    saveConfig(config);

    return { provider: providerId, models };
  } catch (error: any) {
    return { provider: providerId, models: [], error: error.message };
  }
}

// Get all models across all providers (for admin UI)
export function getAllModels(): string[] {
  const config = loadConfig();
  const modelsSet = new Set<string>();

  for (const provider of Object.values(config.providers)) {
    for (const model of provider.supportedModels) {
      modelsSet.add(model);
    }
  }

  return Array.from(modelsSet).sort();
}

// Check if provider models need refresh (older than 24 hours)
export function needsModelRefresh(providerId: string): boolean {
  const config = loadConfig();
  const provider = config.providers[providerId];

  if (!provider) return false;
  if (!provider.lastFetchedAt) return true;

  const age = Date.now() - provider.lastFetchedAt;
  return age > 24 * 60 * 60 * 1000; // 24 hours
}

// Refresh all stale provider models
export async function refreshStaleModels(): Promise<void> {
  const config = loadConfig();

  for (const providerId of Object.keys(config.providers)) {
    if (needsModelRefresh(providerId)) {
      await fetchAndCacheModels(providerId);
    }
  }
}
