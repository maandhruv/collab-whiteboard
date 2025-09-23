'use client';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

// Use lowercase path to match actual filename
const Whiteboard = dynamic(() => import('@/components/Whiteboard'), { ssr: false });

export default function RoomPage({ params }: { params: { id: string } }) {
  const search = useSearchParams();
  const code = search.get('code') || undefined;
  return <Whiteboard roomId={params.id} code={code} />;
}
