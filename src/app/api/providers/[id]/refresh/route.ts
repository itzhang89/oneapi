import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  getProvider,
  fetchAndCacheModels,
  verifyToken,
} from '@/lib/config';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const provider = getProvider(params.id);
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  try {
    const result = await fetchAndCacheModels(params.id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
