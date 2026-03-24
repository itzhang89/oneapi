import { NextRequest, NextResponse } from 'next/server';
import { saveConfig, ApiKeysConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json() as ApiKeysConfig;

    // 验证配置结构
    if (!config.gemini || !config.nvidia) {
      return NextResponse.json(
        { error: 'Invalid config structure' },
        { status: 400 }
      );
    }

    saveConfig(config);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
