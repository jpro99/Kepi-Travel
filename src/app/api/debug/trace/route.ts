import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function POST(request: Request) {
  const { event, data } = await request.json();

  const traceId = request.headers.get('x-trace-id') || `trace_${Date.now()}`;

  await kv.lpush(traceId, JSON.stringify({ event, data, timestamp: Date.now() }));

  return NextResponse.json({ ok: true, traceId });
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const traceId = url.searchParams.get('id');

    if (!traceId) {
        return NextResponse.json({ error: 'Missing trace ID' }, { status: 400 });
    }

    const trace = await kv.lrange(traceId, 0, -1);

    return NextResponse.json({ trace });
}
