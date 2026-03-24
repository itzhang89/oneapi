'use client';

import { useState, useEffect } from 'react';

interface UserApiKey {
  key: string;
  name: string;
  createdAt: number;
  expiresAt: number | null;
  isActive: boolean;
}

export default function AdminPage() {
  const [masterKey, setMasterKey] = useState('');
  const [newMasterKey, setNewMasterKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // User API keys
  const [userKeys, setUserKeys] = useState<UserApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Load user keys
  const loadUserKeys = async () => {
    const res = await fetch('/api/admin/keys', {
      headers: { 'x-master-key': masterKey },
    });
    if (res.ok) {
      const data = await res.json();
      setUserKeys(data.keys || []);
    }
  };

  const handleLogin = async () => {
    if (!masterKey) {
      setMessage('请输入 Master Key');
      return;
    }

    const res = await fetch('/api/admin/keys', {
      headers: { 'x-master-key': masterKey },
    });

    if (res.ok) {
      setIsAuthenticated(true);
      const data = await res.json();
      setUserKeys(data.keys || []);
      setMessage('');
    } else {
      setMessage('Master Key 无效');
    }
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
        'x-master-key': masterKey,
      },
      body: JSON.stringify({
        action: 'create',
        name: newKeyName,
        expiresInDays,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setCreatedKey(data.key?.key);
      setNewKeyName('');
      setNewKeyExpiry('');
      await loadUserKeys();
      setMessage('API Key 创建成功！请妥善保管，只显示一次');
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
        'x-master-key': masterKey,
      },
      body: JSON.stringify({ action: 'delete', key }),
    });

    if (res.ok) {
      await loadUserKeys();
      setMessage('已删除');
    } else {
      setMessage('删除失败');
    }
  };

  const handleSetMasterKey = async () => {
    if (!newMasterKey) {
      setMessage('请输入新 Master Key');
      return;
    }

    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-master-key': masterKey,
      },
      body: JSON.stringify({
        action: 'setMasterKey',
        newMasterKey,
      }),
    });

    if (res.ok) {
      setMasterKey(newMasterKey);
      setNewMasterKey('');
      setMessage('Master Key 已更新');
    } else {
      setMessage('更新失败');
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

  if (!isAuthenticated) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 400, margin: '100px auto' }}>
          <h2>LLM Proxy 管理</h2>
          <div className="form-group">
            <label>Master Key</label>
            <input
              type="password"
              value={masterKey}
              onChange={(e) => setMasterKey(e.target.value)}
              placeholder="输入 Master Key"
            />
          </div>
          <button className="btn btn-primary" onClick={handleLogin}>
            登录
          </button>
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
        <button className="btn btn-small" onClick={() => setIsAuthenticated(false)}>
          退出
        </button>
      </div>

      {/* Master Key Management */}
      <div className="card">
        <h2>Master Key 设置</h2>
        <div className="form-group">
          <label>设置新 Master Key</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="password"
              value={newMasterKey}
              onChange={(e) => setNewMasterKey(e.target.value)}
              placeholder="新 Master Key（留空则不修改）"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleSetMasterKey}>
              保存
            </button>
          </div>
        </div>
      </div>

      {/* Create User API Key */}
      <div className="card">
        <h2>创建用户 API Key</h2>
        {createdKey && (
          <div style={{ background: '#d4edda', padding: 10, borderRadius: 4, marginBottom: 15 }}>
            <strong>新 API Key（只显示一次）：</strong>
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
          1. 创建用户 API Key 后，用户可以使用该 key 访问代理<br />
          2. 请求时在 Header 中设置: <code>Authorization: Bearer {`{api_key}`}</code><br />
          3. 请求示例:
          <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, marginTop: 5 }}>
{`curl -X POST https://your-domain/v1/chat/completions \\
  -H "Authorization: Bearer sk-xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gemini-3-flash-preview","messages":[{"role":"user","content":"hi"}]}'`}
          </pre>
          4. 模型路由: <code>gemini-*</code> → Gemini, 其他 → NVIDIA
        </p>
      </div>

      {message && (
        <div style={{ marginTop: 10, color: message.includes('成功') ? 'green' : 'red' }}>
          {message}
        </div>
      )}
    </div>
  );
}
