import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { requireAdminUserId } from '@/lib/admin/adminAccess';

// Debug-only diagnostic trace store. Gated behind admin auth and namespaced under
// kepi:trace: so callers cannot read/write arbitrary Redis keys via traceId.
const TRACE_KEY_PREFIX = 'kepi:trace:';

function traceKey(traceId: string): string {
  return `${TRACE_KEY_PREFIX}${traceId}`;
}

export async function POST(request: Request) {
  const adminUserId = await requireAdminUserId();
  if (!adminUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { event, data } = await request.json();

  const traceId = request.headers.get('x-trace-id') || `trace_${Date.now()}`;

  await kv.lpush(traceKey(traceId), JSON.stringify({ event, data, timestamp: Date.now() }));

  return NextResponse.json({ ok: true, traceId });
}

export async function GET(request: Request) {
    const adminUserId = await requireAdminUserId();
    if (!adminUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const traceId = url.searchParams.get('id');

    if (!traceId) {
        return NextResponse.json({ error: 'Missing trace ID' }, { status: 400 });
    }

    const trace = await kv.lrange(traceKey(traceId), 0, -1);

    return NextResponse.json({ trace });
}
