import { describe, expect, it } from 'vitest';

import {
  launchOptionsBadge,
  profileLabelForDir,
  supportsClaudeLaunchOptions,
  taskProfileEnv,
  validClaudeEffort,
  validClaudeModel,
} from './agent-profile';

const claude = { command: 'claude' };

describe('supportsClaudeLaunchOptions', () => {
  it('matches the CLI by bare name and by absolute path', () => {
    expect(supportsClaudeLaunchOptions(claude)).toBe(true);
    expect(supportsClaudeLaunchOptions({ command: '/opt/homebrew/bin/claude' })).toBe(true);
  });

  it('does not match other agents or a missing selection', () => {
    expect(supportsClaudeLaunchOptions({ command: 'codex' })).toBe(false);
    expect(supportsClaudeLaunchOptions({ command: 'claude-monet' })).toBe(false);
    expect(supportsClaudeLaunchOptions(null)).toBe(false);
  });
});

describe('taskProfileEnv', () => {
  it('sets CLAUDE_CONFIG_DIR for a chosen profile', () => {
    expect(taskProfileEnv({ agentProfileDir: '/home/me/.claude-work' }, claude)).toEqual({
      CLAUDE_CONFIG_DIR: '/home/me/.claude-work',
    });
  });

  // The default profile must leave the variable alone: an inherited value, or
  // one the agent definition sets, is what the user already expects to run.
  it('sets nothing for the default profile', () => {
    expect(taskProfileEnv({}, claude)).toEqual({});
    expect(taskProfileEnv({ agentProfileDir: '' }, claude)).toEqual({});
  });

  it('sets nothing in Docker, where the host path does not exist', () => {
    expect(
      taskProfileEnv({ agentProfileDir: '/home/me/.claude-work', dockerMode: true }, claude),
    ).toEqual({});
  });

  it('sets nothing for an agent that does not read the variable', () => {
    expect(
      taskProfileEnv({ agentProfileDir: '/home/me/.claude-work' }, { command: 'codex' }),
    ).toEqual({});
  });
});

describe('validClaudeModel / validClaudeEffort', () => {
  it('accepts known values', () => {
    expect(validClaudeModel('opus')).toBe('opus');
    expect(validClaudeEffort('xhigh')).toBe('xhigh');
  });

  // Persisted state is hand-editable and survives across app versions.
  it('drops anything else', () => {
    expect(validClaudeModel('gpt-5')).toBeUndefined();
    expect(validClaudeModel(7)).toBeUndefined();
    expect(validClaudeEffort('extreme')).toBeUndefined();
    expect(validClaudeEffort(undefined)).toBeUndefined();
  });
});

describe('launchOptionsBadge', () => {
  const task = {
    agentProfileDir: '/home/me/.claude-work',
    agentModel: 'opus',
    agentEffort: 'high',
  };

  it('summarises profile, model and effort', () => {
    expect(launchOptionsBadge(task, claude)).toEqual({
      label: 'work · opus · high',
      title: 'Profile: work (/home/me/.claude-work)\nModel: opus\nEffort: high',
    });
  });

  it('lists only what the task set', () => {
    expect(launchOptionsBadge({ agentModel: 'sonnet' }, claude)?.label).toBe('sonnet');
    expect(
      launchOptionsBadge({ agentProfileDir: '/home/me/.claude-personal' }, claude)?.label,
    ).toBe('personal');
  });

  // Nothing to say about a task running the CLI's own defaults.
  it('is absent for a default task or a non-Claude agent', () => {
    expect(launchOptionsBadge({}, claude)).toBeNull();
    expect(launchOptionsBadge(task, { command: 'codex' })).toBeNull();
    expect(launchOptionsBadge(task, null)).toBeNull();
  });

  // The profile is not applied in a container, so the chip must not claim it.
  it('drops the profile in Docker mode but keeps model and effort', () => {
    expect(launchOptionsBadge({ ...task, dockerMode: true }, claude)?.label).toBe('opus · high');
  });
});

describe('profileLabelForDir', () => {
  it('strips the .claude- prefix, and the dot for the default dir', () => {
    expect(profileLabelForDir('/home/me/.claude-work')).toBe('work');
    expect(profileLabelForDir('/home/me/.claude')).toBe('claude');
  });

  it('falls back to the directory name for a path that is not a sibling', () => {
    expect(profileLabelForDir('/opt/shared/claude-config')).toBe('claude-config');
    expect(profileLabelForDir('/home/me/.claude-work/')).toBe('work');
  });
});
