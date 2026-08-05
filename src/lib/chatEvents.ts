/**
 * The chat widget lives in the root layout; pages like /friends that want to
 * open a thread aren't its parent, so they reach it with a DOM event instead
 * of prop-drilling a callback through the layout boundary.
 */
export const OPEN_CHAT_EVENT = 'gapdiff:open-chat';

export interface OpenChatDetail {
  userId: string;
  name: string | null;
}
