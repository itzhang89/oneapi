import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  createUserApiKey,
  deleteUserApiKey,
  listUserApiKeys,
  verifyToken,
  getUserKeyRaw,
  listProviders,
  addProviderKey,
  removeProviderKey,
  updateProvider,
} from '@/lib/config';

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  // Verify token
  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = listUserApiKeys();
  const providers = listProviders();
  return NextResponse.json({ keys, providers });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  // Verify token
  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      // Create user API key
      const { name, expiresInDays, allowedModels } = body;
      if (!name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }
      const newKey = createUserApiKey(
        name,
        expiresInDays || null,
        allowedModels || []
      );
      return NextResponse.json({ success: true, key: newKey });
    }

    if (action === 'delete') {
      // Delete user API key
      const { key } = body;
      if (!key) {
        return NextResponse.json({ error: 'Key is required' }, { status: 400 });
      }
      const success = deleteUserApiKey(key);
      return NextResponse.json({ success });
    }

    if (action === 'addProviderKey') {
      // Add key to provider
      const { providerId, key } = body;
      if (!providerId || !key) {
        return NextResponse.json({ error: 'providerId and key are required' }, { status: 400 });
      }
      const success = addProviderKey(providerId, key);
      return NextResponse.json({ success });
    }

    if (action === 'removeProviderKey') {
      // Remove key from provider
      const { providerId, key } = body;
      if (!providerId || !key) {
        return NextResponse.json({ error: 'providerId and key are required' }, { status: 400 });
      }
      const success = removeProviderKey(providerId, key);
      return NextResponse.json({ success });
    }

    if (action === 'updateProvider') {
      // Update provider
      const { providerId, updates } = body;
      if (!providerId || !updates) {
        return NextResponse.json({ error: 'providerId and updates are required' }, { status: 400 });
      }
      const updated = updateProvider(providerId, updates);
      if (!updated) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }
      return NextResponse.json({ provider: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
