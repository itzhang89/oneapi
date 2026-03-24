'use client';

import { useState, useEffect } from 'react';

interface UserApiKey {
  key: string;
  name: string;
  createdAt: number;
  expiresAt: number | null;
  isActive: boolean;
}

interface ProviderConfig {
  apiBaseUrl: string;
  keys: string[];
  currentIndex: number;
}

interface ProviderModels {
  provider: string;
  models: string[];
  error?: string;
}

interface ProvidersConfig {
  openai: ProviderConfig;
  gemini: ProviderConfig;
  anthropic: ProviderConfig;
  nvidia: ProviderConfig;
}

const PROVIDERS: { name: string; key: 'openai' | 'gemini' | 'anthropic' | 'nvidia'; prefix: string; defaultUrl: string }[] = [
  { name: 'OpenAI', key: 'openai', prefix: 'openai-', defaultUrl: 'https://api.openai.com/v1' },
  { name: 'Gemini', key: 'gemini', prefix: 'gemini-', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models' },
  { name: 'Anthropic', key: 'anthropic', prefix: 'anthropic-', defaultUrl: 'https://api.anthropic.com/v1' },
  { name: 'NVIDIA', key: 'nvidia', prefix: '', defaultUrl: 'https://integrate.api.nvidia.com/v1' },
];

export default function AdminPage() {
  const [token, settoken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // User API keys
  const [userKeys, setUserKeys] = useState<UserApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Providers
  const [providers, setProviders] = useState<ProvidersConfig | null>(null);
  const [newProviderKeys, setNewProviderKeys] = useState<Record<string, string>>({});
  const [editingBaseUrl, setEditingBaseUrl] = useState<string | null>(null);
  const [tempBaseUrl, setTempBaseUrl] = useState('');
  const [providerModels, setProviderModels] = useState<Record<string, ProviderModels>>({});
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);

  // Load data after authentication
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, token]);

  const loadData = async () => {
    const res = await fetch('/api/admin/keys', {
      headers: { 'x-master-key': token },
    });
    if (res.ok) {
      const data = await res.json();
      setUserKeys(data.keys || []);
      setProviders(data.providers || null);
    }
  };

  const handleLogin = async () => {
    if (!token) {
      setMessage('请输入 Master Key');
      return;
    }

    const res = await fetch('/api/admin/keys', {
      headers: { 'x-master-key': token },
    });

    if (res.ok) {
      setIsAuthenticated(true);
      const data = await res.json();
      setUserKeys(data.keys || []);
      setProviders(data.providers || null);
      setMessage('');
    } else {
      setMessage('Master Key 无效');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserKeys([]);
    setProviders(null);
  };

  const handleCreateKey = async () => {
    if (!newKeyName) {
      setMessage('请输入 Key 名称');
      return;
    }

    const expiresInDays = newKeyExpiry ? parseInt(newKeyExpiry) : null;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({
        action: 'create',
        name: newKeyName,
        expiresInDays,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const newKey = data.key?.key;
      if (newKey) {
        await navigator.clipboard.writeText(newKey);
        setCreatedKey(newKey);
        setMessage('API Key 已创建并复制到剪贴板！');
      }
      setNewKeyName('');
      setNewKeyExpiry('');
      await loadData();
    } else {
      setMessage('创建失败');
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (!confirm('确定要删除这个 API Key 吗？')) return;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'delete', key }),
    });

    if (res.ok) {
      await loadData();
      setMessage('已删除');
    } else {
      setMessage('删除失败');
    }
  };

  const handleAddProviderKey = async (providerKey: string) => {
    const key = newProviderKeys[providerKey];
    if (!key) return;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'addProviderKey', provider: providerKey, key }),
    });

    if (res.ok) {
      setNewProviderKeys(prev => ({ ...prev, [providerKey]: '' }));
      await loadData();
      setMessage(`${providerKey} API Key 已添加`);
    } else {
      setMessage('添加失败');
    }
  };

  const handleRemoveProviderKey = async (providerKey: string, key: string) => {
    if (!confirm('确定要删除这个 API Key 吗？')) return;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'removeProviderKey', provider: providerKey, key }),
    });

    if (res.ok) {
      await loadData();
      setMessage('已删除');
    } else {
      setMessage('删除失败');
    }
  };

  const handleUpdateBaseUrl = async (providerKey: string) => {
    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'updateProviderBaseUrl', provider: providerKey, baseUrl: tempBaseUrl }),
    });

    if (res.ok) {
      setEditingBaseUrl(null);
      await loadData();
      setMessage('Base URL 已更新');
    } else {
      setMessage('更新失败');
    }
  };

  const handleFetchModels = async (providerKey: string) => {
    setFetchingModels(providerKey);
    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'fetchModels', provider: providerKey }),
    });

    if (res.ok) {
      const data = await res.json();
      setProviderModels(prev => ({ ...prev, [providerKey]: data }));
    } else {
      setProviderModels(prev => ({ ...prev, [providerKey]: { provider: providerKey, models: [], error: 'Failed to fetch' } }));
    }
    setFetchingModels(null);
  };

  const startEditBaseUrl = (providerKey: string, currentUrl: string) => {
    setEditingBaseUrl(providerKey);
    setTempBaseUrl(currentUrl);
  };

  const formatExpiry = (timestamp: number | null) => {
    if (!timestamp) return '永不过期';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN');
  };

  const isExpired = (timestamp: number | null) => {
    if (!timestamp) return false;
    return timestamp < Date.now();
  };

  if (!isAuthenticated) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 400, margin: '100px auto' }}>
          <h2>LLM Proxy 管理</h2>
          <div className="form-group">
            <label>Master Key</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="password"
                value={token}
                onChange={(e) => settoken(e.target.value)}
                placeholder="输入 Master Key"
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleLogin}>
              登录
            </button>
          </div>
          {message && (
            <div style={{ marginTop: 10, color: 'red' }}>{message}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>LLM Proxy 管理</h1>
        <button className="btn btn-small" onClick={handleLogout}>
          退出
        </button>
      </div>

      {/* Provider Keys Management */}
      <div className="card">
        <h2>LLM Provider 配置</h2>
        {providers && PROVIDERS.map(provider => (
          <div key={provider.key} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #eee' }}>
            <h3 style={{ marginBottom: 10 }}>{provider.name}</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#666' }}>API Base URL</label>
              {editingBaseUrl === provider.key ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    value={tempBaseUrl}
                    onChange={(e) => setTempBaseUrl(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-small btn-primary" onClick={() => handleUpdateBaseUrl(provider.key)}>保存</button>
                  <button className="btn btn-small" onClick={() => setEditingBaseUrl(null)}>取消</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '5px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                    {providers[provider.key]?.apiBaseUrl || provider.defaultUrl}
                  </code>
                  <button className="btn btn-small" onClick={() => startEditBaseUrl(provider.key, providers[provider.key]?.apiBaseUrl || provider.defaultUrl)}>
                    编辑
                  </button>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#666' }}>API Keys</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="password"
                  value={newProviderKeys[provider.key] || ''}
                  onChange={(e) => setNewProviderKeys(prev => ({ ...prev, [provider.key]: e.target.value }))}
                  placeholder="输入新 Key"
                  style={{ flex: 1 }}
                />
                <button className="btn btn-small" onClick={() => handleAddProviderKey(provider.key)}>
                  添加
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              {providers[provider.key]?.keys?.length > 0 ? (
                providers[provider.key].keys.map((k, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #eee' }}>
                    <code style={{ opacity: 0.7 }}>{k.slice(0, 8)}...{k.slice(-4)}</code>
                    <button className="btn btn-danger btn-small" onClick={() => handleRemoveProviderKey(provider.key, k)}>
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <span style={{ color: '#999' }}>暂无 Keys</span>
              )}
            </div>
            {/* Available Models */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                <label style={{ fontSize: 12, color: '#666' }}>支持的模型</label>
                <button
                  className="btn btn-small"
                  onClick={() => handleFetchModels(provider.key)}
                  disabled={fetchingModels === provider.key || providers[provider.key]?.keys?.length === 0}
                >
                  {fetchingModels === provider.key ? '加载中...' : '刷新模型列表'}
                </button>
              </div>
              {providerModels[provider.key]?.error ? (
                <span style={{ color: 'red', fontSize: 11 }}>{providerModels[provider.key].error}</span>
              ) : providerModels[provider.key]?.models?.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {providerModels[provider.key].models.slice(0, 20).map((model, i) => (
                    <code key={i} style={{ fontSize: 10, padding: '2px 6px', background: '#e8f4fd', borderRadius: 3 }}>
                      {model}
                    </code>
                  ))}
                  {providerModels[provider.key].models.length > 20 && (
                    <span style={{ fontSize: 10, color: '#666' }}>...等 {providerModels[provider.key].models.length} 个模型</span>
                  )}
                </div>
              ) : (
                <span style={{ color: '#999', fontSize: 11 }}>点击"刷新模型列表"获取可用模型</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create User API Key */}
      <div className="card">
        <h2>创建用户 API Key</h2>
        {createdKey && (
          <div style={{ background: '#d4edda', padding: 10, borderRadius: 4, marginBottom: 15 }}>
            <strong>新 API Key（已复制到剪贴板）：</strong>
            <code style={{ display: 'block', marginTop: 5, wordBreak: 'break-all' }}>
              {createdKey}
            </code>
            <button
              className="btn btn-small"
              onClick={() => setCreatedKey(null)}
              style={{ marginTop: 5 }}
            >
              我已保存
            </button>
          </div>
        )}
        <div className="form-group">
          <label>Key 名称</label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="例如：测试 Key"
          />
        </div>
        <div className="form-group">
          <label>过期天数（留空表示永不过期）</label>
          <input
            type="number"
            value={newKeyExpiry}
            onChange={(e) => setNewKeyExpiry(e.target.value)}
            placeholder="例如：30"
          />
        </div>
        <button className="btn btn-primary" onClick={handleCreateKey}>
          创建
        </button>
      </div>

      {/* User API Keys List */}
      <div className="card">
        <h2>用户 API Keys</h2>
        {userKeys.length === 0 ? (
          <p style={{ color: '#666' }}>暂无 API Keys</p>
        ) : (
          <div className="key-list">
            {userKeys.map((k, i) => (
              <div key={i} className="key-item">
                <div>
                  <strong>{k.name}</strong>
                  <br />
                  <small style={{ color: '#888' }}>
                    创建于: {new Date(k.createdAt).toLocaleDateString('zh-CN')} |
                    过期: {formatExpiry(k.expiresAt)}
                    {isExpired(k.expiresAt) && <span style={{ color: 'red' }}> (已过期)</span>}
                  </small>
                </div>
                <button
                  className="btn btn-danger btn-small"
                  onClick={() => handleDeleteKey(k.key)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2>使用说明</h2>
        <p style={{ fontSize: 14, color: '#666' }}>
          1. 配置各 Provider 的 API Keys（支持多个 Key 轮询）<br />
          2. 创建用户 API Key 后，用户可以使用该 key 访问代理<br />
          3. 请求时在 Header 中设置: <code>Authorization: Bearer {`{api_key}`}</code><br />
          4. 请求示例:
          <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, marginTop: 5 }}>
{`curl -X POST https://your-domain/v1/chat/completions \\
  -H "Authorization: Bearer sk-xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gemini-3-flash-preview","messages":[{"role":"user","content":"hi"}]}'`}
          </pre>
          5. 模型路由:<br />
          &nbsp;&nbsp;<code>openai-*</code> → OpenAI<br />
          &nbsp;&nbsp;<code>gemini-*</code> → Gemini<br />
          &nbsp;&nbsp;<code>anthropic-*</code> → Anthropic<br />
          &nbsp;&nbsp;其他 → NVIDIA (fallback)
        </p>
      </div>

      {message && (
        <div style={{ marginTop: 10, color: message.includes('成功') || message.includes('已复制') ? 'green' : 'red' }}>
          {message}
        </div>
      )}
    </div>
  );
}
