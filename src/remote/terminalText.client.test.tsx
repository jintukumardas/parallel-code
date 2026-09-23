import { describe, it, expect } from 'vitest';
import { Terminal } from '@xterm/xterm';
import { BufferReader, paletteColor, type OutputLine } from './terminalText';

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

function texts(lines: OutputLine[]): string[] {
  return lines.map((l) => (l.rule ? '---' : l.runs.map((r) => r.text).join('')));
}

describe('BufferReader', () => {
  it('joins soft-wrapped rows into one line so the phone can re-wrap it', async () => {
    const term = new Terminal({ cols: 10, rows: 5, allowProposedApi: true });
    await write(term, 'abcdefghijKLMNO\r\nnext');
    expect(texts(new BufferReader().read(term))).toEqual(['abcdefghijKLMNO', 'next']);
    term.dispose();
  });

  it('turns dash rows into rules, strips box borders, and drops blank padding', async () => {
    const term = new Terminal({ cols: 20, rows: 10, allowProposedApi: true });
    await write(term, '────────────────\r\n│ hello        │\r\n\r\n\r\n\r\ntail\r\n\r\n');
    expect(texts(new BufferReader().read(term))).toEqual(['---', 'hello', '', 'tail']);
    term.dispose();
  });

  it('keeps colour and weight as inline styles', async () => {
    const term = new Terminal({ cols: 20, rows: 3, allowProposedApi: true });
    await write(term, 'a\x1b[1;31mred\x1b[0m');
    const [line] = new BufferReader().read(term);
    expect(line.runs).toEqual([
      { text: 'a', style: '' },
      { text: 'red', style: `color:${paletteColor(1)};font-weight:700;` },
    ]);
    term.dispose();
  });

  it('reflects in-place redraws of the live screen', async () => {
    const term = new Terminal({ cols: 20, rows: 3, allowProposedApi: true });
    const reader = new BufferReader();
    await write(term, 'Working 1');
    expect(texts(reader.read(term))).toEqual(['Working 1']);
    await write(term, '\r\x1b[2KWorking 2');
    expect(texts(reader.read(term))).toEqual(['Working 2']);
    term.dispose();
  });

  it('keeps history in order once scrollback is full and trimming starts', async () => {
    const term = new Terminal({ cols: 20, rows: 3, scrollback: 5, allowProposedApi: true });
    const reader = new BufferReader();
    for (let i = 1; i <= 20; i++) {
      await write(term, `line ${i}\r\n`);
      reader.read(term);
    }
    const expected = texts(new BufferReader().read(term));
    expect(texts(reader.read(term))).toEqual(expected);
    expect(expected[expected.length - 1]).toBe('line 20');
    term.dispose();
  });

  it('reuses unchanged line objects between reads', async () => {
    const term = new Terminal({ cols: 20, rows: 3, allowProposedApi: true });
    const reader = new BufferReader();
    await write(term, 'first\r\nsecond');
    const a = reader.read(term);
    await write(term, '!');
    const b = reader.read(term);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
    term.dispose();
  });
});
