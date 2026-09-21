import { Info } from 'lucide-react';
import type { IpcError } from '@contracts/schemas/ipc';
import { t } from '@/lib/i18n';
import { Button } from './Button';
import { Tooltip } from './Tooltip';

export interface ErrorCardProps {
  error: IpcError | Error | unknown;
  onRetry?: () => void;
}

export function describeError(error: unknown): { message: string; retryable: boolean; correlationId?: string } {
  const e = error as Partial<IpcError> | undefined;
  if (e && typeof e === 'object' && typeof e.code === 'string') {
    const map: Record<string, string> = {
      unauthenticated: t('Sign in to continue.'),
      offline: t('Loop is offline.'),
      timeout: t('The orchestrator took too long to respond.'),
      rejected: t('The orchestrator declined this.'),
      conflict: t('Already decided elsewhere.'),
      invalid: t('Something came back in a shape Loop did not expect.'),
      internal: t('Something went wrong.'),
    };
    return {
      message: e.message && e.code !== 'internal' ? e.message : (map[e.code] ?? t('Something went wrong.')),
      retryable: e.retryable ?? false,
      correlationId: e.correlationId,
    };
  }
  if (error instanceof Error) return { message: error.message, retryable: true };
  return { message: t('Something went wrong.'), retryable: true };
}

/** Inline error: what failed in plain words, optional retry, correlation id in a tooltip. */
export function ErrorCard({ error, onRetry }: ErrorCardProps) {
  const { message, retryable, correlationId } = describeError(error);
  return (
    <div role="alert" className="rounded-card border border-border border-s-[3px] border-s-danger bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base text-fg">{message}</p>
        {correlationId && (
          <Tooltip content={`${t('Reference')}: ${correlationId}`}>
            <span className="text-fg-subtle">
              <Info className="size-4" aria-label={t('Reference')} />
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-3">
        {retryable && onRetry ? (
          <Button size="sm" onClick={onRetry}>
            {t('Try again')}
          </Button>
        ) : (
          <p className="text-sm text-fg-muted">{t('Recorded for the Loop team.')}</p>
        )}
      </div>
    </div>
  );
}
