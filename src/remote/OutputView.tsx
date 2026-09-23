import { For, Index, Show, createEffect, createSignal, on, onMount } from 'solid-js';
import type { OutputLine } from './terminalText';

// Chat-style reading view of an agent's terminal: text wraps to the phone's
// width and the page scrolls natively (momentum, rotation, and all), instead of
// a fixed desktop-width terminal grid.

/** How many lines to render at first, and per "Show earlier" tap. Keeps the
 *  DOM small on phones even with a full 10k-line scrollback. */
const PAGE = 1500;
/** Within this many px of the bottom counts as "following" new output. */
const STICKY_PX = 48;

interface OutputViewProps {
  lines: OutputLine[];
  fontSize: number;
  /** Set to a new value to jump to the latest output. */
  scrollToEndSignal: number;
  onAtBottomChange: (atBottom: boolean) => void;
}

export function OutputView(props: OutputViewProps) {
  let scroller: HTMLDivElement | undefined;
  const [limit, setLimit] = createSignal(PAGE);
  let following = true;

  const hidden = () => Math.max(0, props.lines.length - limit());
  const visible = () => (hidden() > 0 ? props.lines.slice(hidden()) : props.lines);

  function toEnd(): void {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function onScroll(): void {
    if (!scroller) return;
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    following = gap < STICKY_PX;
    props.onAtBottomChange(following);
  }

  // New output (or a font change): stay pinned to the bottom if the reader was
  // already there; otherwise leave their position alone.
  createEffect(
    on(
      () => [props.lines, props.fontSize],
      () => {
        if (following) requestAnimationFrame(toEnd);
      },
    ),
  );

  createEffect(
    on(
      () => props.scrollToEndSignal,
      () => {
        following = true;
        requestAnimationFrame(toEnd);
      },
      { defer: true },
    ),
  );

  function showEarlier(): void {
    if (!scroller) return;
    // Keep the current text in place while older lines are added above it.
    const fromBottom = scroller.scrollHeight - scroller.scrollTop;
    setLimit((n) => n + PAGE);
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight - fromBottom;
    });
  }

  onMount(() => requestAnimationFrame(toEnd));

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      style={{
        flex: '1',
        'min-height': '0',
        'overflow-y': 'auto',
        'overflow-x': 'hidden',
        'overscroll-behavior': 'contain',
        '-webkit-overflow-scrolling': 'touch',
        padding: '10px 14px 16px',
        'font-family': "'JetBrains Mono', ui-monospace, 'Courier New', monospace",
        'font-size': `${props.fontSize}px`,
        'line-height': '1.5',
        color: '#d7e4f0',
        background: '#0b0f14',
      }}
    >
      <Show when={hidden() > 0}>
        <button
          type="button"
          onClick={showEarlier}
          class="pc-tap"
          style={{
            display: 'block',
            margin: '0 auto 12px',
            padding: '8px 14px',
            background: '#1a2430',
            border: '1px solid #223040',
            'border-radius': '999px',
            color: '#9bb0c3',
            'font-size': '13px',
            'font-family': 'inherit',
            cursor: 'pointer',
          }}
        >
          Show earlier output ({hidden()} lines)
        </button>
      </Show>
      <Show when={props.lines.length === 0}>
        <div style={{ color: '#678197', 'text-align': 'center', 'padding-top': '40px' }}>
          Waiting for output…
        </div>
      </Show>
      <Index each={visible()}>
        {(line) => (
          <Show
            when={!line().rule}
            fallback={<div style={{ 'border-top': '1px solid #223040', margin: '8px 0' }} />}
          >
            <div
              style={{
                'white-space': 'pre-wrap',
                'overflow-wrap': 'anywhere',
                'min-height': '1.5em',
              }}
            >
              <For each={line().runs}>
                {(run) => (run.style ? <span style={run.style}>{run.text}</span> : run.text)}
              </For>
            </div>
          </Show>
        )}
      </Index>
    </div>
  );
}
