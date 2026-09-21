import type { LedgerEventType, LedgerRow } from '../schemas/ledger';
import { agentInfo } from '../registry/agents';
import { JOURNEY, seqUuid } from './ids';
import { AHMED, LAYLA, ME, OMAR, REEM } from './people';
import { daysAgo, hoursAgo, minutesAgo } from './time';

const SN = 'https://example.service-now.com';
const OF = 'https://example.fa.ocs.oraclecloud.com';

function row(partial: Omit<LedgerRow, 'eventId'>): LedgerRow {
  return { eventId: seqUuid('d'), ...partial };
}

/** Curated rows for the demo journeys (docs/design-brief.md §6), newest first. */
export const LEDGER_ROWS: LedgerRow[] = [
  // Laptop request: waiting on IT (today)
  row({
    eventType: 'proposed',
    occurredAt: minutesAgo(12),
    journeyId: JOURNEY.laptops,
    agentId: 'oracle-fusion',
    platform: 'Oracle Fusion',
    action: 'create_requisition',
    object: { type: 'requisition', id: 'PR-2026-08821', label: '20 x Dell Latitude 5450' },
    summary: 'Oracle Fusion agent asked which cost centre to use',
    actor: ME,
  }),
  // Room booked (today)
  row({
    eventType: 'executed',
    occurredAt: hoursAgo(1),
    journeyId: JOURNEY.room,
    agentId: 'm365',
    platform: 'Microsoft 365',
    action: 'book_room',
    object: {
      type: 'booking',
      id: 'BK-77120',
      label: 'Al Reem 3 · Fri 16:00–17:00',
      link: { label: 'Open in Outlook', url: 'https://outlook.office.com/calendar/item/BK-77120', platform: 'Microsoft 365' },
    },
    summary: 'Microsoft 365 agent booked Al Reem 3 for 16:00',
    actor: ME,
  }),
  row({
    eventType: 'confirmed',
    occurredAt: minutesAgo(61),
    journeyId: JOURNEY.room,
    agentId: 'loop-orchestrator',
    platform: 'Loop',
    action: 'confirm',
    object: { type: 'booking', id: 'BK-77120', label: 'Al Reem 3 · Fri 16:00–17:00' },
    summary: 'You confirmed the booking',
    actor: ME,
  }),
  row({
    eventType: 'proposed',
    occurredAt: minutesAgo(62),
    journeyId: JOURNEY.room,
    agentId: 'm365',
    platform: 'Microsoft 365',
    action: 'book_room',
    object: { type: 'booking', id: 'BK-77120', label: 'Al Reem 3 · Fri 16:00–17:00' },
    summary: 'Microsoft 365 agent proposed Al Reem 3 (seats 8, free at 16:00)',
    actor: ME,
  }),
  // Closed incident (yesterday)
  row({
    eventType: 'executed',
    occurredAt: daysAgo(1, 17, 40),
    journeyId: JOURNEY.incident,
    agentId: 'servicenow-itsm',
    platform: 'ServiceNow',
    action: 'close_incident',
    object: {
      type: 'incident',
      id: 'INC0012345',
      label: 'Payments dashboard outage',
      link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident.do?sys_id=INC0012345`, platform: 'ServiceNow' },
    },
    summary: 'ServiceNow agent closed INC0012345 · resolved by Ahmed Khan',
    actor: AHMED,
    routedToUser: true,
  }),
  row({
    eventType: 'executed',
    occurredAt: daysAgo(1, 14, 3),
    journeyId: JOURNEY.incident,
    agentId: 'servicenow-itsm',
    platform: 'ServiceNow',
    action: 'create_incident',
    object: {
      type: 'incident',
      id: 'INC0012345',
      label: 'Payments dashboard outage',
      link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident.do?sys_id=INC0012345`, platform: 'ServiceNow' },
    },
    summary: 'ServiceNow agent created INC0012345 (P2)',
    actor: ME,
  }),
  row({
    eventType: 'confirmed',
    occurredAt: daysAgo(1, 14, 2),
    journeyId: JOURNEY.incident,
    agentId: 'loop-orchestrator',
    platform: 'Loop',
    action: 'confirm',
    object: { type: 'incident', id: 'INC0012345', label: 'Payments dashboard outage' },
    summary: 'You confirmed: Create P2',
    actor: ME,
  }),
  row({
    eventType: 'proposed',
    occurredAt: daysAgo(1, 14, 1),
    journeyId: JOURNEY.incident,
    agentId: 'servicenow-itsm',
    platform: 'ServiceNow',
    action: 'create_incident',
    object: { type: 'incident', id: 'draft', label: 'Payments dashboard outage' },
    summary: 'ServiceNow agent proposed a P2 incident',
    actor: ME,
  }),
  // Approved expense (Mon)
  row({
    eventType: 'executed',
    occurredAt: daysAgo(3, 9, 48),
    journeyId: JOURNEY.travel,
    agentId: 'oracle-fusion',
    platform: 'Oracle Fusion',
    action: 'approve_expense',
    object: {
      type: 'expense',
      id: 'EXP-2026-014610',
      label: 'Taxi · AED 86',
      link: { label: 'Open in Oracle Fusion', url: `${OF}/fscmUI/faces/ExpenseReport?id=EXP-2026-014610`, platform: 'Oracle Fusion' },
    },
    summary: 'Oracle Fusion agent approved EXP-2026-014610 for Reem Al Mazrouei',
    actor: ME,
    routedToUser: true,
  }),
  row({
    eventType: 'confirmed',
    occurredAt: daysAgo(3, 9, 47),
    journeyId: JOURNEY.travel,
    agentId: 'loop-orchestrator',
    platform: 'Loop',
    action: 'confirm',
    object: { type: 'expense', id: 'EXP-2026-014610', label: 'Taxi · AED 86' },
    summary: 'You approved',
    actor: ME,
    routedToUser: true,
  }),
  row({
    eventType: 'proposed',
    occurredAt: daysAgo(3, 8, 30),
    journeyId: JOURNEY.travel,
    agentId: 'oracle-fusion',
    platform: 'Oracle Fusion',
    action: 'approve_expense',
    object: { type: 'expense', id: 'EXP-2026-014610', label: 'Taxi · AED 86' },
    summary: 'Oracle Fusion agent routed an expense approval to you',
    actor: REEM,
    routedToUser: true,
  }),
  // Access request expired (last week)
  row({
    eventType: 'expired',
    occurredAt: daysAgo(6, 18, 0),
    journeyId: JOURNEY.access,
    agentId: 'snowflake',
    platform: 'Snowflake',
    action: 'grant_access',
    object: { type: 'access', id: 'ACC-2026-0391', label: 'MARKETING schema · read-only' },
    summary: 'Approval expired without a decision',
    actor: OMAR,
    routedToUser: true,
  }),
  row({
    eventType: 'failed',
    occurredAt: daysAgo(7, 11, 20),
    journeyId: JOURNEY.track,
    agentId: 'm365',
    platform: 'Microsoft 365',
    action: 'book_room',
    object: { type: 'booking', id: 'draft', label: 'Boardroom · Mon 09:00' },
    summary: 'Microsoft 365 agent could not book: room is restricted',
    actor: LAYLA,
  }),
];

