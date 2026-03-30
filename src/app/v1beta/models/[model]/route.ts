import {NextRequest, NextResponse} from 'next/server';

import {routeRequest, ProxyResult} from '@/lib/routing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ model: string }>  }) {
    return handleRequest(request, 'GET', { params });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ model: string }>  }) {
    return handleRequest(request, 'POST', { params });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ model: string }>  }) {
    return handleRequest(request, 'PUT', { params });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ model: string }>  }) {
    return handleRequest(request, 'DELETE', { params });
}

async function handleRequest(request: NextRequest, method: string, { params }: { params: Promise<{ model: string }>  }) {
    try {
        // 构建路径 - Gemini expects /models/{model}:action format
        const { model } = await params;
        const path = '/models/' + model;

        console.log(`Received ${method} request for ${path}`);

        // 提取查询参数
        const query: Record<string, string> = {};
        request.nextUrl.searchParams.forEach((value, key) => {
            query[key] = value;
        });

        // 提取请求头
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // 提取 API 密钥
        const apiKey = extractApiKey(headers, query);
        if (!apiKey) {
            return NextResponse.json({error: 'API key required'}, {status: 401});
        }

        // 解析请求体
        let body: any = undefined;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
            const contentType = headers['content-type'] || '';
            if (contentType.includes('application/json')) {
                body = await request.json();
            } else {
                body = await request.text();
            }
        }

        // 路由请求
        const result: ProxyResult = await routeRequest({
            apiKey,
            method,
            path,
            body,
            headers,
            query
        });

        if (!result.success) {
            return NextResponse.json(
                {error: result.error},
                {status: result.status || 500}
            );
        }

        // 处理流式响应
        if (result.stream) {
            const responseHeaders = new Headers(result.headers || {});
            return new NextResponse(result.stream, {
                status: result.status || 200,
                headers: responseHeaders
            });
        }

        // 处理普通响应
        const responseHeaders: Record<string, string> = result.headers || {};

        return NextResponse.json(result.data, {
            status: result.status || 200,
            headers: responseHeaders
        });

    } catch (error: any) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            {error: 'Internal server error'},
            {status: 500}
        );
    }
}

function extractApiKey(headers: Record<string, string>, query: Record<string, string>): string | null {
    // 从 Authorization header 提取
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    // 从 x-goog-api-key header 提取 (Gemini)
    const googleApiKey = headers['x-goog-api-key'] || headers['X-Goog-Api-Key'];
    if (googleApiKey) {
        return googleApiKey;
    }

    // 从查询参数提取 (Gemini fallback)
    if (query.key) {
        return query.key;
    }

    return null;
}