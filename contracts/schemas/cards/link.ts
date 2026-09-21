import { z } from 'zod';
import { Platform } from '../common';
import { CardEnvelope } from './envelope';

/** Deep link into the system of record. Opened via `open_external` (allow-listed hosts). */
export const LinkCard = CardEnvelope.extend({
  type: z.literal('link'),
  title: z.string().min(1),
  url: z.url(),
  platform: Platform.optional(),
  description: z.string().optional(),
}).loose();
export type LinkCard = z.infer<typeof LinkCard>;
