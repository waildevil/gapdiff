import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption for credentials that have to live in the database.
 *
 * Group owners connect their own Discord, so the webhook cannot sit in an
 * environment variable we control — it has to be stored. A webhook URL is a
 * bearer credential (anyone holding it can post to that channel as anybody),
 * so it is encrypted at rest: a leaked dump, a stray backup or a careless query
 * yields ciphertext rather than a working credential.
 *
 * This defends against stolen *data*. It does not defend against stolen *code
 * execution* — the app must decrypt to post, so anything running as the app can
 * read them. That is the honest boundary of what this buys.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SecretError extends Error {}

/**
 * 32 bytes, base64 or hex. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Losing it does not lose anything irreplaceable: owners re-enter their webhook
 * and carry on. That is why there is no key rotation machinery here.
 */
function key(): Buffer {
  const raw = process.env.SECRET_KEY;
  if (!raw) {
    throw new SecretError(
      'SECRET_KEY is not set, so stored credentials cannot be read or written.',
    );
  }

  const buffer = Buffer.from(raw, raw.length === KEY_BYTES * 2 ? 'hex' : 'base64');
  if (buffer.length !== KEY_BYTES) {
    throw new SecretError(
      `SECRET_KEY must decode to ${KEY_BYTES} bytes, got ${buffer.length}.`,
    );
  }
  return buffer;
}

export function hasSecretKey(): boolean {
  return Boolean(process.env.SECRET_KEY);
}

/** Returns `iv.tag.ciphertext`, all base64url, safe to store as text. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, body].map((b) => b.toString('base64url')).join('.');
}

/**
 * Returns null rather than throwing on anything malformed. A row written under
 * a key that has since changed should disable the integration, not break the
 * page that lists it.
 */
export function decryptSecret(stored: string): string | null {
  try {
    const [ivPart, tagPart, bodyPart] = stored.split('.');
    if (!ivPart || !tagPart || !bodyPart) return null;

    const decipher = createDecipheriv(
      ALGORITHM,
      key(),
      Buffer.from(ivPart, 'base64url'),
    );
    // GCM verifies this on final(); a tampered row throws rather than returning
    // attacker-chosen plaintext.
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(bodyPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Discord webhook hosts, exhaustively.
 *
 * This is the security control that matters more than the cipher. Without it,
 * a group owner could store any URL and the nightly job would happily POST to
 * it from inside our infrastructure — an internal address, a metadata endpoint,
 * someone else's server — with our egress and no user involved. Storing a
 * credential badly leaks one channel; storing an arbitrary URL turns the
 * scheduler into a request forwarder.
 */
const WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);

export interface WebhookCheck {
  ok: boolean;
  error?: string;
  /** Safe to show an owner: identifies the webhook without revealing the token. */
  display?: string;
}

export function validateWebhookUrl(input: string): WebhookCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: 'That is not a URL.' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Webhook URLs are https.' };
  }
  if (!WEBHOOK_HOSTS.has(url.hostname)) {
    return { ok: false, error: 'That is not a Discord webhook address.' };
  }

  // /api/webhooks/{id}/{token}, optionally with an /api/v10 prefix.
  const parts = url.pathname.split('/').filter(Boolean);
  const index = parts.indexOf('webhooks');
  const id = index >= 0 ? parts[index + 1] : undefined;
  const token = index >= 0 ? parts[index + 2] : undefined;

  if (!id || !token || !/^\d+$/.test(id)) {
    return {
      ok: false,
      error: 'Paste the whole webhook URL, including the long token at the end.',
    };
  }

  return { ok: true, display: `…/webhooks/${id}/${'•'.repeat(8)}` };
}
