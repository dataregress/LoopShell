import { z } from 'zod';

/** RFC 4122 UUID. Every id that crosses the contract boundary is one. */
export const Uuid = z.uuid();
export type Uuid = z.infer<typeof Uuid>;

/** ISO 8601 date-time with offset, e.g. 2026-09-18T14:32:00Z. */
export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Registry id of a sub-agent, e.g. "servicenow-itsm". */
export const AgentId = z.string().min(1);
export type AgentId = z.infer<typeof AgentId>;

/** Human-readable platform name as shown in chips, e.g. "ServiceNow". */
export const Platform = z.string().min(1);
export type Platform = z.infer<typeof Platform>;

export const Tone = z.enum(['neutral', 'success', 'failure']);
export type Tone = z.infer<typeof Tone>;

/** Deep link into a system of record. Rendered as a `link` footer or card. */
export const LinkRef = z.object({
  label: z.string().min(1),
  url: z.url(),
  platform: Platform.optional(),
});
export type LinkRef = z.infer<typeof LinkRef>;

export const Person = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  department: z.string().optional(),
});
export type Person = z.infer<typeof Person>;

/** One line of "what the agent checked". */
export const Evidence = z.object({
  label: z.string().min(1),
  status: z.enum(['passed', 'warning', 'failed', 'info']),
  detail: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

/** An explicit option on a `choice`/`confirmation` card or an Attention item. */
export const DecisionOption = z.object({
  optionId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  /** Marks the agent's recommended option; rendered as the primary button. */
  recommended: z.boolean().optional(),
  /** For `choice` cards: the sub-agent this option routes to. */
  agentId: AgentId.optional(),
});
export type DecisionOption = z.infer<typeof DecisionOption>;

/** Key-value pair for `record` cards. */
export const Field = z.object({
  label: z.string().min(1),
  value: z.string(),
  /** Optional emphasis for status-like values. */
  tone: Tone.optional(),
});
export type Field = z.infer<typeof Field>;

export const StatusBadge = z.object({
  label: z.string().min(1),
  tone: Tone,
});
export type StatusBadge = z.infer<typeof StatusBadge>;
