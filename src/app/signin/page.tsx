import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { signInWithDiscord } from '@/app/actions/auth';
import styles from './signin.module.css';

interface PageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: 'That Discord account is already linked to another user.',
  AccessDenied: 'Discord declined the sign-in request.',
  Configuration: 'Sign-in is misconfigured. Check the Discord credentials in .env.',
};

export default async function SignInPage({ searchParams }: PageProps) {
  const { callbackUrl, error } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(callbackUrl ?? '/');

  return (
    <div className={styles.wrap}>
      <div className="card">
        <div className={styles.inner}>
          <div className="eyebrow">Sign in</div>
          <h1 className={styles.title}>Continue with Discord</h1>
          <p className={styles.body}>
            You only need an account to create a group or join one. Searching players and
            reading any leaderboard works without signing in.
          </p>

          {error ? (
            <p className={styles.error}>
              {ERROR_MESSAGES[error] ?? 'Sign-in failed. Try again.'}
            </p>
          ) : null}

          {/* Inline server action: a plain arrow can't cross the server
              component boundary as a form action. */}
          <form
            action={async () => {
              'use server';
              await signInWithDiscord(callbackUrl);
            }}
          >
            <button className={styles.button} type="submit">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.32 4.62A19.79 19.79 0 0 0 15.43 3.1a13.9 13.9 0 0 0-.63 1.29 18.4 18.4 0 0 0-5.6 0A13.9 13.9 0 0 0 8.56 3.1 19.74 19.74 0 0 0 3.67 4.62C.57 9.24-.27 13.74.15 18.18a19.9 19.9 0 0 0 6.06 3.07c.49-.67.92-1.38 1.3-2.12a13 13 0 0 1-2.05-.99c.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.09 0c.16.14.33.27.5.4-.65.39-1.34.72-2.05.99.37.74.81 1.45 1.3 2.12a19.86 19.86 0 0 0 6.06-3.07c.5-5.15-.84-9.6-3.54-13.56ZM8.02 15.45c-1.18 0-2.16-1.08-2.16-2.41 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.09 2.16 2.42 0 1.33-.95 2.41-2.16 2.41Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.94-2.42 2.15-2.42 1.22 0 2.19 1.09 2.17 2.42 0 1.33-.95 2.41-2.17 2.41Z" />
              </svg>
              Sign in with Discord
            </button>
          </form>

          <p className={styles.fine}>
            We read your Discord name and avatar. Nothing is posted on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}
