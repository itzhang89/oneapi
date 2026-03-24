import { NextRequest, NextResponse } from 'next/server';
import { proxyRequest } from '@/lib/router';
import { ChatCompletionRequest } from '@/lib/providers';
import { validateUserApiKey } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    // 验证 API key
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!validateUserApiKey(apiKey || '')) {
      return NextResponse.json(
        { error: 'Invalid or expired API key' },
        { status: 401 }
      );
    }

    const body = await request.json() as ChatCompletionRequest;

    if (!body.model || !body.messages) {
      return NextResponse.json(
        { error: 'Missing model or messages' },
        { status: 400 }
      );
    }

    const result = await proxyRequest(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 }
      );
    }

    // 流式响应
    if (body.stream && result.data instanceof Response) {
      return new Response(result.data.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}

// 支持 OPTIONS 用于 CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
