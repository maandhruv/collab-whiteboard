"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:1234';

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [roomId, setRoomId] = useState('');
  const [code, setCode] = useState('');

  async function createRoom() {
    setCreating(true); setCreateError('');
    try {
      const res = await fetch(`${API_BASE}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('create failed');
      const data = await res.json();
      try {
        localStorage.setItem('wb-room:'+data.roomId, data.code);
      } catch {}
      router.push(`/room/${data.roomId}?code=${data.code}`);
    } catch (e:any) {
      setCreateError(e.message || 'error');
    } finally { setCreating(false); }
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true); setJoinError('');
    try {
      const res = await fetch(`${API_BASE}/rooms/validate?roomId=${encodeURIComponent(roomId)}&code=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error('Invalid code or room');
      router.push(`/room/${roomId}?code=${code}`);
    } catch (e:any) {
      setJoinError(e.message || 'error');
    } finally { setJoining(false); }
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#111',color:'#fff',fontFamily:'system-ui',padding:24}}>
      <div style={{maxWidth:420,width:'100%',display:'flex',flexDirection:'column',gap:32}}>
        <div>
          <h1 style={{margin:'0 0 8px'}}>Collaborative Whiteboard</h1>
          <p style={{margin:0,opacity:.7,fontSize:14}}>Create a session or join with a room code.</p>
        </div>
        <div style={{display:'flex',gap:12}}>
          <button disabled={creating} onClick={createRoom} style={{flex:1,padding:'12px 16px',background:'#2563eb',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:16}}>
            {creating ? 'Creating…' : 'Create Room'}
          </button>
        </div>
        {createError && <div style={{color:'#f87171',fontSize:13}}>{createError}</div>}
        <form onSubmit={joinRoom} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',gap:8}}>
            <input required value={roomId} onChange={e=>setRoomId(e.target.value.trim())} placeholder="Room ID" style={inputStyle} />
            <input required value={code} onChange={e=>setCode(e.target.value.trim())} placeholder="Code" style={inputStyle} />
          </div>
          <button disabled={joining} type="submit" style={{padding:'10px 14px',background:'#10b981',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:15}}>
            {joining ? 'Joining…' : 'Join Room'}
          </button>
          {joinError && <div style={{color:'#f87171',fontSize:13}}>{joinError}</div>}
        </form>
        <div style={{opacity:.5,fontSize:12}}>Server: {API_BASE}</div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex:1,
  padding:'10px 12px',
  background:'#1f2937',
  border:'1px solid #374151',
  borderRadius:6,
  color:'#fff',
  fontSize:14
};
