'use server';

import { signIn, signOut } from '@/auth';

/**
 * Server actions so the header can stay a client component without ever seeing
 * the Discord secret.
 */
export async function signInWithDiscord(redirectTo?: string) {
  await signIn('discord', { redirectTo: redirectTo ?? '/' });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
