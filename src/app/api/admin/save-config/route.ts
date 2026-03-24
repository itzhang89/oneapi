import { NextRequest, NextResponse } from 'next/server';
import { saveConfig, AppConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json() as AppConfig;

    // Validate config structure
    if (!config.providers) {
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
