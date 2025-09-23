import dynamic from 'next/dynamic';

// Render Whiteboard only on the client to avoid SSR hydration mismatches
const Whiteboard = dynamic(() => import('@/components/Whiteboard'), { ssr: false });

export default function RoomPage({ params }: { params: { id: string } }) {
  return <Whiteboard roomId={params.id} />;
}
