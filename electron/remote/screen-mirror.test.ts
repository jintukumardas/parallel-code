import { describe, it, expect } from 'vitest';
import xtermHeadless from '@xterm/headless';
import { ScreenMirror } from './screen-mirror.js';

const bytes = (s: string) => Buffer.from(s, 'utf8');

function snapshot(mirror: ScreenMirror): Promise<string> {
  return new Promise((resolve) => mirror.snapshot(resolve));
}

/** Replay a snapshot into a fresh terminal and read back its text lines. */
async function replay(data: string, cols: number, rows: number): Promise<string[]> {
  const term = new xtermHeadless.Terminal({ cols, rows, scrollback: 20_000 });
  await new Promise<void>((resolve) => term.write(data, resolve));
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let y = 0; y < buffer.length; y++) {
    lines.push(buffer.getLine(y)?.translateToString(true) ?? '');
  }
  term.dispose();
  return lines;
}

describe('ScreenMirror', () => {
  it('keeps history that a 1 MB raw replay would have lost', async () => {
    const mirror = new ScreenMirror(80, 24);
    mirror.write(bytes('first message\r\n'));
    // A spinner redrawing in place: lots of bytes, no new lines.
    const frame = '\r\x1b[2K\x1b[38;5;208m✻ Thinking…\x1b[0m';
    for (let i = 0; i < 40_000; i++) mirror.write(bytes(frame));
    mirror.write(bytes('\r\nlast message\r\n'));

    const lines = await replay(await snapshot(mirror), 80, 24);
    expect(lines).toContain('first message');
    expect(lines).toContain('last message');
    mirror.dispose();
  });

  it('snapshots only output written before the call', async () => {
    const mirror = new ScreenMirror(40, 5);
    mirror.write(bytes('before\r\n'));
    const pending = snapshot(mirror);
    mirror.write(bytes('after\r\n'));

    const lines = await replay(await pending, 40, 5);
    expect(lines).toContain('before');
    expect(lines).not.toContain('after');
    mirror.dispose();
  });

  it('follows the PTY size', async () => {
    const mirror = new ScreenMirror(20, 5);
    mirror.resize(60, 5);
    mirror.write(bytes(`${'x'.repeat(50)}\r\n`));

    const lines = await replay(await snapshot(mirror), 60, 5);
    expect(lines).toContain('x'.repeat(50));
    mirror.dispose();
  });
});
