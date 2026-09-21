/**
 * Known sub-agents for the pilot. The real registry is served by the
 * orchestrator; this table is the build-time default so chips always have a
 * name and platform. Unknown ids fall back to the id itself and a `bot` glyph.
 */
export interface AgentInfo {
  agentId: string;
  displayName: string;
  platform: string;
}

export const ORCHESTRATOR_AGENT_ID = 'loop-orchestrator';

export const AGENTS: Record<string, AgentInfo> = {
  'loop-orchestrator': { agentId: 'loop-orchestrator', displayName: 'Loop', platform: 'Loop' },
  'servicenow-itsm': { agentId: 'servicenow-itsm', displayName: 'ServiceNow agent', platform: 'ServiceNow' },
  'oracle-fusion': { agentId: 'oracle-fusion', displayName: 'Oracle Fusion agent', platform: 'Oracle Fusion' },
  snowflake: { agentId: 'snowflake', displayName: 'Snowflake agent', platform: 'Snowflake' },
  m365: { agentId: 'm365', displayName: 'Microsoft 365 agent', platform: 'Microsoft 365' },
  outsystems: { agentId: 'outsystems', displayName: 'OutSystems agent', platform: 'OutSystems' },
};

export function agentInfo(agentId: string): AgentInfo {
  return AGENTS[agentId] ?? { agentId, displayName: `${agentId} agent`, platform: agentId };
}

export const PLATFORMS = Array.from(new Set(Object.values(AGENTS).map((a) => a.platform))).filter(
  (p) => p !== 'Loop',
);
