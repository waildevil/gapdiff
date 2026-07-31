import type { Metadata } from 'next';
import { auth } from '@/auth';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'gapdiff — League of Legends stats',
  description: 'Look up any League of Legends player and see how they actually performed.',
};

/**
 * Runs before first paint, so the page never renders in one theme and then
 * snaps to the other. Stored choice wins; otherwise follow the OS.
 */
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('gapdiff-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

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
    // The script above mutates data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Header user={user} />
        <main>{children}</main>
      </body>
    </html>
  );
}
