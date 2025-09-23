import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  const boards = await prisma.whiteboard.findMany({
    where: { owner: { email: session.user.email } },
    orderBy: [{ updatedAt: 'desc' }],
    take: 50,
    select: { id: true, roomId: true, title: true, createdAt: true, updatedAt: true, lastOpenedAt: true, accessCode: true }
  });
  return new Response(JSON.stringify({ boards }), { status: 200 });
}
