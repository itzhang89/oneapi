import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  createProvider,
  listProviders,
  verifyToken,
  Provider,
  ProtocolType,
} from '@/lib/config';

export async function GET(request: NextRequest) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  // Verify token
  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providers = listProviders();
  return NextResponse.json({ providers });
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

    // Validate required fields
    if (!body.id || !body.name || !body.baseUrl || !body.protocolType) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, baseUrl, protocolType' },
        { status: 400 }
      );
    }

    const validProtocols: ProtocolType[] = ['openai', 'gemini', 'anthropic', 'nvidia', 'custom'];
    if (!validProtocols.includes(body.protocolType)) {
      return NextResponse.json(
        { error: 'Invalid protocolType' },
        { status: 400 }
      );
    }

    // Check if provider already exists
    const existing = config.providers[body.id];
    if (existing) {
      // Update existing
      existing.name = body.name;
      existing.baseUrl = body.baseUrl;
      existing.protocolType = body.protocolType;
      if (body.apiKeys) {
        existing.apiKeys = body.apiKeys;
      }
      return NextResponse.json({ provider: existing });
    }

    // Create new provider
    const provider = createProvider({
      id: body.id,
      name: body.name,
      baseUrl: body.baseUrl,
      apiKeys: body.apiKeys || [],
      protocolType: body.protocolType,
    });

    return NextResponse.json({ provider });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