const GEN_PLATFORM_AGENTS = ['servicenow-itsm', 'oracle-fusion', 'snowflake', 'm365', 'outsystems'] as const;
const GEN_TYPES: LedgerEventType[] = ['proposed', 'confirmed', 'executed', 'executed', 'executed', 'failed', 'cancelled', 'expired'];
const GEN_ACTORS = [ME, ME, ME, REEM, OMAR, AHMED, LAYLA];
const GEN_OBJECTS: Array<[string, string, string]> = [
  ['incident', 'INC', 'Printer offline on level 4'],
  ['request', 'REQ', 'Monitor arm for hot desk'],
  ['expense', 'EXP', 'Parking · AED 40'],
  ['access', 'ACC', 'SALES schema · read-only'],
  ['booking', 'BK', 'Al Reem 2 · 11:00–12:00'],
  ['requisition', 'PR', 'Docking stations x 6'],
  ['change', 'CHG', 'Rotate API gateway certificate'],
];

/** Small deterministic PRNG so 10k rows are the same on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate `count` plausible rows older than the curated ones, grouped into
 * journeys of 1-4 events, spread over the past ~180 days. Used by the mock's
 * 10k-row fixture and the Recent virtualisation story.
 */
export function generateLedgerRows(count: number, seed = 42): LedgerRow[] {
  const rnd = mulberry32(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
  const rows: LedgerRow[] = [];
  let t = Date.parse(daysAgo(8, 18, 0));
  let n = 0;
  while (rows.length < count) {
    const perJourney = 1 + Math.floor(rnd() * 4);
    const journeyId = seqUuid('e');
    const agentId = pick(GEN_PLATFORM_AGENTS);
    const { platform } = agentInfo(agentId);
    const [type, prefix, label] = pick(GEN_OBJECTS);
    const id = `${prefix}${String(9000000 - n).padStart(7, '0')}`;
    const actor = pick(GEN_ACTORS);
    for (let i = 0; i < perJourney && rows.length < count; i += 1) {
      t -= 5 * 60_000 + Math.floor(rnd() * 3 * 60 * 60_000);
      const eventType = i === perJourney - 1 ? pick(GEN_TYPES) : i === 0 ? 'proposed' : 'confirmed';
      rows.push({
        eventId: seqUuid('f'),
        eventType,
        occurredAt: new Date(t).toISOString(),
        journeyId,
        agentId: eventType === 'confirmed' ? 'loop-orchestrator' : agentId,
        platform: eventType === 'confirmed' ? 'Loop' : platform,
        action: `${eventType}_${type}`,
        object: { type, id, label },
        summary:
          eventType === 'confirmed'
            ? 'You confirmed'
            : `${agentInfo(agentId).displayName} ${eventType} ${id}`,
        actor,
        routedToUser: actor.userId !== ME.userId,
      });
    }
    n += 1;
  }
  return rows;
}
