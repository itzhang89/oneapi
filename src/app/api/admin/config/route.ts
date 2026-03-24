import { NextResponse } from 'next/server';
import { loadConfig, saveConfig, AppConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = loadConfig();
    // Return provider summary (without exposing keys)
    const providers: Record<string, { baseUrl: string; keyCount: number; protocolType: string }> = {};
    for (const [id, provider] of Object.entries(config.providers)) {
      providers[id] = {
        baseUrl: provider.baseUrl,
        keyCount: provider.apiKeys.length,
        protocolType: provider.protocolType,
      };
    }
    return NextResponse.json({ providers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const config = await request.json() as AppConfig;
    saveConfig(config);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
