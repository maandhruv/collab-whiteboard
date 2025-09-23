import NextAuth from 'next-auth';
import { buildAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const handler = NextAuth(buildAuthOptions());
export { handler as GET, handler as POST };
