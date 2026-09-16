import { createUniqueId, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { theme, sectionLabelStyle } from '../lib/theme';
import { CLAUDE_EFFORTS, CLAUDE_MODELS } from '../lib/agent-profile';
import type { ClaudeProfile } from '../ipc/types';

interface ClaudeLaunchOptionsProps {
  profiles: ClaudeProfile[];
  /** Config dir of the chosen profile; `''` is the default profile. */
  profileDir: string;
  model: string;
  effort: string;
  /** Docker tasks get their own mounted credentials, so a host profile dir
   *  would point at a path the container cannot see. */
  dockerMode?: boolean;
  onProfileChange: (configDir: string) => void;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
}

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

/**
 * Which login (`CLAUDE_CONFIG_DIR`), model and effort the Claude CLI starts on.
 * Every field defaults to leaving the CLI alone, so an unchanged panel launches
 * exactly what it launched before these controls existed.
 */
export function ClaudeLaunchOptions(props: ClaudeLaunchOptionsProps) {
  // The default profile is offered whether or not `~/.claude` was found: it is
  // "don't set CLAUDE_CONFIG_DIR", which is always a valid choice.
  const namedProfiles = () => props.profiles.filter((p) => !p.isDefault);
  const profileId = createUniqueId();
  const modelId = createUniqueId();
  const effortId = createUniqueId();

  const fieldStyle: JSX.CSSProperties = {
    display: 'flex',
    'flex-direction': 'column',
    gap: '6px',
    flex: '1 1 0',
    'min-width': '0',
  };

  return (
    <div
      data-nav-field="claude-options"
      style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
    >
      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle} for={profileId}>
            Profile
          </label>
          <select
            id={profileId}
            class="form-select"
            disabled={props.dockerMode}
            title={
              props.dockerMode
                ? 'Docker tasks use the container’s own agent credentials.'
                : undefined
            }
            value={props.dockerMode ? '' : props.profileDir}
            onChange={(e) => props.onProfileChange(e.currentTarget.value)}
          >
            <Dynamic component="button" type="button">
              <Dynamic component="selectedcontent" />
            </Dynamic>
            <option value="">Default</option>
            <For each={namedProfiles()}>
              {(profile) => <option value={profile.configDir}>{profile.name}</option>}
            </For>
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={sectionLabelStyle} for={modelId}>
            Model
          </label>
          <select
            id={modelId}
            class="form-select"
            value={props.model}
            onChange={(e) => props.onModelChange(e.currentTarget.value)}
          >
            <Dynamic component="button" type="button">
              <Dynamic component="selectedcontent" />
            </Dynamic>
            <option value="">Default</option>
            <For each={CLAUDE_MODELS}>
              {(model) => <option value={model.value}>{model.label}</option>}
            </For>
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={sectionLabelStyle} for={effortId}>
            Effort
          </label>
          <select
            id={effortId}
            class="form-select"
            value={props.effort}
            onChange={(e) => props.onEffortChange(e.currentTarget.value)}
          >
            <Dynamic component="button" type="button">
              <Dynamic component="selectedcontent" />
            </Dynamic>
            <option value="">Default</option>
            <For each={CLAUDE_EFFORTS}>
              {(effort) => <option value={effort}>{EFFORT_LABELS[effort]}</option>}
            </For>
          </select>
        </div>
      </div>

      <Show when={!props.dockerMode && props.profiles.length <= 1}>
        <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
          Add a profile by running Claude Code with{' '}
          <code>CLAUDE_CONFIG_DIR=~/.claude-&lt;name&gt;</code> once; it then appears here.
        </span>
      </Show>
    </div>
  );
}
