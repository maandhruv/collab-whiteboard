import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request, { params }: { params: { roomId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const roomId = params.roomId;
  try {
    const body = await req.json().catch(() => ({}));
    let { title } = body as { title?: string };
    if (typeof title !== 'string') {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }
    title = title.trim();
    if (!title) title = 'Untitled Board';
    if (title.length > 120) title = title.slice(0, 120);
    const board = await prisma.whiteboard.findUnique({ where: { roomId }, select: { ownerId: true } });
    if (!board) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (board.ownerId !== (session.user as any).id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const updated = await prisma.whiteboard.update({ where: { roomId }, data: { title }, select: { roomId: true, title: true, updatedAt: true } });
    return NextResponse.json({ board: updated });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
