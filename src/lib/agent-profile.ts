import type { AgentDef } from '../ipc/types';

/** Env var the Claude CLI reads to pick which config dir (profile) to use. */
export const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';

/** Model aliases offered at task creation. The CLI resolves an alias to the
 *  latest model in that family, so this list does not go stale on releases. */
export const CLAUDE_MODELS = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
] as const;

/** `claude --effort <level>`. */
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

function baseCommand(command: string): string {
  return command.split('/').pop() ?? command;
}

/**
 * Whether the agent takes `--model`, `--effort` and `CLAUDE_CONFIG_DIR`.
 * Matched on the command rather than the agent id so a custom agent wrapping
 * the same CLI (a second profile, an absolute path) gets the controls too.
 */
export function supportsClaudeLaunchOptions(agentDef: Pick<AgentDef, 'command'> | null): boolean {
  return !!agentDef && baseCommand(agentDef.command) === 'claude';
}

/** Narrows a restored/persisted value to a known model alias. */
export function validClaudeModel(value: unknown): string | undefined {
  return typeof value === 'string' && CLAUDE_MODELS.some((m) => m.value === value)
    ? value
    : undefined;
}

/** Narrows a restored/persisted value to a known effort level. */
export function validClaudeEffort(value: unknown): ClaudeEffort | undefined {
  return typeof value === 'string' && (CLAUDE_EFFORTS as readonly string[]).includes(value)
    ? (value as ClaudeEffort)
    : undefined;
}

/**
 * Env overriding the agent's own profile for one task. Empty for the default
 * profile so an inherited `CLAUDE_CONFIG_DIR` — or one an agent def sets — keeps
 * working, and empty under Docker, where the host path does not exist inside the
 * container (container auth is mounted separately, see buildDockerCredentialMounts).
 */
export function taskProfileEnv(
  task: { agentProfileDir?: string; dockerMode?: boolean },
  agentDef: Pick<AgentDef, 'command'> | null,
): Record<string, string> {
  if (!task.agentProfileDir || task.dockerMode) return {};
  if (!supportsClaudeLaunchOptions(agentDef)) return {};
  return { [CLAUDE_CONFIG_DIR_ENV]: task.agentProfileDir };
}

/** Picker label for a config dir: `/home/me/.claude-work` → "work", matching
 *  the naming the backend's discovery produces. */
export function profileLabelForDir(configDir: string): string {
  const base = configDir.split('/').filter(Boolean).pop() ?? configDir;
  const suffix = /^\.claude-(.+)$/.exec(base);
  return suffix ? suffix[1] : base.replace(/^\./, '');
}

export interface LaunchOptionsBadge {
  label: string;
  title: string;
}

/**
 * Short "what is this task actually running" chip for the agent terminal, or
 * null when the task launches the CLI's own defaults and there is nothing worth
 * saying. The profile comes from `taskProfileEnv`, so the chip can never claim a
 * profile the spawn does not set — under Docker it drops out of both.
 */
export function launchOptionsBadge(
  task: {
    agentProfileDir?: string;
    agentModel?: string;
    agentEffort?: string;
    dockerMode?: boolean;
  },
  agentDef: Pick<AgentDef, 'command'> | null,
): LaunchOptionsBadge | null {
  if (!supportsClaudeLaunchOptions(agentDef)) return null;

  const profileDir = taskProfileEnv(task, agentDef)[CLAUDE_CONFIG_DIR_ENV];
  const parts: Array<{ label: string; title: string }> = [];
  if (profileDir) {
    parts.push({
      label: profileLabelForDir(profileDir),
      title: `Profile: ${profileLabelForDir(profileDir)} (${profileDir})`,
    });
  }
  if (task.agentModel) parts.push({ label: task.agentModel, title: `Model: ${task.agentModel}` });
  if (task.agentEffort) {
    parts.push({ label: task.agentEffort, title: `Effort: ${task.agentEffort}` });
  }
  if (parts.length === 0) return null;

  return {
    label: parts.map((p) => p.label).join(' · '),
    title: parts.map((p) => p.title).join('\n'),
  };
}
