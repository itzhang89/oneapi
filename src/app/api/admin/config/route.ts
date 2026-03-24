import { NextResponse } from 'next/server';
import { loadConfig, saveConfig, ApiKeysConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = loadConfig();
    // 不返回 keys 内容，只返回数量
    return NextResponse.json({
      gemini: {
        apiBaseUrl: config.gemini.apiBaseUrl,
        keyCount: config.gemini.keys.length,
        currentIndex: config.gemini.currentIndex,
      },
      nvidia: {
        apiBaseUrl: config.nvidia.apiBaseUrl,
        keyCount: config.nvidia.keys.length,
        currentIndex: config.nvidia.currentIndex,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const config = await request.json() as ApiKeysConfig;
    saveConfig(config);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
