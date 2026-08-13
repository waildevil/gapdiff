import type { Metadata } from 'next';
import { Barlow_Condensed } from 'next/font/google';
import { auth } from '@/auth';
import { ChatWidget } from '@/components/ChatWidget';
import { Rail, TabBar } from '@/components/Nav';
import { countIncomingChallenges } from '@/lib/duels';
import { countIncomingFriendRequests } from '@/lib/friends';
import { listUserGroups } from '@/lib/groups';
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

/**
 * Runs before the CSS applies, so a stored theme choice takes effect on the
 * very first paint instead of flashing light-then-dark. globals.css keys its
 * dark tokens off this same `data-theme` attribute.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('gapdiff-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

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
  // Every group the user is in — the rail switches between them; nothing in
  // the data model names a "default" one.
  const groups = user ? await listUserGroups(user.id) : [];

  const navProps = { user, pendingDuels, pendingFriendRequests, groups };

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={display.variable}>
        <div className="app">
          <Rail {...navProps} />
          <main>{children}</main>
        </div>
        <TabBar {...navProps} />
        <ChatWidget signedIn={user !== null} />
      </body>
    </html>
  );
}
