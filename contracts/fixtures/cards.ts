import type {
  ChoiceCard,
  ConfirmationCard,
  LinkCard,
  RecordCard,
  SummaryCard,
  TableCard,
} from '../schemas/cards';
import { ATTENTION, CARD, JOURNEY } from './ids';
import { hoursAgo, minutesAgo, minutesFromNow } from './time';

const SN = 'https://example.service-now.com';
const OF = 'https://example.fa.ocs.oraclecloud.com';

export const summaryNeutral: SummaryCard = {
  cardId: CARD.summaryNeutral,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.track,
  taskId: 't-track-1',
  createdAt: minutesAgo(3),
  type: 'summary',
  title: 'INC0012345 is in progress',
  paragraphs: [
    'Assigned to **Ahmed Khan** in IT Service Desk. Last update 12 minutes ago: vendor engaged, root cause suspected in the payments API gateway.',
  ],
  tone: 'neutral',
  link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident.do?sys_id=INC0012345`, platform: 'ServiceNow' },
};

export const summarySuccess: SummaryCard = {
  cardId: CARD.summarySuccess,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.incident,
  taskId: 't-incident-1',
  createdAt: minutesAgo(1),
  type: 'summary',
  title: 'Incident created',
  paragraphs: ['ServiceNow agent created **INC0012345** with priority P2 and assigned it to the Payments Platform group.'],
  tone: 'success',
};

export const summaryFailure: SummaryCard = {
  cardId: CARD.summaryFailure,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.incident,
  taskId: 't-incident-1',
  createdAt: minutesAgo(1),
  type: 'summary',
  title: 'Could not create the incident',
  paragraphs: ['ServiceNow returned `403 Forbidden` for the Payments Platform assignment group. Nothing was created.'],
  tone: 'failure',
  retryable: true,
  link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident_list.do`, platform: 'ServiceNow' },
};

export const summaryCantHelp: SummaryCard = {
  cardId: CARD.summaryCantHelp,
  agentId: 'loop-orchestrator',
  journeyId: JOURNEY.track,
  createdAt: minutesAgo(1),
  type: 'summary',
  title: 'No agent can do this yet',
  paragraphs: ['Recorded for the Loop team.'],
  tone: 'neutral',
};

export const recordIncident: RecordCard = {
  cardId: CARD.recordIncident,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.incident,
  taskId: 't-incident-1',
  createdAt: minutesAgo(1),
  type: 'record',
  title: 'Payments dashboard outage',
  platform: 'ServiceNow',
  reference: 'INC0012345',
  status: { label: 'In progress', tone: 'neutral' },
  fields: [
    { label: 'Priority', value: 'P2 · High' },
    { label: 'Assignment group', value: 'Payments Platform' },
    { label: 'Assigned to', value: 'Ahmed Khan' },
    { label: 'Opened', value: 'Today 14:02' },
    { label: 'Category', value: 'Application · Availability' },
    { label: 'Impact', value: 'Multiple users' },
  ],
  link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident.do?sys_id=INC0012345`, platform: 'ServiceNow' },
};

export const recordExpense: RecordCard = {
  cardId: CARD.recordExpense,
  agentId: 'oracle-fusion',
  journeyId: JOURNEY.expense,
  createdAt: hoursAgo(2),
  type: 'record',
  title: 'Client dinner · Al Bateen',
  platform: 'Oracle Fusion',
  reference: 'EXP-2026-014882',
  status: { label: 'Awaiting approval', tone: 'neutral' },
  fields: [
    { label: 'Claimant', value: 'Reem Al Mazrouei' },
    { label: 'Amount', value: 'AED 1,240.00' },
    { label: 'Date', value: '11 Sep 2026' },
    { label: 'Cost centre', value: 'CC-3300 Client Services' },
    { label: 'Attendees', value: '4 (2 external)' },
    { label: 'Policy limit', value: 'AED 350 per head' },
  ],
  link: { label: 'Open in Oracle Fusion', url: `${OF}/fscmUI/faces/ExpenseReport?id=EXP-2026-014882`, platform: 'Oracle Fusion' },
};

export const recordRequisition: RecordCard = {
  cardId: CARD.recordRequisition,
  agentId: 'oracle-fusion',
  journeyId: JOURNEY.laptops,
  createdAt: minutesAgo(1),
  type: 'record',
  title: '20 x Dell Latitude 5450',
  platform: 'Oracle Fusion',
  reference: 'PR-2026-08821',
  status: { label: 'Submitted', tone: 'success' },
  fields: [
    { label: 'Requester', value: 'Sara Al Nuaimi' },
    { label: 'Quantity', value: '20' },
    { label: 'Unit price', value: 'AED 4,890.00' },
    { label: 'Total', value: 'AED 97,800.00' },
    { label: 'Cost centre', value: 'CC-4410 Technology' },
    { label: 'Needed by', value: '15 Oct 2026' },
  ],
  link: { label: 'Open in Oracle Fusion', url: `${OF}/fscmUI/faces/Requisition?id=PR-2026-08821`, platform: 'Oracle Fusion' },
};

export const recordAccess: RecordCard = {
  cardId: CARD.recordAccess,
  agentId: 'snowflake',
  journeyId: JOURNEY.access,
  createdAt: hoursAgo(5),
  type: 'record',
  title: 'FINANCE schema · read-only',
  platform: 'Snowflake',
  reference: 'ACC-2026-0417',
  status: { label: 'Awaiting manager approval', tone: 'neutral' },
  fields: [
    { label: 'Requester', value: 'Omar Haddad' },
    { label: 'Role', value: 'FINANCE_READER' },
    { label: 'Duration', value: '90 days' },
    { label: 'Classification', value: 'Internal' },
  ],
  link: { label: 'Open in Snowflake', url: 'https://example.snowflakecomputing.com/console#/access/ACC-2026-0417', platform: 'Snowflake' },
};

export const tableIncidents: TableCard = {
  cardId: CARD.tableIncidents,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.track,
  createdAt: minutesAgo(2),
  type: 'table',
  title: 'Open incidents assigned to Payments Platform',
  columns: [
    { key: 'number', label: 'Number', align: 'start' },
    { key: 'short', label: 'Short description', align: 'start' },
    { key: 'priority', label: 'Priority', align: 'start' },
    { key: 'age', label: 'Age (h)', align: 'end' },
  ],
  rows: [
    { number: 'INC0012345', short: 'Payments dashboard outage', priority: 'P2', age: 1 },
    { number: 'INC0012298', short: 'Settlement file delayed', priority: 'P3', age: 9 },
    { number: 'INC0012271', short: 'Card auth latency', priority: 'P3', age: 26 },
    { number: 'INC0012190', short: 'Reconciliation report blank', priority: 'P4', age: 51 },
    { number: 'INC0012144', short: 'Merchant portal login loop', priority: 'P3', age: 73 },
    { number: 'INC0012101', short: 'Refund queue stuck', priority: 'P2', age: 80 },
    { number: 'INC0012088', short: 'FX rates stale', priority: 'P4', age: 98 },
    { number: 'INC0012070', short: 'Chargeback webhook 500s', priority: 'P3', age: 120 },
  ],
  totalRows: 23,
  link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident_list.do?sysparm_query=assignment_group=payments`, platform: 'ServiceNow' },
};

