import type { Metadata } from 'next';
import { Barlow_Condensed } from 'next/font/google';
import { auth } from '@/auth';
import { Header } from '@/components/Header';
import './globals.css';

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'gapdiff — League of Legends stats',
  description: 'Look up any League of Legends player and see how they actually performed.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      }
    : null;

  return (
    <html lang="en">
      <body className={display.variable}>
        <Header user={user} />
        <main>{children}</main>
      </body>
    </html>
  );
}
