import type { Metadata } from 'next';
import { Barlow_Condensed } from 'next/font/google';
import { auth } from '@/auth';
import { ChatWidget } from '@/components/ChatWidget';
import { Header } from '@/components/Header';
import { countIncomingChallenges } from '@/lib/duels';
import { countIncomingFriendRequests } from '@/lib/friends';
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

  const pendingDuels = user ? await countIncomingChallenges(user.id) : 0;
  const pendingFriendRequests = user ? await countIncomingFriendRequests(user.id) : 0;

  return (
    <html lang="en">
      <body className={display.variable}>
        <Header
          user={user}
          pendingDuels={pendingDuels}
          pendingFriendRequests={pendingFriendRequests}
        />
        <main>{children}</main>
        <ChatWidget signedIn={user !== null} />
      </body>
    </html>
  );
}
