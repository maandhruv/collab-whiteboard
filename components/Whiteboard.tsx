'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { connectY } from '@/lib/yjsClient';

type Path = {
  id: string;
  color: string;
  width: number;
  points: number[];
};

function randomName() {
  const saved = localStorage.getItem('wb-user');
  if (saved) return JSON.parse(saved) as { name:string;color:string };
  const u = { name: 'User-' + Math.random().toString(36).slice(2,6), color: `hsl(${Math.random()*360} 90% 60%)` };
  localStorage.setItem('wb-user', JSON.stringify(u));
  return u;
}

export default function Whiteboard({ roomId }: { roomId: string }) {
  const { doc, provider, awareness } = useMemo(() => connectY(roomId), [roomId]);
  const user = useMemo(() => randomName(), []);
  const yPaths = useMemo(() => doc.getArray<Y.Map<any>>('paths'), [doc]);
  const [paths, setPaths] = useState<Path[]>([]);
  const drawingRef = useRef<{ map: Y.Map<any>; points: Y.Array<number> } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Build paths from CRDT
  const rebuildPaths = useCallback(() => {
    setPaths(
      yPaths.toArray().map(m => ({
        id: m.get('id'),
        color: m.get('color'),
        width: m.get('width'),
        points: (m.get('points') as Y.Array<number>).toArray()
      }))
    );
  }, [yPaths]);

  // Observe any Yjs update (including nested point pushes) and batch via rAF
  useEffect(() => {
    rebuildPaths();
    const handler = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        rebuildPaths();
      });
    };
    doc.on('update', handler);
    return () => {
      doc.off('update', handler);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [doc, rebuildPaths]);

  // Set awareness state & update cursor
  useEffect(() => {
    awareness.setLocalState({ user, cursor: null });
    return () => { awareness.setLocalState(null); };
  }, [awareness, user]);

  // Render remote cursors
  const [cursors, setCursors] = useState<{id:number; x:number; y:number; color:string; name:string}[]>([]);
  useEffect(() => {
    const handler = () => {
      const arr: typeof cursors = [];
      awareness.getStates().forEach((s: any, id: number) => {
        if (!s?.cursor) return;
        arr.push({ id, x: s.cursor.x, y: s.cursor.y, color: s.user.color, name: s.user.name });
      });
      setCursors(arr);
    };
    awareness.on('update', handler);
    handler();
    return () => { awareness.off('update', handler); };
  }, [awareness]);

  // Pointer events
  function pointerPos(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
    const { x, y } = pointerPos(e);
    doc.transact(() => {
      const map = new Y.Map();
      const pts = new Y.Array<number>();
      pts.push([x, y]);
      map.set('id', crypto.randomUUID());
      map.set('color', user.color);
      map.set('width', 2);
      map.set('points', pts);
      yPaths.push([map]);
      drawingRef.current = { map, points: pts };
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const { x, y } = pointerPos(e);
    awareness.setLocalStateField('cursor', { x, y });
    if (drawingRef.current) drawingRef.current.points.push([x, y]);
  };

  const onPointerUp = (e?: React.PointerEvent) => {
    if (e) { try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {} }
    drawingRef.current = null;
  };

  // Debug: verify full-height
  useEffect(() => {
    if (svgRef.current) {
      const r = svgRef.current.getBoundingClientRect();
      // eslint-disable-next-line no-console
      console.log('[whiteboard] svg height', r.height, 'window', window.innerHeight);
    }
  }, []);

  function pathD(p: Path) {
    const pts = p.points;
    if (pts.length < 2) return '';
    let d = `M ${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i+1]}`;
    return d;
  }

  return (
  <div style={{position:'fixed', inset:0, userSelect:'none'}}>
      <div style={{position:'absolute',top:8,left:8,background:'#222',color:'#fff',padding:8,borderRadius:4,fontSize:14}}>
        Room: {roomId}<br/>You: {user.name}
        <div style={{width:10,height:10,background:user.color,borderRadius:'50%',marginTop:4}} />
      </div>
      <svg
        ref={svgRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{width:'100%',height:'100%',touchAction:'none',background:'#111'}}
      >
        {paths.map(p => (
          <path key={p.id} d={pathD(p)} stroke={p.color} strokeWidth={p.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {cursors.map(c => (
          <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
            <circle r={4} fill={c.color} />
            <text x={6} y={-6} fontSize={12} fill="#fff" style={{pointerEvents:'none'}}>{c.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}