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

type RectShape = {
  id: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  width: number; // stroke width
};

type Connector = {
  id: string;
  color: string;
  x1: number; y1: number; x2: number; y2: number;
  width: number;
};

type Tool = 'pencil' | 'rect' | 'pan' | 'eraser' | 'connector';

function randomName() {
  const saved = localStorage.getItem('wb-user');
  if (saved) return JSON.parse(saved) as { name:string;color:string };
  const u = { name: 'User-' + Math.random().toString(36).slice(2,6), color: `hsl(${Math.random()*360} 90% 60%)` };
  localStorage.setItem('wb-user', JSON.stringify(u));
  return u;
}

const smallBtn: React.CSSProperties = {
  background:'#333',
  color:'#fff',
  border:'1px solid #555',
  padding:'4px 6px',
  borderRadius:4,
  cursor:'pointer',
  fontSize:11,
  lineHeight:1.2
};

const toolBtn: React.CSSProperties = {
  background:'#333',
  color:'#fff',
  border:'1px solid #555',
  padding:'2px 6px',
  borderRadius:4,
  cursor:'pointer',
  fontSize:12,
  textTransform:'none'
};

export default function Whiteboard({ roomId, code, userName, userId }: { roomId: string; code?: string; userName?: string; userId?: string }) {
  // Provide fallback code from localStorage if query lost (e.g. after refresh)
  const effectiveCode = useMemo(() => {
    if (code) return code;
    try { return localStorage.getItem('wb-room:'+roomId) || undefined; } catch { return code; }
  }, [roomId, code]);
  useEffect(() => {
    if (effectiveCode) {
      try { localStorage.setItem('wb-room:'+roomId, effectiveCode); } catch {}
    }
  }, [effectiveCode, roomId]);
  const { doc, provider, awareness } = useMemo(() => connectY(roomId, effectiveCode), [roomId, effectiveCode]);
  const user = useMemo(() => {
    if (userName && userId) {
      // Deterministic color from userId hash
      let hash = 0;
      for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
      const hue = hash % 360;
      return { name: userName, color: `hsl(${hue} 75% 55%)` };
    }
    return randomName();
  }, [userName, userId]);
  const yPaths = useMemo(() => doc.getArray<Y.Map<any>>('paths'), [doc]);
  const yRects = useMemo(() => doc.getArray<Y.Map<any>>('rects'), [doc]);
  const yConnectors = useMemo(() => doc.getArray<Y.Map<any>>('connectors'), [doc]);
  const [paths, setPaths] = useState<Path[]>([]);
  const [rects, setRects] = useState<RectShape[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const drawingRef = useRef<{ map: Y.Map<any>; points: Y.Array<number> } | null>(null);
  const rectRef = useRef<{ map: Y.Map<any> } | null>(null);
  const connectorRef = useRef<{ map: Y.Map<any> } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Build paths from CRDT
  const rebuild = useCallback(() => {
    setPaths(
      yPaths.toArray().map(m => ({
        id: m.get('id'),
        color: m.get('color'),
        width: m.get('width'),
        points: (m.get('points') as Y.Array<number>).toArray()
      }))
    );
    setRects(
      yRects.toArray().map(m => ({
        id: m.get('id'),
        color: m.get('color'),
        x: m.get('x'),
        y: m.get('y'),
        w: m.get('w'),
        h: m.get('h'),
        width: m.get('width')
      }))
    );
    setConnectors(
      yConnectors.toArray().map(m => ({
        id: m.get('id'),
        color: m.get('color'),
        x1: m.get('x1'),
        y1: m.get('y1'),
        x2: m.get('x2'),
        y2: m.get('y2'),
        width: m.get('width')
      }))
    );
  }, [yPaths, yRects, yConnectors]);

  // Observe any Yjs update (including nested point pushes) and batch via rAF
  useEffect(() => {
    rebuild();
    const handler = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        rebuild();
      });
    };
    doc.on('update', handler);
    return () => {
      doc.off('update', handler);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [doc, rebuild]);

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
    const sx = (e.clientX - rect.left - translate.x) / scale;
    const sy = (e.clientY - rect.top - translate.y) / scale;
    return { x: sx, y: sy };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
    const { x, y } = pointerPos(e);
    if (tool === 'pencil') {
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
    } else if (tool === 'rect') {
      doc.transact(() => {
        const map = new Y.Map();
        map.set('id', crypto.randomUUID());
        map.set('color', user.color);
        map.set('x', x);
        map.set('y', y);
        map.set('w', 0);
        map.set('h', 0);
        map.set('width', 2);
        yRects.push([map]);
        rectRef.current = { map };
      });
    } else if (tool === 'connector') {
      doc.transact(() => {
        const map = new Y.Map();
        map.set('id', crypto.randomUUID());
        map.set('color', user.color);
        map.set('x1', x);
        map.set('y1', y);
        map.set('x2', x);
        map.set('y2', y);
        map.set('width', 2);
        yConnectors.push([map]);
        connectorRef.current = { map };
      });
    } else if (tool === 'pan') {
      panRef.current = { startX: e.clientX, startY: e.clientY, origX: translate.x, origY: translate.y };
    } else if (tool === 'eraser') {
      // Hit test (simple): check rects first then paths bounding boxes
      const hitRect = rects.find(r => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h);
      if (hitRect) {
        const idx = yRects.toArray().findIndex(m => m.get('id') === hitRect.id);
        if (idx >= 0) yRects.delete(idx, 1);
        return;
      }
      // Connectors: distance to segment < tolerance
      const tolerance = 6 / scale;
      const hitConn = connectors.find(c => {
        const A = { x: c.x1, y: c.y1 }, B = { x: c.x2, y: c.y2 };
        const len2 = (B.x - A.x)**2 + (B.y - A.y)**2;
        if (len2 === 0) return false;
        let t = ((x - A.x)*(B.x - A.x) + (y - A.y)*(B.y - A.y))/len2;
        t = Math.max(0, Math.min(1, t));
        const projX = A.x + t * (B.x - A.x);
        const projY = A.y + t * (B.y - A.y);
        const dx = projX - x, dy = projY - y;
        return dx*dx + dy*dy < tolerance*tolerance;
      });
      if (hitConn) {
        const idx = yConnectors.toArray().findIndex(m => m.get('id') === hitConn.id);
        if (idx >= 0) yConnectors.delete(idx, 1);
        return;
      }
      // Path hit: naive distance to any point < tolerance
      const tolerance2 = 6 / scale;
      const hitPath = paths.find(p => {
        for (let i = 0; i < p.points.length; i += 2) {
          const dx = p.points[i] - x; const dy = p.points[i+1] - y;
          if (dx*dx + dy*dy < tolerance2 * tolerance2) return true;
        }
        return false;
      });
      if (hitPath) {
        const idx = yPaths.toArray().findIndex(m => m.get('id') === hitPath.id);
        if (idx >= 0) yPaths.delete(idx, 1);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const { x, y } = pointerPos(e);
    awareness.setLocalStateField('cursor', { x, y });
    if (tool === 'pencil' && drawingRef.current) {
      drawingRef.current.points.push([x, y]);
    } else if (tool === 'rect' && rectRef.current) {
      const m = rectRef.current.map;
      m.set('w', x - m.get('x'));
      m.set('h', y - m.get('y'));
    } else if (tool === 'connector' && connectorRef.current) {
      const m = connectorRef.current.map;
      m.set('x2', x);
      m.set('y2', y);
    } else if (tool === 'pan' && panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setTranslate({ x: panRef.current.origX + dx, y: panRef.current.origY + dy });
    }
  };

  const onPointerUp = (e?: React.PointerEvent) => {
    if (e) { try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {} }
    drawingRef.current = null;
    rectRef.current = null;
    connectorRef.current = null;
    panRef.current = null;
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
    <div style={{position:'fixed', inset:0, userSelect:'none', background:'#111', color:'#fff', fontFamily:'system-ui'}}>
      <div style={{position:'absolute',top:8,left:8,background:'#222',color:'#fff',padding:8,borderRadius:4,fontSize:14,minWidth:260}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <div>
            <div>Room: <code style={{background:'#333',padding:'2px 4px',borderRadius:4}}>{roomId}</code></div>
            <div style={{marginTop:2}}>You: {user.name}</div>
            {effectiveCode && (
              <div style={{marginTop:4}}>Code: <code style={{background:'#333',padding:'2px 4px',borderRadius:4}}>{effectiveCode}</code></div>
            )}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {effectiveCode && (
              <button onClick={()=>{
                const link = `${window.location.origin}/room/${roomId}?code=${effectiveCode}`;
                navigator.clipboard.writeText(link).catch(()=>{});
              }} style={smallBtn}>Copy Link</button>
            )}
            {effectiveCode && (
              <button onClick={()=>{
                navigator.clipboard.writeText(effectiveCode).catch(()=>{});
              }} style={smallBtn}>Copy Code</button>
            )}
          </div>
        </div>
        <div style={{width:10,height:10,background:user.color,borderRadius:'50%',marginTop:4}} />
        <div style={{marginTop:8,display:'flex',gap:4,flexWrap:'wrap'}}>
          {['pencil','rect','pan','eraser','connector'].map(t => (
            <button key={t} onClick={()=>setTool(t as Tool)} style={{
              ...toolBtn,
              background: tool===t ? '#555':'#333'
            }}>{t}</button>
          ))}
        </div>
        <div style={{marginTop:6,fontSize:11,opacity:.7}}>Wheel / pinch to zoom. Pan tool or hold tool=pan to move.</div>
      </div>
      <div style={{position:'absolute',top:8,right:8,background:'#222',padding:'4px 8px',borderRadius:4,fontSize:12}}>
        scale {scale.toFixed(2)}
      </div>
      <svg
        ref={svgRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={(e)=>{
          e.preventDefault();
          const rect = svgRef.current!.getBoundingClientRect();
          const wx = (e.clientX - rect.left - translate.x)/scale;
          const wy = (e.clientY - rect.top - translate.y)/scale;
          const delta = e.deltaY < 0 ? 1.1 : 0.9;
          const newScale = Math.min(4, Math.max(0.25, scale * delta));
          const nx = e.clientX - rect.left - wx * newScale;
          const ny = e.clientY - rect.top - wy * newScale;
          setScale(newScale);
          setTranslate({ x: nx, y: ny });
        }}
        style={{width:'100%',height:'100%',touchAction:'none',background:'transparent'}}
      >
        <g transform={`translate(${translate.x} ${translate.y}) scale(${scale})`}>
          {paths.map(p => (
            <path key={p.id} d={pathD(p)} stroke={p.color} strokeWidth={p.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {rects.map(r => (
            <rect key={r.id} x={Math.min(r.x, r.x + r.w)} y={Math.min(r.y, r.y + r.h)} width={Math.abs(r.w)} height={Math.abs(r.h)} stroke={r.color} strokeWidth={r.width} fill="transparent" />
          ))}
          {connectors.map(c => (
            <line key={c.id} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={c.width} />
          ))}
          {cursors.map(c => (
            <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
              <circle r={4/scale} fill={c.color} />
              <text x={6/scale} y={-6/scale} fontSize={12/scale} fill="#fff" style={{pointerEvents:'none'}}>{c.name}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}