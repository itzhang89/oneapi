'use client';

import { useState, useEffect } from 'react';

interface ProviderConfig {
  apiBaseUrl: string;
  keys: string[];
  currentIndex: number;
}

interface ApiKeysConfig {
  gemini: ProviderConfig;
  nvidia: ProviderConfig;
}

const DEFAULT_CONFIG: ApiKeysConfig = {
  gemini: {
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keys: [],
    currentIndex: 0,
  },
  nvidia: {
    apiBaseUrl: 'https://integrate.api.nvidia.com/v1',
    keys: [],
    currentIndex: 0,
  },
};

export default function AdminPage() {
  const [config, setConfig] = useState<ApiKeysConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form states
  const [geminiKeys, setGeminiKeys] = useState('');
  const [nvidiaKeys, setNvidiaKeys] = useState('');
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          console.error(data.error);
          setConfig(DEFAULT_CONFIG);
        } else {
          // API 只返回 keyCount，我们用空数组初始化表单
          setConfig(DEFAULT_CONFIG);
        }
        // 从 localStorage 读取已保存的 keys
        const savedGemini = localStorage.getItem('gemini_keys') || '';
        const savedNvidia = localStorage.getItem('nvidia_keys') || '';
        setGeminiKeys(savedGemini);
        setNvidiaKeys(savedNvidia);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setConfig(DEFAULT_CONFIG);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage('');

    // 保存到 localStorage
    localStorage.setItem('gemini_keys', geminiKeys);
    localStorage.setItem('nvidia_keys', nvidiaKeys);

    const newConfig: ApiKeysConfig = {
      ...config,
      gemini: {
        ...config.gemini,
        keys: geminiKeys.split('\n').map((k) => k.trim()).filter(Boolean),
      },
      nvidia: {
        ...config.nvidia,
        keys: nvidiaKeys.split('\n').map((k) => k.trim()).filter(Boolean),
      },
    };

    try {
      // 通过环境变量方式保存配置（保存到 JSON 文件需要服务端处理）
      const response = await fetch('/api/admin/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });

      if (response.ok) {
        setMessage('配置已保存！');
        setConfig(newConfig);
      } else {
        setMessage('保存失败');
      }
    } catch {
      setMessage('保存失败');
    }

    setSaving(false);
  };

  const handleImportJson = () => {
    if (!importJson.trim()) {
      setMessage('请输入 JSON 内容');
      return;
    }

    try {
      const parsed = JSON.parse(importJson);

      // 验证结构
      if (!parsed.gemini && !parsed.nvidia) {
        setMessage('JSON 结构无效，需要包含 gemini 或 nvidia 配置');
        return;
      }

      const newConfig: ApiKeysConfig = {
        gemini: {
          apiBaseUrl: parsed.gemini?.apiBaseUrl || DEFAULT_CONFIG.gemini.apiBaseUrl,
          keys: Array.isArray(parsed.gemini?.keys) ? parsed.gemini.keys : [],
          currentIndex: 0,
        },
        nvidia: {
          apiBaseUrl: parsed.nvidia?.apiBaseUrl || DEFAULT_CONFIG.nvidia.apiBaseUrl,
          keys: Array.isArray(parsed.nvidia?.keys) ? parsed.nvidia.keys : [],
          currentIndex: 0,
        },
      };

      setGeminiKeys(newConfig.gemini.keys.join('\n'));
      setNvidiaKeys(newConfig.nvidia.keys.join('\n'));
      setConfig(newConfig);
      setImportJson('');
      setShowImport(false);
      setMessage('JSON 导入成功，请点击"保存配置"确认保存');
    } catch (e) {
      setMessage('JSON 解析失败，请检查格式');
    }
  };

  const handleExportJson = () => {
    const exportConfig = {
      gemini: {
        apiBaseUrl: DEFAULT_CONFIG.gemini.apiBaseUrl,
        keys: geminiKeys.split('\n').map((k) => k.trim()).filter(Boolean),
      },
      nvidia: {
        apiBaseUrl: DEFAULT_CONFIG.nvidia.apiBaseUrl,
        keys: nvidiaKeys.split('\n').map((k) => k.trim()).filter(Boolean),
      },
    };

    const blob = new Blob([JSON.stringify(exportConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-keys.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="container">加载中...</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>LLM Proxy 管理</h1>
        <div>
          <button
            className="btn btn-small"
            onClick={() => setShowImport(!showImport)}
            style={{ marginRight: 10, background: showImport ? '#0051a8' : '#0070f3', color: 'white' }}
          >
            {showImport ? '取消导入' : 'JSON 导入'}
          </button>
          <button
            className="btn btn-small"
            onClick={handleExportJson}
            style={{ background: '#6c757d', color: 'white' }}
          >
            导出 JSON
          </button>
        </div>
      </div>

      {showImport && (
        <div className="card" style={{ border: '2px solid #0070f3' }}>
          <h2>JSON 导入</h2>
          <div className="form-group">
            <label>粘贴 JSON 配置</label>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={`示例:\n{\n  "gemini": {\n    "apiBaseUrl": "https://generativelanguage.googleapis.com/v1beta/models",\n    "keys": ["key1", "key2"]\n  },\n  "nvidia": {\n    "apiBaseUrl": "https://integrate.api.nvidia.com/v1",\n    "keys": ["nvapi-xxx"]\n  }\n}`}
              style={{ minHeight: 150, fontFamily: 'monospace', fontSize: 12 }}
            />
            <div className="hint">
              导入后会填充到下方表单，确认后点击"保存配置"
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleImportJson}>
            导入
          </button>
        </div>
      )}

      <div className="card">
        <h2>Google Gemini</h2>
        <div className="form-group">
          <label>API Keys (每行一个)</label>
          <textarea
            value={geminiKeys}
            onChange={(e) => setGeminiKeys(e.target.value)}
            placeholder="AIza..."
          />
          <div className="hint">
            支持多 key 轮询，每行一个 key
          </div>
        </div>
        <div className="form-group">
          <label>当前 Key 数量: {geminiKeys.split('\n').filter((k) => k.trim()).length}</label>
        </div>
      </div>

      <div className="card">
        <h2>NVIDIA NIM</h2>
        <div className="form-group">
          <label>API Keys (每行一个)</label>
          <textarea
            value={nvidiaKeys}
            onChange={(e) => setNvidiaKeys(e.target.value)}
            placeholder="nvapi-..."
          />
          <div className="hint">
            NVIDIA API Key，每行一个
          </div>
        </div>
        <div className="form-group">
          <label>当前 Key 数量: {nvidiaKeys.split('\n').filter((k) => k.trim()).length}</label>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '保存配置'}
      </button>

      {message && (
        <div style={{ marginTop: 10, color: message.includes('失败') || message.includes('无效') || message.includes('解析') ? 'red' : 'green' }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2>使用说明</h2>
        <p style={{ fontSize: 14, color: '#666' }}>
          1. 可通过"JSON 导入"批量添加配置，或在下方手动添加 keys<br />
          2. 使用时将请求发送到 <code>/v1/chat/completions</code><br />
          3. model 参数示例: <code>gemini-pro</code>, <code>nvidia/llama3-70b</code><br />
          4. 多 key 时自动轮询<br />
          5. 也可通过环境变量 <code>GEMINI_API_KEY</code> 和 <code>NVIDIA_API_KEY</code> 配置
        </p>
      </div>
    </div>
  );
}
