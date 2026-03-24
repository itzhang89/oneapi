'use client';

import { useState, useEffect } from 'react';

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKeys: string[];
  protocolType: 'openai' | 'gemini' | 'anthropic' | 'nvidia' | 'custom';
  supportedModels: string[];
  lastFetchedAt: number | null;
}

interface UserApiKey {
  key: string;
  name: string;
  allowedModels: string[];
  createdAt: number;
  expiresAt: number | null;
  isActive: boolean;
}

const STORAGE_KEY = 'llm-proxy-token';

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'nvidia', label: 'NVIDIA' },
  { value: 'custom', label: 'Custom (OpenAI Compatible)' },
];

export default function AdminPage() {
  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : ''
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Data
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [userKeys, setUserKeys] = useState<UserApiKey[]>([]);
  const [allModels, setAllModels] = useState<string[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<'providers' | 'keys'>('providers');
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Forms
  const [newProviderForm, setNewProviderForm] = useState({
    id: '',
    name: '',
    baseUrl: '',
    protocolType: 'openai' as Provider['protocolType'],
  });
  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    expiresInDays: '',
    allowedModels: [] as string[],
  });
  const [newProviderKey, setNewProviderKey] = useState<Record<string, string>>({});

  // Load data after authentication
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, token]);

  // Auto-login on mount if token exists in localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY);
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/keys', {
      headers: { 'x-master-key': token },
    });
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers || {});
      setUserKeys(data.keys || []);
      // Collect all models
      const modelsSet = new Set<string>();
      const providers = data.providers as Record<string, Provider> || {};
      Object.values(providers).forEach((p: Provider) => {
        p.supportedModels?.forEach(m => modelsSet.add(m));
      });
      setAllModels(Array.from(modelsSet).sort());
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!token) {
      setMessage('请输入 token');
      return;
    }

    const res = await fetch('/api/admin/keys', {
      headers: { 'x-master-key': token },
    });

    if (res.ok) {
      setIsAuthenticated(true);
      localStorage.setItem(STORAGE_KEY, token);
      setMessage('');
    } else {
      setMessage('token 无效');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserKeys([]);
    setProviders({});
    localStorage.removeItem(STORAGE_KEY);
  };

  // Provider handlers
  const handleCreateProvider = async () => {
    if (!newProviderForm.id || !newProviderForm.name || !newProviderForm.baseUrl) {
      setMessage('请填写完整信息');
      return;
    }

    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify(newProviderForm),
    });

    if (res.ok) {
      setIsCreateProviderOpen(false);
      setNewProviderForm({ id: '', name: '', baseUrl: '', protocolType: 'openai' });
      await loadData();
      setMessage('Provider 创建成功');
    } else {
      const data = await res.json();
      setMessage(data.error || '创建失败');
    }
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider) return;

    const res = await fetch(`/api/providers/${editingProvider.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({
        name: editingProvider.name,
        baseUrl: editingProvider.baseUrl,
        protocolType: editingProvider.protocolType,
      }),
    });

    if (res.ok) {
      setEditingProvider(null);
      await loadData();
      setMessage('Provider 更新成功');
    } else {
      setMessage('更新失败');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('确定要删除这个 Provider 吗？')) return;

    const res = await fetch(`/api/providers/${id}`, {
      method: 'DELETE',
      headers: { 'x-master-key': token },
    });

    if (res.ok) {
      await loadData();
      setMessage('已删除');
    } else {
      setMessage('删除失败');
    }
  };

  const handleAddProviderKey = async (providerId: string) => {
    const key = newProviderKey[providerId];
    if (!key) return;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'addProviderKey', providerId, key }),
    });

    if (res.ok) {
      setNewProviderKey(prev => ({ ...prev, [providerId]: '' }));
      await loadData();
      setMessage('API Key 已添加');
    } else {
      setMessage('添加失败');
    }
  };

  const handleRemoveProviderKey = async (providerId: string, key: string) => {
    if (!confirm('确定要删除这个 API Key 吗？')) return;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({ action: 'removeProviderKey', providerId, key }),
    });

    if (res.ok) {
      await loadData();
      setMessage('已删除');
    } else {
      setMessage('删除失败');
    }
  };

  const handleRefreshModels = async (providerId: string) => {
    const res = await fetch(`/api/providers/${providerId}/refresh`, {
      method: 'POST',
      headers: { 'x-master-key': token },
    });

    if (res.ok) {
      await loadData();
      setMessage('模型列表已刷新');
    } else {
      setMessage('刷新失败');
    }
  };

  // User Key handlers
  const handleCreateKey = async () => {
    if (!newKeyForm.name) {
      setMessage('请输入 Key 名称');
      return;
    }

    const expiresInDays = newKeyForm.expiresInDays ? parseInt(newKeyForm.expiresInDays) : null;

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': token,
      },
      body: JSON.stringify({
        action: 'create',
        name: newKeyForm.name,
        expiresInDays,
        allowedModels: newKeyForm.allowedModels,
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
      setNewKeyForm({ name: '', expiresInDays: '', allowedModels: [] });
      setIsCreateKeyOpen(false);
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

  const formatExpiry = (timestamp: number | null) => {
    if (!timestamp) return '永不过期';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN');
  };

  const isExpired = (timestamp: number | null) => {
    if (!timestamp) return false;
    return timestamp < Date.now();
  };

  const formatLastFetched = (timestamp: number | null) => {
    if (!timestamp) return '从未刷新';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  if (!isAuthenticated) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 400, margin: '100px auto' }}>
          <h2>LLM Proxy 管理</h2>
          <div className="form-group">
            <label>Token</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="输入 token"
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === 'providers' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('providers')}
        >
          Providers
        </button>
        <button
          className={`btn ${activeTab === 'keys' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          API Keys
        </button>
      </div>

      {loading && <p>加载中...</p>}

      {/* Providers Tab */}
      {activeTab === 'providers' && !loading && (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h2>LLM Providers</h2>
              <button className="btn btn-primary btn-small" onClick={() => setIsCreateProviderOpen(true)}>
                + 新增 Provider
              </button>
            </div>

            {Object.keys(providers).length === 0 ? (
              <p style={{ color: '#666' }}>暂无 Providers，请先添加</p>
            ) : (
              Object.entries(providers).map(([id, provider]) => (
                <div key={id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3>{provider.name}</h3>
                      <p style={{ fontSize: 12, color: '#666' }}>
                        类型: {provider.protocolType} | ID: {provider.id}
                      </p>
                      <code style={{ fontSize: 11, display: 'block', marginTop: 5 }}>
                        {provider.baseUrl}
                      </code>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-small" onClick={() => setEditingProvider(provider)}>
                        编辑
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => handleDeleteProvider(id)}>
                        删除
                      </button>
                    </div>
                  </div>

                  {/* API Keys */}
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 12, color: '#666' }}>API Keys</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                      <input
                        type="password"
                        value={newProviderKey[id] || ''}
                        onChange={(e) => setNewProviderKey(prev => ({ ...prev, [id]: e.target.value }))}
                        placeholder="输入新 Key"
                        style={{ flex: 1 }}
                      />
                      <button className="btn btn-small" onClick={() => handleAddProviderKey(id)}>
                        添加
                      </button>
                    </div>
                    <div style={{ fontSize: 11, marginTop: 5 }}>
                      {provider.apiKeys?.length > 0 ? (
                        provider.apiKeys.map((k, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                            <code style={{ opacity: 0.7 }}>{k.slice(0, 8)}...{k.slice(-4)}</code>
                            <button
                              className="btn btn-danger btn-small"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => handleRemoveProviderKey(id, k)}
                            >
                              删除
                            </button>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: '#999' }}>暂无 Keys</span>
                      )}
                    </div>
                  </div>

                  {/* Models */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontSize: 12, color: '#666' }}>
                        支持的模型 ({provider.supportedModels?.length || 0})
                      </label>
                      <button
                        className="btn btn-small"
                        style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => handleRefreshModels(id)}
                      >
                        刷新
                      </button>
                      <span style={{ fontSize: 10, color: '#999' }}>
                        上次刷新: {formatLastFetched(provider.lastFetchedAt)}
                      </span>
                    </div>
                    {provider.supportedModels?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                        {provider.supportedModels.slice(0, 15).map((model, i) => (
                          <code key={i} style={{ fontSize: 9, padding: '2px 5px', background: '#e8f4fd', borderRadius: 3 }}>
                            {model}
                          </code>
                        ))}
                        {provider.supportedModels.length > 15 && (
                          <span style={{ fontSize: 10, color: '#666' }}>...等 {provider.supportedModels.length} 个</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#999' }}>点击刷新获取模型列表</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Usage Instructions */}
          <div className="card" style={{ marginTop: 20 }}>
            <h2>使用说明</h2>
            <p style={{ fontSize: 14, color: '#666' }}>
              1. 添加 Provider 并配置 API Keys<br />
              2. 创建用户 API Key（可限制允许的模型）<br />
              3. 使用用户 API Key 访问代理服务<br />
              <br />
              <strong>API 调用示例：</strong>
              <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, marginTop: 5, fontSize: 12 }}>
{`# Chat Completions (OpenAI 格式)
curl -X POST https://your-domain/v1/chat/completions \\
  -H "Authorization: Bearer $USER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'

# Gemini 原生格式
curl -X POST https://your-domain/v1beta/models/gemini-pro:generateContent \\
  -H "Authorization: Bearer $USER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"contents":[{"parts":[{"text":"hi"}]}]}'

# Provider API Key 直接路由
curl -X POST https://your-domain/v1/chat/completions \\
  -H "Authorization: Bearer $PROVIDER_API_KEY" \\
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'`}
              </pre>
            </p>
          </div>
        </>
      )}

      {/* Keys Tab */}
      {activeTab === 'keys' && !loading && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h2>用户 API Keys</h2>
            <button className="btn btn-primary btn-small" onClick={() => { setCreatedKey(null); setIsCreateKeyOpen(true); }}>
              + 新增
            </button>
          </div>

          {userKeys.length === 0 ? (
            <p style={{ color: '#666' }}>暂无 API Keys</p>
          ) : (
            userKeys.map((k, i) => (
              <div key={i} style={{ marginBottom: 15, padding: 10, background: '#f9f9f9', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong>{k.name}</strong>
                    <br />
                    <small style={{ color: '#888' }}>
                      创建: {new Date(k.createdAt).toLocaleDateString('zh-CN')} |{' '}
                      过期: {formatExpiry(k.expiresAt)}
                      {isExpired(k.expiresAt) && <span style={{ color: 'red' }}> (已过期)</span>}
                    </small>
                    {k.allowedModels?.length > 0 && (
                      <div style={{ marginTop: 5 }}>
                        <small style={{ color: '#666' }}>允许的模型:</small>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                          {k.allowedModels.slice(0, 10).map((m, mi) => (
                            <code key={mi} style={{ fontSize: 10, padding: '1px 4px', background: '#e8f4fd', borderRadius: 2 }}>
                              {m}
                            </code>
                          ))}
                          {k.allowedModels.length > 10 && (
                            <span style={{ fontSize: 10, color: '#666' }}>...等 {k.allowedModels.length} 个</span>
                          )}
                        </div>
                      </div>
                    )}
                    {k.allowedModels?.length === 0 && (
                      <div style={{ marginTop: 5 }}>
                        <small style={{ color: '#4a4' }}>允许所有模型</small>
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleDeleteKey(k.key)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Provider Modal */}
      {isCreateProviderOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: 450, width: '100%', margin: 20 }}>
            <h2 style={{ marginBottom: 15 }}>新增 Provider</h2>
            <div className="form-group">
              <label>Provider ID (唯一标识)</label>
              <input
                type="text"
                value={newProviderForm.id}
                onChange={(e) => setNewProviderForm(prev => ({ ...prev, id: e.target.value }))}
                placeholder="例如: my-openai"
              />
            </div>
            <div className="form-group">
              <label>名称</label>
              <input
                type="text"
                value={newProviderForm.name}
                onChange={(e) => setNewProviderForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: My OpenAI"
              />
            </div>
            <div className="form-group">
              <label>Base URL</label>
              <input
                type="text"
                value={newProviderForm.baseUrl}
                onChange={(e) => setNewProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="form-group">
              <label>协议类型</label>
              <select
                value={newProviderForm.protocolType}
                onChange={(e) => setNewProviderForm(prev => ({ ...prev, protocolType: e.target.value as Provider['protocolType'] }))}
                style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }}
              >
                {PROTOCOL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              <button className="btn btn-primary" onClick={handleCreateProvider}>
                创建
              </button>
              <button className="btn" onClick={() => setIsCreateProviderOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Provider Modal */}
      {editingProvider && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: 450, width: '100%', margin: 20 }}>
            <h2 style={{ marginBottom: 15 }}>编辑 Provider</h2>
            <div className="form-group">
              <label>名称</label>
              <input
                type="text"
                value={editingProvider.name}
                onChange={(e) => setEditingProvider(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="form-group">
              <label>Base URL</label>
              <input
                type="text"
                value={editingProvider.baseUrl}
                onChange={(e) => setEditingProvider(prev => prev ? { ...prev, baseUrl: e.target.value } : null)}
              />
            </div>
            <div className="form-group">
              <label>协议类型</label>
              <select
                value={editingProvider.protocolType}
                onChange={(e) => setEditingProvider(prev => prev ? { ...prev, protocolType: e.target.value as Provider['protocolType'] } : null)}
                style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }}
              >
                {PROTOCOL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              <button className="btn btn-primary" onClick={handleUpdateProvider}>
                保存
              </button>
              <button className="btn" onClick={() => setEditingProvider(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Key Modal */}
      {isCreateKeyOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: 500, width: '100%', margin: 20, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ marginBottom: 15 }}>创建用户 API Key</h2>

            {createdKey && (
              <div style={{ background: '#d4edda', padding: 10, borderRadius: 4, marginBottom: 15 }}>
                <strong>新 API Key（已复制到剪贴板）：</strong>
                <code style={{ display: 'block', marginTop: 5, wordBreak: 'break-all', fontSize: 12 }}>
                  {createdKey}
                </code>
                <button className="btn btn-small" onClick={() => setCreatedKey(null)} style={{ marginTop: 5 }}>
                  我已保存
                </button>
              </div>
            )}

            <div className="form-group">
              <label>Key 名称</label>
              <input
                type="text"
                value={newKeyForm.name}
                onChange={(e) => setNewKeyForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：测试 Key"
              />
            </div>
            <div className="form-group">
              <label>过期天数（留空表示永不过期）</label>
              <input
                type="number"
                value={newKeyForm.expiresInDays}
                onChange={(e) => setNewKeyForm(prev => ({ ...prev, expiresInDays: e.target.value }))}
                placeholder="例如：30"
              />
            </div>
            <div className="form-group">
              <label>允许的模型（留空表示允许全部）</label>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: 10 }}>
                {allModels.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 12 }}>暂无模型，请先添加 Provider 并刷新模型列表</p>
                ) : (
                  allModels.map((model, i) => (
                    <label key={i} style={{ display: 'block', fontSize: 12, marginBottom: 5 }}>
                      <input
                        type="checkbox"
                        checked={newKeyForm.allowedModels.includes(model)}
                        onChange={(e) => {
                          setNewKeyForm(prev => ({
                            ...prev,
                            allowedModels: e.target.checked
                              ? [...prev.allowedModels, model]
                              : prev.allowedModels.filter(m => m !== model),
                          }));
                        }}
                        style={{ marginRight: 8 }}
                      />
                      {model}
                    </label>
                  ))
                )}
              </div>
              {allModels.length > 0 && (
                <div style={{ marginTop: 5 }}>
                  <button
                    className="btn btn-small"
                    onClick={() => setNewKeyForm(prev => ({ ...prev, allowedModels: [...allModels] }))}
                    style={{ marginRight: 5 }}
                  >
                    全选
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => setNewKeyForm(prev => ({ ...prev, allowedModels: [] }))}
                  >
                    清空
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              <button className="btn btn-primary" onClick={handleCreateKey}>
                创建
              </button>
              <button className="btn" onClick={() => setIsCreateKeyOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20,
          padding: '10px 20px', background: message.includes('成功') || message.includes('已复制') ? '#d4edda' : '#f8d7da',
          borderRadius: 4, color: message.includes('成功') || message.includes('已复制') ? '#155724' : '#721c24',
        }}>
          {message}
        </div>
      )}
    </div>
  );
}
