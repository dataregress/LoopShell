import { z } from 'zod';
import { LinkRef } from '../common';
import { CardEnvelope } from './envelope';

export const TableColumn = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  align: z.enum(['start', 'end']).default('start'),
});
export type TableColumn = z.infer<typeof TableColumn>;

/** Several objects. Up to 5 columns; the dock shows 8 rows and offers "Show all". */
export const TableCard = CardEnvelope.extend({
  type: z.literal('table'),
  title: z.string().min(1),
  columns: z.array(TableColumn).min(1).max(5),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  /** Total available server-side when `rows` is a page. */
  totalRows: z.number().int().nonnegative().optional(),
  link: LinkRef.optional(),
}).loose();
export type TableCard = z.infer<typeof TableCard>;
