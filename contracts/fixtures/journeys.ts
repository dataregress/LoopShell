import type { JourneyThread } from '../schemas/journey';
import { confirmationDecided, recordIncident, recordRequisition, summaryNeutral } from './cards';
import { ATTENTION, JOURNEY } from './ids';
import { ME } from './people';
import { daysAgo, minutesAgo } from './time';

export const journeyIncident: JourneyThread = {
  journeyId: JOURNEY.incident,
  createdAt: daysAgo(1, 14, 1),
  updatedAt: daysAgo(1, 17, 40),
  status: 'completed',
  ask: 'Raise a P2 for the payments dashboard outage',
  agentId: 'servicenow-itsm',
  cards: [confirmationDecided, recordIncident],
  decisions: [
    {
      attentionId: ATTENTION.incidentProposal,
      optionId: 'create',
      optionLabel: 'Create P2',
      decidedAt: daysAgo(1, 14, 2),
      by: ME,
    },
  ],
};

export const journeyTrack: JourneyThread = {
  journeyId: JOURNEY.track,
  createdAt: minutesAgo(4),
  updatedAt: minutesAgo(3),
  status: 'completed',
  ask: 'Status of INC0012345',
  agentId: 'servicenow-itsm',
  cards: [summaryNeutral],
  decisions: [],
};

export const journeyLaptops: JourneyThread = {
  journeyId: JOURNEY.laptops,
  createdAt: minutesAgo(14),
  updatedAt: minutesAgo(12),
  status: 'waiting_on_user',
  ask: 'Order 20 laptops',
  agentId: 'oracle-fusion',
  cards: [recordRequisition],
  decisions: [
    {
      attentionId: ATTENTION.laptopsChoice,
      optionId: 'oracle-fusion',
      optionLabel: 'Oracle Fusion',
      decidedAt: minutesAgo(13),
      by: ME,
    },
  ],
};

export const JOURNEYS: JourneyThread[] = [journeyIncident, journeyTrack, journeyLaptops];
