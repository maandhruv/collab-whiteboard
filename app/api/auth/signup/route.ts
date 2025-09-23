import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { hash } from 'bcryptjs';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(req: Request) {
  let raw: any = null;
  try {
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
    }
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }
  const { email, password, name } = raw || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
  }
  const normEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password too short (min 8)' }, { status: 400 });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email: normEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    const passwordHash = await hash(password, 10);
    const user = await prisma.user.create({ data: { email: normEmail, passwordHash, name: typeof name === 'string' && name.trim() ? name.trim() : null } });
    return NextResponse.json({ ok: true, id: user.id });
  } catch (err: any) {
    console.error('Signup error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
