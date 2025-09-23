import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Whiteboard from '@/components/Whiteboard';

export default async function RoomPage({ params, searchParams }: { params: { id: string }; searchParams: { code?: string } }) {
  const session = await getServerSession(authOptions);
  const roomId = params.id;
  if (!session) {
    const qp = searchParams.code ? `?code=${encodeURIComponent(searchParams.code)}` : '';
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/room/${roomId}${qp}`)}`);
  }
  return <Whiteboard roomId={roomId} code={searchParams.code} userName={session!.user?.name || session!.user?.email || 'You'} userId={(session!.user as any).id} />;
}
