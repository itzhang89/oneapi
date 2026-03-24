import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  createUserApiKey,
  deleteUserApiKey,
  listUserApiKeys,
  verifytoken,
  addProviderKey,
  removeProviderKey,
  updateProviderBaseUrl,
  getAllProviderConfigs,
  fetchProviderModels,
  ProviderType,
} from '@/lib/config';

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-master-key');

  // 验证 token
  const config = loadConfig();
  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = listUserApiKeys();
  const providers = getAllProviderConfigs();
  return NextResponse.json({ keys, providers });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  // 验证 token
  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, name, expiresInDays, key } = body;

    if (action === 'create') {
      // 创建新 key
      if (!name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }
      const newKey = createUserApiKey(name, expiresInDays || null);
      return NextResponse.json({ success: true, key: newKey });
    }

    if (action === 'delete') {
      // 删除 key
      if (!key) {
        return NextResponse.json({ error: 'Key is required' }, { status: 400 });
      }
      const success = deleteUserApiKey(key);
      return NextResponse.json({ success });
    }

    if (action === 'addProviderKey') {
      // 添加 provider API key
      if (!body.provider || !body.key) {
        return NextResponse.json({ error: 'Provider and key are required' }, { status: 400 });
      }
      const validProviders: ProviderType[] = ['openai', 'gemini', 'anthropic', 'nvidia'];
      if (!validProviders.includes(body.provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
      }
      addProviderKey(body.provider, body.key);
      return NextResponse.json({ success: true });
    }

    if (action === 'removeProviderKey') {
      // 移除 provider API key
      if (!body.provider || !body.key) {
        return NextResponse.json({ error: 'Provider and key are required' }, { status: 400 });
      }
      const validProviders: ProviderType[] = ['openai', 'gemini', 'anthropic', 'nvidia'];
      if (!validProviders.includes(body.provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
      }
      removeProviderKey(body.provider, body.key);
      return NextResponse.json({ success: true });
    }

    if (action === 'updateProviderBaseUrl') {
      // 更新 provider Base URL
      if (!body.provider || !body.baseUrl) {
        return NextResponse.json({ error: 'Provider and baseUrl are required' }, { status: 400 });
      }
      const validProviders: ProviderType[] = ['openai', 'gemini', 'anthropic', 'nvidia'];
      if (!validProviders.includes(body.provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
      }
      updateProviderBaseUrl(body.provider, body.baseUrl);
      return NextResponse.json({ success: true });
    }

    if (action === 'fetchModels') {
      // 获取 provider 支持的模型列表
      if (!body.provider) {
        return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
      }
      const validProviders: ProviderType[] = ['openai', 'gemini', 'anthropic', 'nvidia'];
      if (!validProviders.includes(body.provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
      }
      const result = await fetchProviderModels(body.provider);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
