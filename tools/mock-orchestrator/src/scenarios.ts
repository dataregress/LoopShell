import { randomUUID } from 'node:crypto';
import { accessRequest, costCentreChoice, expenseApproval, signInAgain } from '../../../contracts/fixtures/attention';
import type { AttentionItem } from '../../../contracts/schemas/attention';
import type { Card, ChoiceCard, ConfirmationCard, RecordCard, SummaryCard, TableCard } from '../../../contracts/schemas/cards';
import type { Decision, JourneyRun, State } from './state';

const SN = 'https://example.service-now.com';
const OF = 'https://example.fa.ocs.oraclecloud.com';
const M365 = 'https://outlook.office.com';

class Cancelled extends Error {}

/** Per-journey helpers handed to a scenario. */
class Ctx {
  constructor(
    readonly state: State,
    readonly run: JourneyRun,
    readonly text: string,
  ) {}

  get journeyId(): string {
    return this.run.thread.journeyId;
  }

  delay(ms: number): Promise<void> {
    const total = ms + this.state.knobs.latencyMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.run.timers.delete(timer);
        if (this.run.cancelled) reject(new Cancelled());
        else resolve();
      }, total);
      this.run.timers.add(timer);
    });
  }

  envelope(agentId: string) {
    return { cardId: randomUUID(), agentId, journeyId: this.journeyId, taskId: this.run.taskId, createdAt: new Date().toISOString() };
  }

  working(agentId?: string, message?: string): void {
    this.state.task(this.run, 'working', { agentId, message });
  }

  complete(cards: Card[], agentId?: string, message?: string): void {
    this.state.task(this.run, 'completed', { agentId, cards, message });
  }

  fail(message: string, cards: Card[] = [], agentId?: string): void {
    this.state.task(this.run, 'failed', { agentId, cards, message });
  }

  /**
   * Put a choice/confirmation in front of the user: the card goes into the
   * thread (`input-required`) and the same decision is an Attention item, so it
   * survives the panel hiding (invariant 6). Resolves with the decision.
   */
  async ask(card: ChoiceCard | ConfirmationCard, item: Omit<AttentionItem, 'attentionId' | 'journeyId' | 'createdAt' | 'state'>): Promise<Decision> {
    const attentionId = card.attentionId;
    const full: AttentionItem = {
      ...item,
      attentionId,
      journeyId: this.journeyId,
      taskId: this.run.taskId,
      createdAt: new Date().toISOString(),
      state: 'open',
    };
    // The Attention item is created silently (no pop): the card is already in
    // the open thread. If the panel hides, the UI lists it from attention_list.
    this.state.addAttention(full, { pop: false });
    this.state.task(this.run, 'input-required', { agentId: card.agentId, cards: [card] });
    const ttl = Date.parse(full.expiresAt) - Date.now();
    const expiry = setTimeout(() => this.state.expire(attentionId), Math.max(1000, ttl));
    this.run.timers.add(expiry);
    try {
      return await this.state.awaitDecision(attentionId);
    } finally {
      clearTimeout(expiry);
      this.run.timers.delete(expiry);
    }
  }

  ledger(row: Parameters<State['appendLedger']>[0]): void {
    this.state.appendLedger(row);
  }
}

type Scenario = (ctx: Ctx) => Promise<void>;

// ---- Scenarios (docs/ui-ux.md §9) ------------------------------------------

