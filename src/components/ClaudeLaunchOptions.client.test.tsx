import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeLaunchOptions } from './ClaudeLaunchOptions';
import type { ClaudeProfile } from '../ipc/types';

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
});

const profiles: ClaudeProfile[] = [
  { id: '.claude', name: 'Default', configDir: '/home/me/.claude', isDefault: true },
  { id: '.claude-work', name: 'work', configDir: '/home/me/.claude-work', isDefault: false },
];

function mount(props: Partial<Parameters<typeof ClaudeLaunchOptions>[0]> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const onProfileChange = vi.fn();
  disposers.push(
    render(
      () => (
        <ClaudeLaunchOptions
          profiles={profiles}
          profileDir=""
          model=""
          effort=""
          onProfileChange={onProfileChange}
          onModelChange={() => undefined}
          onEffortChange={() => undefined}
          {...props}
        />
      ),
      container,
    ),
  );
  // Ids are generated, so the fields are addressed by their visible label.
  const select = (label: string): HTMLSelectElement => {
    const labelEl = Array.from(container.querySelectorAll('label')).find(
      (l) => l.textContent?.trim() === label,
    );
    const el = labelEl?.htmlFor
      ? container.querySelector<HTMLSelectElement>(`#${labelEl.htmlFor}`)
      : null;
    if (!el) throw new Error(`No select labelled ${label}`);
    return el;
  };
  return { container, select, onProfileChange };
}

describe('ClaudeLaunchOptions', () => {
  it('offers the discovered profiles, with Default standing for "leave it unset"', () => {
    const { select } = mount();
    expect(Array.from(select('Profile').options, (o) => [o.textContent, o.value])).toEqual([
      ['Default', ''],
      ['work', '/home/me/.claude-work'],
    ]);
  });

  it('offers every model and effort level plus a default', () => {
    const { select } = mount();
    expect(Array.from(select('Model').options, (o) => o.value)).toEqual([
      '',
      'fable',
      'opus',
      'sonnet',
      'haiku',
    ]);
    expect(Array.from(select('Effort').options, (o) => o.value)).toEqual([
      '',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('shows the current selection', () => {
    const { select } = mount({
      profileDir: '/home/me/.claude-work',
      model: 'opus',
      effort: 'high',
    });
    expect(select('Profile').value).toBe('/home/me/.claude-work');
    expect(select('Model').value).toBe('opus');
    expect(select('Effort').value).toBe('high');
  });

  // Container credentials are mounted separately, so a host config dir is not
  // something the task could honour.
  it('disables the profile picker and shows the default in Docker mode', () => {
    const { select } = mount({ profileDir: '/home/me/.claude-work', dockerMode: true });
    expect(select('Profile').disabled).toBe(true);
    expect(select('Profile').value).toBe('');
    // Model and effort still apply inside a container.
    expect(select('Model').disabled).toBe(false);
  });

  it('tells the user how to create a profile when only the default exists', () => {
    const { container } = mount({ profiles: [profiles[0]] });
    expect(container.textContent).toContain('CLAUDE_CONFIG_DIR=~/.claude-<name>');
  });
});
