import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  getProvider,
  updateProvider,
  deleteProvider,
  verifyToken,
  addProviderKey,
  removeProviderKey,
} from '@/lib/config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  return NextResponse.json({ provider });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = await params;
    const updated = updateProvider(id, body);

    if (!updated) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json({ provider: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get('x-master-key');
  const config = loadConfig();

  if (config.token && config.token !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const success = deleteProvider(id);
  if (!success) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
