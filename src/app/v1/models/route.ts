import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, validateUserApiKey } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      );
    }

    // Validate the API key
    const validation = validateUserApiKey(apiKey);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid or expired API key' },
        { status: 401 }
      );
    }

    const config = loadConfig();
    const models: Array<{ id: string; provider: string; object: string }> = [];

    for (const [providerId, provider] of Object.entries(config.providers)) {
      if (provider.apiKeys.length === 0) continue;

      // Check if user is allowed to access this provider's models
      if (validation.allowedModels && validation.allowedModels.length > 0) {
        // Only include models that match allowed models
        for (const model of provider.supportedModels) {
          if (validation.allowedModels.some(m =>
            model.toLowerCase().includes(m.toLowerCase()) ||
            m.toLowerCase().includes(model.toLowerCase())
          )) {
            models.push({
              id: model,
              provider: providerId,
              object: 'model',
            });
          }
        }
      } else {
        // User has access to all models
        for (const model of provider.supportedModels) {
          models.push({
            id: model,
            provider: providerId,
            object: 'model',
          });
        }
      }
    }

    return NextResponse.json({
      object: 'list',
      data: models,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}
