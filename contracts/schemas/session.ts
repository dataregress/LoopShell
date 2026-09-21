import { z } from 'zod';

export const SessionState = z.enum(['signed_out', 'signing_in', 'signed_in']);
export type SessionState = z.infer<typeof SessionState>;

/**
 * What the webview may know about the signed-in user. Never includes tokens
 * (ADR-002 §7). `expiresAt` is informational; refresh is a Rust concern.
 */
export const Session = z.object({
  state: SessionState,
  userId: z.string().optional(),
  displayName: z.string().optional(),
  upn: z.string().optional(),
  tenantId: z.string().optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  /** Why the session ended, when `signed_out` follows a signed-in state. */
  reason: z.enum(['user', 'expired', 'revoked', 'forced', 'error']).optional(),
});
export type Session = z.infer<typeof Session>;
