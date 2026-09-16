/**
 * `AgentDef.env` is edited as `KEY=VALUE` lines — the same shape as the agent
 * env file, so one mental model covers both. The file stays the place for
 * secrets (only its path is persisted); these values live in the settings JSON,
 * which is why the editor is described as the home for profile switches rather
 * than credentials.
 */

/** Shell identifier rule, matching the env-file parser: anything else cannot be
 *  passed to a child process, so it is dropped rather than silently mangled. */
const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Strips one matching pair of surrounding quotes, so a value pasted from a
 *  `.env` file does not arrive with the quotes baked into it. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value[value.length - 1] === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parses the editor's textarea into an env record. Blank lines and `#` comments
 * are skipped, an `export ` prefix is tolerated, and lines without `=` or with
 * an unusable key are dropped. Returns undefined when nothing usable remains, so
 * an agent with no env vars carries no `env` key at all.
 */
export function parseAgentEnv(text: string): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, '');
    if (!VALID_KEY.test(key)) continue;
    env[key] = unquote(line.slice(eq + 1).trim());
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

/** Renders an env record back into editable `KEY=VALUE` lines. */
export function formatAgentEnv(env: Record<string, string> | undefined): string {
  if (!env) return '';
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/**
 * Narrows an untrusted value (a restored settings file) to an env record,
 * dropping entries that are not strings or whose key is unusable. Returns
 * undefined when nothing usable remains.
 */
export function sanitizeAgentEnv(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && VALID_KEY.test(k)) env[k] = v;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}
