import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listClaudeProfiles } from './claude-profiles.js';

describe('listClaudeProfiles', () => {
  let home: string;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

  /** A dir the CLI would have written to, i.e. one worth offering. */
  function makeProfile(name: string): string {
    const dir = path.join(home, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.json'), '{}');
    return dir;
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-profiles-'));
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
  });

  it('finds the default dir and its suffixed siblings, default first', () => {
    makeProfile('.claude-work');
    makeProfile('.claude');
    makeProfile('.claude-personal');

    expect(listClaudeProfiles(home)).toEqual([
      { id: '.claude', name: 'Default', configDir: path.join(home, '.claude'), isDefault: true },
      {
        id: '.claude-personal',
        name: 'personal',
        configDir: path.join(home, '.claude-personal'),
        isDefault: false,
      },
      {
        id: '.claude-work',
        name: 'work',
        configDir: path.join(home, '.claude-work'),
        isDefault: false,
      },
    ]);
  });

  // Anything can sit in a home directory; only dirs the CLI has actually used
  // belong in a picker that switches which login a task runs under.
  it('ignores dirs without a config marker, files and unrelated names', () => {
    fs.mkdirSync(path.join(home, '.claude-empty'));
    fs.mkdirSync(path.join(home, '.claudius'));
    fs.writeFileSync(path.join(home, '.claude-notes'), 'text');
    makeProfile('.claude');

    expect(listClaudeProfiles(home).map((p) => p.id)).toEqual(['.claude']);
  });

  it('accepts a profile dir that is a symlink, as a dotfiles checkout gives', () => {
    const real = path.join(home, 'dotfiles', 'claude-work');
    fs.mkdirSync(real, { recursive: true });
    fs.writeFileSync(path.join(real, '.claude.json'), '{}');
    fs.symlinkSync(real, path.join(home, '.claude-work'));

    expect(listClaudeProfiles(home).map((p) => p.name)).toEqual(['work']);
  });

  // The app may itself have been launched under a profile; that is the config
  // the tasks would use silently, so the picker has to name it.
  it('appends an inherited CLAUDE_CONFIG_DIR that is not in the home dir', () => {
    makeProfile('.claude');
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'external-claude-'));
    process.env.CLAUDE_CONFIG_DIR = external;

    try {
      expect(listClaudeProfiles(home).map((p) => p.configDir)).toEqual([
        path.join(home, '.claude'),
        external,
      ]);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it('does not duplicate an inherited dir it already found', () => {
    const dir = makeProfile('.claude-work');
    process.env.CLAUDE_CONFIG_DIR = dir;

    expect(listClaudeProfiles(home)).toHaveLength(1);
  });

  it('returns nothing when the home dir is unreadable', () => {
    expect(listClaudeProfiles(path.join(home, 'missing'))).toEqual([]);
  });
});