export const tableEmpty: TableCard = {
  cardId: CARD.tableEmpty,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.track,
  createdAt: minutesAgo(2),
  type: 'table',
  title: 'Open P1 incidents',
  columns: [
    { key: 'number', label: 'Number', align: 'start' },
    { key: 'short', label: 'Short description', align: 'start' },
  ],
  rows: [],
  totalRows: 0,
};

export const choiceLaptops: ChoiceCard = {
  cardId: CARD.choiceLaptops,
  agentId: 'loop-orchestrator',
  journeyId: JOURNEY.laptops,
  taskId: 't-laptops-1',
  createdAt: minutesAgo(1),
  type: 'choice',
  attentionId: ATTENTION.laptopsChoice,
  prompt: 'Two agents can order laptops. Which route do you want?',
  options: [
    {
      optionId: 'servicenow-itsm',
      label: 'ServiceNow',
      description: 'IT hardware request from the standard catalogue; IT provisions from stock.',
      agentId: 'servicenow-itsm',
    },
    {
      optionId: 'oracle-fusion',
      label: 'Oracle Fusion',
      description: 'Purchase requisition for a new order; goes through procurement approval.',
      agentId: 'oracle-fusion',
    },
  ],
};

export const choiceChosen: ChoiceCard = {
  ...choiceLaptops,
  cardId: CARD.choiceChosen,
  chosenOptionId: 'servicenow-itsm',
};

export const confirmationIncident: ConfirmationCard = {
  cardId: CARD.confirmationIncident,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.incident,
  taskId: 't-incident-1',
  createdAt: minutesAgo(1),
  type: 'confirmation',
  attentionId: ATTENTION.incidentProposal,
  title: 'Create a P2 incident',
  proposal: 'Raise **INC** "Payments dashboard outage" at priority P2 and assign it to Payments Platform.',
  willHappen: [
    'A new incident is created in ServiceNow',
    'Payments Platform on-call is paged',
    'You are added as the caller',
  ],
  evidence: [
    { label: 'No open incident matches this outage', status: 'passed' },
    { label: 'Payments dashboard is a Tier 1 service', status: 'info', detail: 'P2 is the minimum priority' },
    { label: 'Change freeze not in effect', status: 'passed' },
  ],
  options: [
    { optionId: 'create', label: 'Create P2', recommended: true },
    { optionId: 'create-p1', label: 'Create as P1' },
  ],
  allowFreeText: true,
  expiresAt: minutesFromNow(30),
};

export const confirmationDecided: ConfirmationCard = {
  ...confirmationIncident,
  cardId: CARD.confirmationDecided,
  decidedOptionId: 'create',
};

export const confirmationExpired: ConfirmationCard = {
  ...confirmationIncident,
  cardId: CARD.confirmationExpired,
  expiresAt: minutesAgo(5),
};

export const linkServiceNow: LinkCard = {
  cardId: CARD.linkServiceNow,
  agentId: 'servicenow-itsm',
  journeyId: JOURNEY.incident,
  createdAt: minutesAgo(1),
  type: 'link',
  title: 'INC0012345 in ServiceNow',
  url: `${SN}/nav_to.do?uri=incident.do?sys_id=INC0012345`,
  platform: 'ServiceNow',
  description: 'Incident record with work notes and the on-call timeline.',
};

export const ALL_CARDS = {
  summaryNeutral,
  summarySuccess,
  summaryFailure,
  summaryCantHelp,
  recordIncident,
  recordExpense,
  recordRequisition,
  recordAccess,
  tableIncidents,
  tableEmpty,
  choiceLaptops,
  choiceChosen,
  confirmationIncident,
  confirmationDecided,
  confirmationExpired,
  linkServiceNow,
};
