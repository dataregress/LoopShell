/**
 * Stable ids for fixtures. All are well-formed RFC 4122 v4 UUIDs so they pass
 * `z.uuid()`. Prefixes: a = journey, b = attention, c = card, d = ledger event.
 */
export const JOURNEY = {
  incident: 'a1000000-0000-4000-8000-000000000001',
  track: 'a1000000-0000-4000-8000-000000000002',
  laptops: 'a1000000-0000-4000-8000-000000000003',
  expense: 'a1000000-0000-4000-8000-000000000004',
  access: 'a1000000-0000-4000-8000-000000000005',
  room: 'a1000000-0000-4000-8000-000000000007',
  travel: 'a1000000-0000-4000-8000-000000000008',
} as const;

export const ATTENTION = {
  incidentProposal: 'b1000000-0000-4000-8000-000000000001',
  laptopsChoice: 'b1000000-0000-4000-8000-000000000002',
  expense: 'b1000000-0000-4000-8000-000000000003',
  access: 'b1000000-0000-4000-8000-000000000004',
  costCentre: 'b1000000-0000-4000-8000-000000000005',
  travelExpired: 'b1000000-0000-4000-8000-000000000006',
  signInAgain: 'b1000000-0000-4000-8000-000000000007',
} as const;

export const CARD = {
  summaryNeutral: 'c1000000-0000-4000-8000-000000000001',
  summarySuccess: 'c1000000-0000-4000-8000-000000000002',
  summaryFailure: 'c1000000-0000-4000-8000-000000000003',
  summaryCantHelp: 'c1000000-0000-4000-8000-000000000004',
  recordIncident: 'c1000000-0000-4000-8000-000000000005',
  recordExpense: 'c1000000-0000-4000-8000-000000000006',
  recordRequisition: 'c1000000-0000-4000-8000-000000000007',
  tableIncidents: 'c1000000-0000-4000-8000-000000000008',
  tableEmpty: 'c1000000-0000-4000-8000-000000000009',
  choiceLaptops: 'c1000000-0000-4000-8000-000000000010',
  choiceChosen: 'c1000000-0000-4000-8000-000000000011',
  confirmationIncident: 'c1000000-0000-4000-8000-000000000012',
  confirmationDecided: 'c1000000-0000-4000-8000-000000000013',
  confirmationExpired: 'c1000000-0000-4000-8000-000000000014',
  linkServiceNow: 'c1000000-0000-4000-8000-000000000015',
  recordAccess: 'c1000000-0000-4000-8000-000000000016',
} as const;

let counter = 0;
/** Deterministic v4-shaped UUIDs for generated rows. */
export function seqUuid(prefix: 'd' | 'e' | 'f' = 'd'): string {
  counter += 1;
  const hex = counter.toString(16).padStart(12, '0');
  return `${prefix}1000000-0000-4000-8000-${hex}`;
}
