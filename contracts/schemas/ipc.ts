import { z } from 'zod';
import { Uuid } from './common';

/** Error model for every command (docs/shell-architecture.md §5.3). */
export const IpcErrorCode = z.enum([
  'unauthenticated',
  'offline',
  'timeout',
  'rejected',
  'conflict',
  'invalid',
  'internal',
]);
export type IpcErrorCode = z.infer<typeof IpcErrorCode>;

export const IpcError = z.object({
  code: IpcErrorCode,
  message: z.string(),
  retryable: z.boolean(),
  correlationId: z.string().optional(),
});
export type IpcError = z.infer<typeof IpcError>;

export function isIpcError(value: unknown): value is IpcError {
  return IpcError.safeParse(value).success;
}

export const AskSubmitRequest = z.object({
  text: z.string().min(1).max(4000),
  journeyId: Uuid.optional(),
  clientRequestId: Uuid,
});
export type AskSubmitRequest = z.infer<typeof AskSubmitRequest>;

export const AskSubmitResult = z.object({
  journeyId: Uuid,
  taskId: z.string().min(1),
});
export type AskSubmitResult = z.infer<typeof AskSubmitResult>;
