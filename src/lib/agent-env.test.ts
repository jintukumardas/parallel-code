import { describe, it, expect } from 'vitest';
import { parseAgentEnv, formatAgentEnv, sanitizeAgentEnv } from './agent-env';

describe('parseAgentEnv', () => {
  it('parses KEY=VALUE lines', () => {
    expect(parseAgentEnv('CLAUDE_CONFIG_DIR=~/.claude-work\nFOO=bar')).toEqual({
      CLAUDE_CONFIG_DIR: '~/.claude-work',
      FOO: 'bar',
    });
  });

  it('skips blank lines and comments, and tolerates an export prefix', () => {
    expect(parseAgentEnv('\n# a comment\nexport FOO=bar\n')).toEqual({ FOO: 'bar' });
  });

  it('keeps "=" inside the value', () => {
    expect(parseAgentEnv('TOKEN=a=b=c')).toEqual({ TOKEN: 'a=b=c' });
  });

  it('strips one matching pair of surrounding quotes', () => {
    expect(parseAgentEnv('A="quoted"\nB=\'single\'\nC="mixed\'')).toEqual({
      A: 'quoted',
      B: 'single',
      C: '"mixed\'',
    });
  });

  it('drops keys no child process could take, and lines without "="', () => {
    expect(parseAgentEnv('1BAD=x\nBAD-KEY=x\nnot-an-assignment\nOK=y')).toEqual({ OK: 'y' });
  });

  it('returns undefined when nothing usable remains', () => {
    expect(parseAgentEnv('')).toBeUndefined();
    expect(parseAgentEnv('# only a comment')).toBeUndefined();
  });

  it('round-trips through formatAgentEnv', () => {
    const env = { CLAUDE_CONFIG_DIR: '/home/u/.claude-work', FOO: 'bar' };
    expect(parseAgentEnv(formatAgentEnv(env))).toEqual(env);
  });

  it('formats undefined as an empty string', () => {
    expect(formatAgentEnv(undefined)).toBe('');
  });
});

describe('sanitizeAgentEnv', () => {
  it('keeps string values under usable keys', () => {
    expect(sanitizeAgentEnv({ FOO: 'bar' })).toEqual({ FOO: 'bar' });
  });

  it('drops non-string values and unusable keys', () => {
    expect(sanitizeAgentEnv({ FOO: 'bar', NUM: 1, NESTED: { a: 1 }, 'BAD-KEY': 'x' })).toEqual({
      FOO: 'bar',
    });
  });

  it('rejects non-records, so a corrupted settings file cannot reach a spawn', () => {
    expect(sanitizeAgentEnv(null)).toBeUndefined();
    expect(sanitizeAgentEnv('FOO=bar')).toBeUndefined();
    expect(sanitizeAgentEnv(['FOO=bar'])).toBeUndefined();
    expect(sanitizeAgentEnv({})).toBeUndefined();
  });
});
