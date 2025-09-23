import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

const WS_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:1234';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(()=>({}));
    const { preferredId } = body || {};
    // ask ws server to create room, providing ownerId
    const wsRes = await fetch(`${WS_BASE}/rooms`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ preferredId, ownerId: (session.user as any).id }) });
    const data = await wsRes.json();
    if (!wsRes.ok) return NextResponse.json({ error: data.error || 'create failed' }, { status: 500 });
    // Ensure owner assigned if ws server still used placeholder (fallback)
    await prisma.whiteboard.update({ where:{ roomId: data.roomId }, data:{ ownerId: (session.user as any).id } }).catch(()=>{});
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
