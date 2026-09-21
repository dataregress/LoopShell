import { motion } from 'motion/react';
import { useState } from 'react';
import type { Session } from '@contracts/schemas/session';
import { useAdapter } from '@/adapters/AdapterProvider';
import { t } from '@/lib/i18n';
import { Button } from '@/ui/Button';
import { describeError } from '@/ui/ErrorCard';
import { LoopMark } from '@/ui/LoopMark';
import { useMotionPresets } from '@/ui/motion';

const REASON_COPY: Record<NonNullable<Session['reason']>, string> = {
  user: '',
  expired: 'Your session expired.',
  revoked: 'Your access was revoked.',
  forced: 'You were signed out by your organisation.',
  error: 'Sign-in did not complete.',
};

/** Full-panel signed-out state; sign-in opens the system browser (docs/ui-ux.md §3.8). */
export function SignedOut({ session }: { session: Session }) {
  const m = useMotionPresets();
  const adapter = useAdapter();
  const [error, setError] = useState<string | null>(null);
  const waiting = session.state === 'signing_in';
  const reason = session.reason ? REASON_COPY[session.reason] : '';

  async function signIn() {
    setError(null);
    try {
      await adapter.authSignIn();
    } catch (err) {
      setError(describeError(err).message);
    }
  }

  return (
    <motion.div
      variants={m.staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <motion.div variants={m.fadeUp}>
        <LoopMark size={48} />
      </motion.div>
      <motion.div variants={m.fadeUp}>
        <h1 className="text-xl text-fg">{t('Sign in to Loop')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{reason || t('Ask once. It’s handled.')}</p>
      </motion.div>
      <motion.div variants={m.fadeUp} className="flex flex-col items-center gap-2">
        <Button variant="primary" onClick={() => void signIn()} loading={waiting} disabled={waiting}>
          {waiting ? t('Waiting for sign-in…') : t('Sign in')}
        </Button>
        {waiting && <p className="text-xs text-fg-subtle">{t('Complete sign-in in your browser.')}</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
