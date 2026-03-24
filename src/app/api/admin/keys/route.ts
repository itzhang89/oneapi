import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  createUserApiKey,
  deleteUserApiKey,
  listUserApiKeys,
  updateMasterKey,
  verifyMasterKey,
} from '@/lib/config';

export async function GET(request: NextRequest) {
  const masterKey = request.headers.get('x-master-key');

  // 验证 master key
  const config = loadConfig();
  if (config.masterKey && config.masterKey !== masterKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = listUserApiKeys();
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const masterKey = request.headers.get('x-master-key');
  const config = loadConfig();

  // 验证 master key
  if (config.masterKey && config.masterKey !== masterKey) {
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

    if (action === 'setMasterKey') {
      // 设置 master key
      // 如果已有 master key，需要验证
      if (config.masterKey && config.masterKey !== masterKey) {
        return NextResponse.json({ error: 'Invalid master key' }, { status: 401 });
      }
      if (!body.newMasterKey) {
        return NextResponse.json({ error: 'New master key required' }, { status: 400 });
      }
      updateMasterKey(body.newMasterKey);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
