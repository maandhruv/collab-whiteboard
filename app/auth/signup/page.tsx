"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password, name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      // auto sign in
      const si = await signIn('credentials', { redirect:false, email, password });
      if (si?.error) throw new Error(si.error);
      window.location.href = '/';
    } catch (err:any) {
      setError(err.message || 'Error');
    } finally { setLoading(false); }
  }

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={card}>
        <h1 style={{margin:0}}>Sign Up</h1>
        <input style={input} type="text" placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)} />
        <input style={input} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <input style={input} type="password" placeholder="Password (min 8)" value={password} onChange={e=>setPassword(e.target.value)} required />
        <button disabled={loading} style={btn} type="submit">{loading? 'Creating…':'Create Account'}</button>
        {error && <div style={{color:'#f87171',fontSize:13}}>{error}</div>}
        <div style={{fontSize:12,opacity:.7,marginTop:8}}>
          Have an account? <Link href="/auth/signin" style={{color:'#93c5fd'}}>Sign In</Link>
        </div>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#111',color:'#fff',fontFamily:'system-ui',padding:24};
const card: React.CSSProperties = {background:'#1f2937',padding:32,borderRadius:12,display:'flex',flexDirection:'column',gap:12,width:320,boxShadow:'0 4px 12px rgba(0,0,0,.4)'};
const input: React.CSSProperties = {padding:'10px 12px',background:'#111',border:'1px solid #374151',borderRadius:6,color:'#fff'};
const btn: React.CSSProperties = {padding:'10px 14px',background:'#2563eb',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:15};
