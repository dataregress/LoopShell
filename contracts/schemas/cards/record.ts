import { z } from 'zod';
import { Field, LinkRef, Platform, StatusBadge } from '../common';
import { CardEnvelope } from './envelope';

/** One object in a system of record (incident, request, claim). Always links back. */
export const RecordCard = CardEnvelope.extend({
  type: z.literal('record'),
  title: z.string().min(1),
  platform: Platform,
  /** e.g. "INC0012345" */
  reference: z.string().min(1),
  status: StatusBadge.optional(),
  fields: z.array(Field).min(1).max(12),
  link: LinkRef,
}).loose();
export type RecordCard = z.infer<typeof RecordCard>;