const raiseIncident: Scenario = async (ctx) => {
  const agent = 'servicenow-itsm';
  await ctx.delay(400);
  ctx.working(agent);
  await ctx.delay(900);
  const attentionId = randomUUID();
  const confirmation: ConfirmationCard = {
    ...ctx.envelope(agent),
    type: 'confirmation',
    attentionId,
    title: 'Create a P2 incident',
    proposal: 'Raise **INC** "Payments dashboard outage" at priority P2 and assign it to Payments Platform.',
    willHappen: ['A new incident is created in ServiceNow', 'Payments Platform on-call is paged', 'You are added as the caller'],
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
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  ctx.ledger({
    eventType: 'proposed',
    journeyId: ctx.journeyId,
    agentId: agent,
    platform: 'ServiceNow',
    action: 'create_incident',
    object: { type: 'incident', id: 'draft', label: 'Payments dashboard outage' },
    summary: 'ServiceNow agent proposed a P2 incident',
    actor: ctx.state.user,
  });
  let decision: Decision;
  try {
    decision = await ctx.ask(confirmation, {
      kind: 'confirm',
      title: 'Create a P2 incident · Payments dashboard outage',
      requester: ctx.state.user,
      subject: 'Payments dashboard outage',
      agentId: agent,
      platform: 'ServiceNow',
      evidence: confirmation.evidence,
      options: confirmation.options,
      allowFreeText: true,
      expiresAt: confirmation.expiresAt!,
    });
  } catch (err) {
    if (err instanceof Cancelled) return;
    ctx.ledger({
      eventType: 'expired',
      journeyId: ctx.journeyId,
      agentId: 'loop-orchestrator',
      platform: 'Loop',
      action: 'confirm',
      object: { type: 'incident', id: 'draft', label: 'Payments dashboard outage' },
      summary: 'Proposal expired without a decision',
      actor: ctx.state.user,
    });
    ctx.state.task(ctx.run, 'canceled', { message: 'The proposal expired before you decided.' });
    return;
  }
  if (decision.optionId === 'reject') {
    ctx.ledger({
      eventType: 'cancelled',
      journeyId: ctx.journeyId,
      agentId: 'loop-orchestrator',
      platform: 'Loop',
      action: 'confirm',
      object: { type: 'incident', id: 'draft', label: 'Payments dashboard outage' },
      summary: decision.freeText ? `You rejected: “${decision.freeText}”` : 'You rejected the proposal',
      actor: ctx.state.user,
    });
    const summary: SummaryCard = {
      ...ctx.envelope(agent),
      type: 'summary',
      title: 'Nothing was created',
      paragraphs: ['ServiceNow agent stood down. No incident was raised.'],
      tone: 'neutral',
    };
    ctx.complete([summary], agent);
    return;
  }
  const priority = decision.optionId === 'create-p1' ? 'P1' : 'P2';
  ctx.ledger({
    eventType: 'confirmed',
    journeyId: ctx.journeyId,
    agentId: 'loop-orchestrator',
    platform: 'Loop',
    action: 'confirm',
    object: { type: 'incident', id: 'draft', label: 'Payments dashboard outage' },
    summary: `You confirmed: Create ${priority}${decision.freeText ? ` · “${decision.freeText}”` : ''}`,
    actor: ctx.state.user,
  });
  ctx.working(agent);
  await ctx.delay(1400);
  const number = `INC00${String(12000 + Math.floor(Math.random() * 900)).padStart(5, '0')}`;
  const record: RecordCard = {
    ...ctx.envelope(agent),
    type: 'record',
    title: 'Payments dashboard outage',
    platform: 'ServiceNow',
    reference: number,
    status: { label: 'New', tone: 'success' },
    fields: [
      { label: 'Priority', value: `${priority} · ${priority === 'P1' ? 'Critical' : 'High'}` },
      { label: 'Assignment group', value: 'Payments Platform' },
      { label: 'Caller', value: ctx.state.user.displayName },
      { label: 'Opened', value: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
      { label: 'Category', value: 'Application · Availability' },
    ],
    link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident.do?sys_id=${number}`, platform: 'ServiceNow' },
  };
  ctx.ledger({
    eventType: 'executed',
    journeyId: ctx.journeyId,
    agentId: agent,
    platform: 'ServiceNow',
    action: 'create_incident',
    object: { type: 'incident', id: number, label: 'Payments dashboard outage', link: record.link },
    summary: `ServiceNow agent created ${number} (${priority})`,
    actor: ctx.state.user,
  });
  ctx.complete([record], agent);
};

const trackIncident: Scenario = async (ctx) => {
  const agent = 'servicenow-itsm';
  const number = /INC\d{5,}/i.exec(ctx.text)?.[0]?.toUpperCase() ?? 'INC0012345';
  await ctx.delay(300);
  ctx.working(agent);
  await ctx.delay(1100);
  const record: RecordCard = {
    ...ctx.envelope(agent),
    type: 'record',
    title: 'Payments dashboard outage',
    platform: 'ServiceNow',
    reference: number,
    status: { label: 'In progress', tone: 'neutral' },
    fields: [
      { label: 'Priority', value: 'P2 · High' },
      { label: 'Assignment group', value: 'Payments Platform' },
      { label: 'Assigned to', value: 'Ahmed Khan' },
      { label: 'Last update', value: '12 minutes ago · vendor engaged' },
      { label: 'Impact', value: 'Multiple users' },
    ],
    link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident.do?sys_id=${number}`, platform: 'ServiceNow' },
  };
  ctx.complete([record], agent);
};

const orderLaptops: Scenario = async (ctx) => {
  await ctx.delay(500);
  const qty = /\b(\d{1,3})\b/.exec(ctx.text)?.[1] ?? '20';
  const choiceId = randomUUID();
  const choice: ChoiceCard = {
    ...ctx.envelope('loop-orchestrator'),
    type: 'choice',
    attentionId: choiceId,
    prompt: 'Two agents can order laptops. Which route do you want?',
    options: [
      { optionId: 'servicenow-itsm', label: 'ServiceNow', description: 'IT hardware request from the standard catalogue; IT provisions from stock.', agentId: 'servicenow-itsm' },
      { optionId: 'oracle-fusion', label: 'Oracle Fusion', description: 'Purchase requisition for a new order; goes through procurement approval.', agentId: 'oracle-fusion' },
    ],
  };
  let route: Decision;
  try {
    route = await ctx.ask(choice, {
      kind: 'choose',
      title: `How should Loop order ${qty} laptops?`,
      requester: ctx.state.user,
      subject: `${qty} laptops`,
      agentId: 'loop-orchestrator',
      platform: 'Loop',
      evidence: [{ label: 'Two agents can fulfil this', status: 'info' }],
      options: choice.options,
      allowFreeText: false,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
  } catch {
    return;
  }
  const agent = route.optionId === 'servicenow-itsm' ? 'servicenow-itsm' : 'oracle-fusion';
  const platform = ctx.state.platformOf(agent);
  ctx.working(agent);
  await ctx.delay(1200);
  if (agent === 'oracle-fusion') {
    const ccId = randomUUID();
    const cc: ChoiceCard = {
      ...ctx.envelope(agent),
      type: 'choice',
      attentionId: ccId,
      prompt: `Which cost centre for the ${qty} laptops?`,
      options: costCentreChoice.options,
    };
    let picked: Decision;
    try {
      picked = await ctx.ask(cc, {
        ...costCentreChoice,
        title: `Which cost centre for the ${qty} laptops?`,
        expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(),
      });
    } catch {
      return;
    }
    ctx.working(agent);
    await ctx.delay(900);
    const pr = `PR-2026-${String(8800 + Math.floor(Math.random() * 90)).padStart(5, '0')}`;
    const ccLabel = cc.options.find((o) => o.optionId === picked.optionId)?.label ?? picked.optionId;
    const record: RecordCard = {
      ...ctx.envelope(agent),
      type: 'record',
      title: `${qty} x Dell Latitude 5450`,
      platform,
      reference: pr,
      status: { label: 'Submitted for approval', tone: 'success' },
      fields: [
        { label: 'Requester', value: ctx.state.user.displayName },
        { label: 'Quantity', value: qty },
        { label: 'Unit price', value: 'AED 4,890.00' },
        { label: 'Total', value: `AED ${(Number(qty) * 4890).toLocaleString('en-GB')}.00` },
        { label: 'Cost centre', value: ccLabel },
      ],
      link: { label: 'Open in Oracle Fusion', url: `${OF}/fscmUI/faces/Requisition?id=${pr}`, platform },
    };
    ctx.ledger({
      eventType: 'executed',
      journeyId: ctx.journeyId,
      agentId: agent,
      platform,
      action: 'create_requisition',
      object: { type: 'requisition', id: pr, label: record.title, link: record.link },
      summary: `Oracle Fusion agent submitted ${pr} (${ccLabel})`,
      actor: ctx.state.user,
    });
    ctx.complete([record], agent);
    return;
  }
  const req = `REQ00${String(41000 + Math.floor(Math.random() * 900)).padStart(5, '0')}`;
  const record: RecordCard = {
    ...ctx.envelope(agent),
    type: 'record',
    title: `${qty} x Dell Latitude 5450`,
    platform,
    reference: req,
    status: { label: 'Awaiting IT fulfilment', tone: 'neutral' },
    fields: [
      { label: 'Requested for', value: ctx.state.user.displayName },
      { label: 'Quantity', value: qty },
      { label: 'Catalogue item', value: 'Standard laptop · Dell Latitude 5450' },
      { label: 'Fulfilment group', value: 'IT Service Desk' },
    ],
    link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=sc_request.do?sys_id=${req}`, platform },
  };
  ctx.ledger({
    eventType: 'executed',
    journeyId: ctx.journeyId,
    agentId: agent,
    platform,
    action: 'create_request',
    object: { type: 'request', id: req, label: record.title, link: record.link },
    summary: `ServiceNow agent raised ${req}`,
    actor: ctx.state.user,
  });
  ctx.complete([record], agent);
};

const bookRoom: Scenario = async (ctx) => {
  const agent = 'm365';
  await ctx.delay(400);
  ctx.working(agent);
  await ctx.delay(1000);
  const attentionId = randomUUID();
  const confirmation: ConfirmationCard = {
    ...ctx.envelope(agent),
    type: 'confirmation',
    attentionId,
    title: 'Book Al Reem 3',
    proposal: 'Book **Al Reem 3** (seats 8) today 16:00–17:00 and send invitations to the attendees on the thread.',
    willHappen: ['A calendar event is created in your Outlook', 'The room accepts automatically', 'Attendees receive an invitation'],
    evidence: [
      { label: 'Room is free at 16:00', status: 'passed' },
      { label: 'Capacity 8 fits 6 attendees', status: 'passed' },
    ],
    options: [
      { optionId: 'book', label: 'Book it', recommended: true },
      { optionId: 'book-alt', label: 'Try 16:30 instead' },
    ],
    allowFreeText: true,
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  };
  let decision: Decision;
  try {
    decision = await ctx.ask(confirmation, {
      kind: 'confirm',
      title: 'Book Al Reem 3 · 16:00–17:00',
      requester: ctx.state.user,
      subject: 'Meeting room booking',
      agentId: agent,
      platform: 'Microsoft 365',
      evidence: confirmation.evidence,
      options: confirmation.options,
      allowFreeText: true,
      expiresAt: confirmation.expiresAt!,
    });
  } catch {
    return;
  }
  if (decision.optionId === 'reject') {
    ctx.complete([{ ...ctx.envelope(agent), type: 'summary', title: 'Nothing was booked', paragraphs: ['Microsoft 365 agent stood down.'], tone: 'neutral' }], agent);
    return;
  }
  ctx.working(agent);
  await ctx.delay(800);
  const slot = decision.optionId === 'book-alt' ? '16:30–17:30' : '16:00–17:00';
  const id = `BK-${77000 + Math.floor(Math.random() * 900)}`;
  const record: RecordCard = {
    ...ctx.envelope(agent),
    type: 'record',
    title: `Al Reem 3 · Today ${slot}`,
    platform: 'Microsoft 365',
    reference: id,
    status: { label: 'Booked', tone: 'success' },
    fields: [
      { label: 'Organiser', value: ctx.state.user.displayName },
      { label: 'Room', value: 'Al Reem 3 (seats 8)' },
      { label: 'Time', value: `Today ${slot}` },
    ],
    link: { label: 'Open in Outlook', url: `${M365}/calendar/item/${id}`, platform: 'Microsoft 365' },
  };
  ctx.ledger({
    eventType: 'executed',
    journeyId: ctx.journeyId,
    agentId: agent,
    platform: 'Microsoft 365',
    action: 'book_room',
    object: { type: 'booking', id, label: record.title, link: record.link },
    summary: `Microsoft 365 agent booked Al Reem 3 for ${slot.slice(0, 5)}`,
    actor: ctx.state.user,
  });
  ctx.complete([record], agent);
};

const listExpenses: Scenario = async (ctx) => {
  const agent = 'oracle-fusion';
  await ctx.delay(300);
  ctx.working(agent);
  await ctx.delay(1200);
  const table: TableCard = {
    ...ctx.envelope(agent),
    type: 'table',
    title: 'Expense claims awaiting your approval',
    columns: [
      { key: 'ref', label: 'Reference', align: 'start' },
      { key: 'who', label: 'Claimant', align: 'start' },
      { key: 'what', label: 'Description', align: 'start' },
      { key: 'amount', label: 'AED', align: 'end' },
    ],
    rows: [
      { ref: 'EXP-2026-014882', who: 'Reem Al Mazrouei', what: 'Client dinner · Al Bateen', amount: '1,240.00' },
      { ref: 'EXP-2026-014901', who: 'Omar Haddad', what: 'Taxi · airport', amount: '86.00' },
      { ref: 'EXP-2026-014907', who: 'Layla Hassan', what: 'Office supplies', amount: '312.50' },
      { ref: 'EXP-2026-014911', who: 'Reem Al Mazrouei', what: 'Hotel · Riyadh 2 nights', amount: '2,180.00' },
      { ref: 'EXP-2026-014915', who: 'Ahmed Khan', what: 'Parking', amount: '40.00' },
      { ref: 'EXP-2026-014918', who: 'Omar Haddad', what: 'Conference ticket', amount: '1,850.00' },
      { ref: 'EXP-2026-014920', who: 'Layla Hassan', what: 'Team lunch', amount: '640.00' },
      { ref: 'EXP-2026-014922', who: 'Reem Al Mazrouei', what: 'Mobile data · roaming', amount: '155.00' },
      { ref: 'EXP-2026-014925', who: 'Ahmed Khan', what: 'Cables and adapters', amount: '95.00' },
      { ref: 'EXP-2026-014930', who: 'Omar Haddad', what: 'Client coffee', amount: '58.00' },
    ],
    totalRows: 14,
    link: { label: 'Open in Oracle Fusion', url: `${OF}/fscmUI/faces/ExpenseApprovals`, platform: 'Oracle Fusion' },
  };
  ctx.complete([table], agent);
};

const cantHelp: Scenario = async (ctx) => {
  await ctx.delay(700);
  const summary: SummaryCard = {
    ...ctx.envelope('loop-orchestrator'),
    type: 'summary',
    title: 'No agent can do this yet',
    paragraphs: ['Recorded for the Loop team.'],
    tone: 'neutral',
  };
  ctx.complete([summary], 'loop-orchestrator');
};

const failure: Scenario = async (ctx) => {
  const agent = 'servicenow-itsm';
  await ctx.delay(400);
  ctx.working(agent);
  await ctx.delay(1000);
  const summary: SummaryCard = {
    ...ctx.envelope(agent),
    type: 'summary',
    title: 'Could not complete this',
    paragraphs: ['ServiceNow returned `503 Service Unavailable`. Nothing was changed.'],
    tone: 'failure',
    retryable: true,
    link: { label: 'Open in ServiceNow', url: `${SN}/nav_to.do?uri=incident_list.do`, platform: 'ServiceNow' },
  };
  ctx.fail('ServiceNow is not responding.', [summary], agent);
};

export function pickScenario(text: string, state: State): Scenario {
  if (state.knobs.failNextAsk) {
    state.knobs.failNextAsk = false;
    return failure;
  }
  const t = text.toLowerCase();
  if (/\binc\d{5,}\b|\bstatus\b/.test(t)) return trackIncident;
  if (/\b(p[12]|incident|outage|down)\b/.test(t)) return raiseIncident;
  if (/laptop|order/.test(t)) return orderLaptops;
  if (/\broom\b|\bbook\b|meeting/.test(t)) return bookRoom;
  if (/expense|claim|approv/.test(t)) return listExpenses;
  return cantHelp;
}

export function startScenario(state: State, run: JourneyRun, text: string): void {
  const scenario = pickScenario(text, state);
  const ctx = new Ctx(state, run, text);
  state.task(run, 'submitted');
  void scenario(ctx).catch((err) => {
    if (err instanceof Cancelled) return;
    console.error('[mock] scenario error', err);
    state.task(run, 'failed', { message: 'The mock orchestrator hit an internal error.' });
  });
}

/** Triggers from the dev knobs: fresh Attention items or Ledger rows. */
export function trigger(state: State, id: string): boolean {
  const fresh = <T extends AttentionItem>(item: T): T => ({
    ...structuredClone(item),
    attentionId: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    state: 'open',
  });
  switch (id) {
    case 'attention.expense':
      state.addAttention(fresh(expenseApproval));
      return true;
    case 'attention.access':
      state.addAttention(fresh(accessRequest));
      return true;
    case 'attention.costcentre':
      state.addAttention(fresh(costCentreChoice));
      return true;
    case 'attention.auth':
      state.addAttention(fresh(signInAgain));
      return true;
    case 'ledger.append':
      state.appendLedger({
        eventType: 'executed',
        journeyId: randomUUID(),
        agentId: 'm365',
        platform: 'Microsoft 365',
        action: 'send_summary',
        object: { type: 'message', id: `MSG-${Date.now() % 100000}`, label: 'Weekly platform summary' },
        summary: 'Microsoft 365 agent posted the weekly platform summary to Teams',
        actor: state.user,
      });
      return true;
    default:
      return false;
  }
}
