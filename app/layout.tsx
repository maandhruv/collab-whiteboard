export const metadata = { title: 'Collab Whiteboard' };
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f1115', color: 'white' }}>
        <SessionProviderWrapper>
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}

