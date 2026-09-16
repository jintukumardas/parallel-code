import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ClaudeProfile } from './shared-types.js';

/** `~/.claude` plus any `~/.claude-<name>` sibling — the shape the CLI's own
 *  `CLAUDE_CONFIG_DIR` convention produces. */
const PROFILE_DIR_PATTERN = /^\.claude(?:-([A-Za-z0-9][A-Za-z0-9._-]*))?$/;

/** A config dir the CLI has actually used writes at least one of these. The
 *  check keeps unrelated dotfolders (`.claude-backup`, a stray `.claude-old`
 *  tarball dir) out of a picker the user is meant to trust. */
const PROFILE_MARKERS = ['settings.json', '.claude.json', 'history.jsonl', 'projects', 'sessions'];

function looksLikeConfigDir(dir: string): boolean {
  return PROFILE_MARKERS.some((marker) => fs.existsSync(path.join(dir, marker)));
}

/** Label shown in the picker: `.claude-work` → "work", `.claude` → "Default". */
function profileLabel(suffix: string | undefined): string {
  return suffix ?? 'Default';
}

/**
 * Claude config dirs found in the user's home, sorted with the default first. `~/.claude` is reported with `isDefault: true` and is the
 * one the app launches when no profile is chosen, so callers pass no
 * `CLAUDE_CONFIG_DIR` for it and leave any inherited value alone.
 *
 * A `CLAUDE_CONFIG_DIR` already set in the app's own environment is appended
 * when it points somewhere else: that is the profile this app would otherwise
 * use silently, so it belongs in the list.
 *
 * `home` is a parameter only so tests can point it at a fixture directory.
 */
export function listClaudeProfiles(home: string = os.homedir()): ClaudeProfile[] {
  const profiles: ClaudeProfile[] = [];

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(home, { withFileTypes: true });
  } catch {
    return profiles;
  }

  for (const entry of entries) {
    // Symlinked profile dirs are common (a dotfiles repo checkout); isDirectory()
    // alone would drop them, so resolve before testing.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const match = PROFILE_DIR_PATTERN.exec(entry.name);
    if (!match) continue;
    const dir = path.join(home, entry.name);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!looksLikeConfigDir(dir)) continue;
    profiles.push({
      id: entry.name,
      name: profileLabel(match[1]),
      configDir: dir,
      isDefault: match[1] === undefined,
    });
  }

  profiles.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const external = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (external && !profiles.some((p) => p.configDir === path.resolve(external))) {
    const resolved = path.resolve(external);
    profiles.push({
      id: resolved,
      name: path.basename(resolved).replace(/^\./, ''),
      configDir: resolved,
      isDefault: false,
    });
  }

  return profiles;
}
