'use client';

type Cursor = { x: number; y: number; name: string; color: string; clientId: number };

export default function Cursors({ cursors, selfId }: { cursors: Cursor[]; selfId: number }) {
  return (
    <>
      {cursors.map((c) => (
        <div
          key={c.clientId}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            transform: 'translate(-10px, -10px)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          {/* simple cursor dot + label */}
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 10,
              background: c.color,
              boxShadow: c.clientId === selfId ? '0 0 0 2px white' : 'none'
            }}
          />
          <div
            style={{
              marginTop: 4,
              padding: '2px 6px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.6)',
              fontSize: 12,
              color: 'white',
              whiteSpace: 'nowrap'
            }}
          >
            {c.name}
          </div>
        </div>
      ))}
    </>
  );
}
