import type { AttentionItem } from '../schemas/attention';
import { recordAccess, recordExpense } from './cards';
import { ATTENTION, JOURNEY } from './ids';
import { ME, OMAR, REEM } from './people';
import { hoursAgo, minutesAgo, minutesFromNow } from './time';

export const expenseApproval: AttentionItem = {
  attentionId: ATTENTION.expense,
  journeyId: JOURNEY.expense,
  kind: 'confirm',
  title: 'Approve expense claim · AED 1,240',
  requester: REEM,
  subject: 'Client dinner, Al Bateen · 4 attendees',
  department: 'Client Services',
  agentId: 'oracle-fusion',
  platform: 'Oracle Fusion',
  evidence: [
    { label: 'Policy check passed', status: 'passed', detail: 'AED 310 per head, under the AED 350 limit' },
    { label: 'Receipt attached', status: 'passed' },
    { label: 'Cost centre matches', status: 'passed', detail: 'CC-3300 Client Services' },
    { label: 'Itemised receipt missing', status: 'warning', detail: 'Only the card slip is attached' },
  ],
  options: [
    { optionId: 'approve', label: 'Approve', recommended: true },
    { optionId: 'request-receipt', label: 'Ask for itemised receipt' },
  ],
  allowFreeText: true,
  record: recordExpense,
  createdAt: hoursAgo(2),
  expiresAt: minutesFromNow(6 * 60),
  state: 'open',
};

export const accessRequest: AttentionItem = {
  attentionId: ATTENTION.access,
  journeyId: JOURNEY.access,
  kind: 'confirm',
  title: 'Approve Snowflake access · FINANCE schema',
  requester: OMAR,
  subject: 'Read-only, 90 days',
  department: 'Finance Analytics',
  agentId: 'snowflake',
  platform: 'Snowflake',
  evidence: [
    { label: 'Manager approval required', status: 'info', detail: 'You are the requester’s line manager' },
    { label: 'Data classification: Internal', status: 'passed' },
    { label: 'No conflicting access', status: 'passed' },
    { label: 'Training current', status: 'passed', detail: 'Data handling refresher completed 3 Aug 2026' },
  ],
  options: [
    { optionId: 'approve-90', label: 'Approve 90 days', recommended: true },
    { optionId: 'approve-30', label: 'Approve 30 days' },
  ],
  allowFreeText: true,
  record: recordAccess,
  createdAt: hoursAgo(5),
  expiresAt: minutesFromNow(26 * 60),
  state: 'open',
};

export const costCentreChoice: AttentionItem = {
  attentionId: ATTENTION.costCentre,
  journeyId: JOURNEY.laptops,
  kind: 'choose',
  title: 'Which cost centre for the 20 laptops?',
  requester: ME,
  subject: 'Purchase requisition · AED 97,800',
  department: 'Technology',
  agentId: 'oracle-fusion',
  platform: 'Oracle Fusion',
  evidence: [
    { label: 'Three cost centres are open to you', status: 'info' },
    { label: 'CC-4410 has budget remaining', status: 'passed', detail: 'AED 412,000 available this quarter' },
  ],
  options: [
    { optionId: 'cc-4410', label: 'CC-4410 Technology', description: 'Your home cost centre', recommended: true },
    { optionId: 'cc-4420', label: 'CC-4420 Digital Products' },
    { optionId: 'cc-2100', label: 'CC-2100 Operations' },
  ],
  allowFreeText: false,
  createdAt: minutesAgo(12),
  expiresAt: minutesFromNow(45),
  state: 'open',
};

export const travelExpired: AttentionItem = {
  attentionId: ATTENTION.travelExpired,
  journeyId: JOURNEY.travel,
  kind: 'confirm',
  title: 'Approve travel request · Riyadh, 2 nights',
  requester: REEM,
  subject: 'Client workshop, 22–24 Sep',
  department: 'Client Services',
  agentId: 'oracle-fusion',
  platform: 'Oracle Fusion',
  evidence: [{ label: 'Within travel policy', status: 'passed' }],
  options: [
    { optionId: 'approve', label: 'Approve', recommended: true },
    { optionId: 'defer', label: 'Ask to rebook' },
  ],
  allowFreeText: true,
  createdAt: hoursAgo(30),
  expiresAt: hoursAgo(3),
  state: 'expired',
};

export const signInAgain: AttentionItem = {
  attentionId: ATTENTION.signInAgain,
  journeyId: JOURNEY.track,
  kind: 'auth',
  title: 'Sign in again',
  requester: ME,
  subject: 'Your Loop session has expired',
  agentId: 'loop-orchestrator',
  platform: 'Loop',
  evidence: [],
  options: [{ optionId: 'sign-in', label: 'Sign in', recommended: true }],
  allowFreeText: false,
  createdAt: minutesAgo(1),
  expiresAt: minutesFromNow(24 * 60),
  state: 'open',
};

export const ATTENTION_ITEMS: AttentionItem[] = [costCentreChoice, expenseApproval, accessRequest, travelExpired];
