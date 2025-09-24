import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Helper to choose upstream base URL (HTTP form) from env
function resolveUpstreamBase() {
  let base = process.env.WS_SERVER_URL || process.env.NEXT_PUBLIC_WS_URL || '';
  if (!base) return '';
  // strip trailing slash
  if (base.endsWith('/')) base = base.slice(0, -1);
  // Convert ws(s):// to http(s):// for REST call
  if (base.startsWith('wss://')) base = 'https://' + base.slice(6);
  else if (base.startsWith('ws://')) base = 'http://' + base.slice(5);
  return base;
}

export async function POST(req: Request) {
  const started = Date.now();
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any)?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const upstreamBase = resolveUpstreamBase();
  if (!upstreamBase) {
    return NextResponse.json({ error: 'server_config', detail: 'WS_SERVER_URL env not set' }, { status: 500 });
  }

  // Optional preferredId from body (ignored if duplicate or invalid)
  let preferredId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.preferredId === 'string') {
      preferredId = body.preferredId.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!preferredId) preferredId = undefined;
    }
  } catch {}

  try {
    const upstreamRes = await fetch(`${upstreamBase}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredId, ownerId: (session.user as any).id })
    });

    const text = await upstreamRes.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!upstreamRes.ok) {
      return NextResponse.json({ error: 'upstream_failed', status: upstreamRes.status, detail: data }, { status: 502 });
    }

    const { roomId, code } = data || {};
    if (!roomId || !code) {
      return NextResponse.json({ error: 'invalid_upstream_payload', detail: data }, { status: 502 });
    }

    // Persist / update board (await to avoid race for first client snapshot)
    await prisma.whiteboard.upsert({
      where: { roomId },
      create: { roomId, ownerId: (session.user as any).id, accessCode: code, title: 'Untitled Board', lastOpenedAt: new Date() },
      update: { ownerId: (session.user as any).id, accessCode: code, lastOpenedAt: new Date() }
    });

    return NextResponse.json({ roomId, code, t: Date.now() - started }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'network', detail: e?.message || String(e) }, { status: 502 });
  }
}
