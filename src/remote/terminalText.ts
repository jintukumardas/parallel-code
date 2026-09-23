// Turns an xterm.js buffer into plain, styled lines for the mobile "Output"
// view: text that wraps to the phone's width and scrolls natively, instead of a
// fixed-width terminal grid formatted for the desktop.
//
// The xterm instance stays the source of truth (it parses the PTY stream,
// cursor moves and redraws included); this module only reads its buffer.
// Scrollback above the live screen never changes in a normal buffer, so rows
// are cached and each read only re-renders the live screen plus whatever
// scrolled into history since the last read.

import type { IBufferCell, IBufferLine, IMarker, Terminal } from '@xterm/xterm';

export interface TextRun {
  text: string;
  /** Inline CSS for this run; '' means default styling. */
  style: string;
}

export interface OutputLine {
  runs: TextRun[];
  /** A horizontal rule (a row of box-drawing dashes) — rendered as a divider
   *  instead of text that would wrap into several lines of dashes. */
  rule: boolean;
  /** Content signature; equal signatures mean an identical line. */
  sig: string;
}

// xterm's default 16-colour palette, which the remote terminal also uses.
const ANSI_16 = [
  '#2e3436',
  '#cc0000',
  '#4e9a06',
  '#c4a000',
  '#3465a4',
  '#75507b',
  '#06989a',
  '#d3d7cf',
  '#555753',
  '#ef2929',
  '#8ae234',
  '#fce94f',
  '#729fcf',
  '#ad7fa8',
  '#34e2e2',
  '#eeeeec',
];

export const DEFAULT_FG = '#d7e4f0';
export const DEFAULT_BG = '#0b0f14';

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

export function paletteColor(index: number): string {
  if (index < 16) return ANSI_16[index] ?? DEFAULT_FG;
  if (index < 232) {
    const i = index - 16;
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `#${hex(level(Math.floor(i / 36)))}${hex(level(Math.floor(i / 6) % 6))}${hex(level(i % 6))}`;
  }
  const grey = 8 + (index - 232) * 10;
  return `#${hex(grey)}${hex(grey)}${hex(grey)}`;
}

function rgbColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function fgOf(cell: IBufferCell): string | null {
  if (cell.isFgRGB()) return rgbColor(cell.getFgColor());
  if (cell.isFgPalette()) return paletteColor(cell.getFgColor());
  return null;
}

function bgOf(cell: IBufferCell): string | null {
  if (cell.isBgRGB()) return rgbColor(cell.getBgColor());
  if (cell.isBgPalette()) return paletteColor(cell.getBgColor());
  return null;
}

function cellStyle(cell: IBufferCell): string {
  if (cell.isAttributeDefault()) return '';
  let fg = fgOf(cell);
  let bg = bgOf(cell);
  if (cell.isInverse()) {
    [fg, bg] = [bg ?? DEFAULT_BG, fg ?? DEFAULT_FG];
  }
  let s = '';
  if (fg) s += `color:${fg};`;
  if (bg) s += `background:${bg};`;
  if (cell.isBold()) s += 'font-weight:700;';
  if (cell.isDim()) s += 'opacity:0.65;';
  if (cell.isItalic()) s += 'font-style:italic;';
  if (cell.isUnderline()) s += 'text-decoration:underline;';
  if (cell.isStrikethrough()) s += 'text-decoration:line-through;';
  if (cell.isInvisible()) s += 'visibility:hidden;';
  return s;
}

/** Render one physical buffer row into styled runs, dropping trailing blanks. */
export function readRow(line: IBufferLine, cols: number, cell: IBufferCell): TextRun[] {
  const runs: TextRun[] = [];
  let text = '';
  let style = '';
  for (let x = 0; x < cols; x++) {
    const c = line.getCell(x, cell);
    if (!c) break;
    // Width 0 is the trailing half of a wide (CJK/emoji) character.
    if (c.getWidth() === 0) continue;
    const chars = c.getChars() || ' ';
    const s = cellStyle(c);
    if (s !== style) {
      if (text) runs.push({ text, style });
      text = '';
      style = s;
    }
    text += chars;
  }
  if (text) runs.push({ text, style });

  // Trailing whitespace is padding, unless it is painted (e.g. a highlighted bar).
  while (runs.length > 0) {
    const last = runs[runs.length - 1];
    const painted = last.style.includes('background:');
    const trimmed = painted ? last.text : last.text.trimEnd();
    if (trimmed) {
      last.text = trimmed;
      break;
    }
    runs.pop();
  }
  return runs;
}

const RULE_RE = /^[╭╰┌└├╠]?[─━═╌┄┈╍┅┉-]{6,}[╮╯┐┘┤╣]?$/;
const BOX_LEFT_RE = /^\s*[│┃║] ?/;
const BOX_RIGHT_RE = /\s*[│┃║]\s*$/;

function textOf(runs: TextRun[]): string {
  let t = '';
  for (const r of runs) t += r.text;
  return t;
}

/** Join physical rows into logical lines and tidy them for reading. */
export function buildLines(rows: TextRun[][], wrapped: boolean[]): OutputLine[] {
  const out: OutputLine[] = [];
  let current: TextRun[] | null = null;
  const flush = () => {
    if (current) out.push(finishLine(current));
    current = null;
  };
  for (let i = 0; i < rows.length; i++) {
    if (wrapped[i] && current) {
      current.push(...rows[i]);
    } else {
      flush();
      current = rows[i].map((r) => ({ ...r }));
    }
  }
  flush();

  // Collapse runs of blank lines (TUI padding) and drop the empty rows below
  // the cursor, which on a desktop-sized screen can be most of the page.
  const tidy: OutputLine[] = [];
  for (const line of out) {
    const blank = !line.rule && line.runs.length === 0;
    const prev = tidy[tidy.length - 1];
    if (blank && (tidy.length === 0 || (prev.runs.length === 0 && !prev.rule))) continue;
    tidy.push(line);
  }
  while (tidy.length > 0 && tidy[tidy.length - 1].runs.length === 0) tidy.pop();
  return tidy;
}

function finishLine(runs: TextRun[]): OutputLine {
  const text = textOf(runs).trim();
  if (RULE_RE.test(text)) return { runs: [], rule: true, sig: '\u0000rule' };
  // Strip the vertical borders of boxed UI (│ text │) so the text can wrap.
  if (/^[│┃║]/.test(text) && /[│┃║]$/.test(text) && runs.length > 0) {
    runs = runs.map((r) => ({ ...r }));
    runs[0].text = runs[0].text.replace(BOX_LEFT_RE, '');
    const last = runs[runs.length - 1];
    last.text = last.text.replace(BOX_RIGHT_RE, '');
    runs = runs.filter((r) => r.text.length > 0);
  }
  let sig = '';
  for (const r of runs) sig += r.style + '\u0001' + r.text + '\u0002';
  return { runs, rule: false, sig };
}

/**
 * Incrementally reads a terminal's active buffer into OutputLines, reusing
 * unchanged line objects so a keyed renderer only touches changed rows.
 */
export class BufferReader {
  private rows: TextRun[][] = [];
  private wrapped: boolean[] = [];
  private dirtyFrom = 0;
  private bufferType: string | null = null;
  private marker: IMarker | undefined;
  private markerIndex = 0;
  private prev: OutputLine[] = [];

  /** Forget everything, e.g. after the terminal was cleared for a replay. */
  reset(): void {
    this.rows = [];
    this.wrapped = [];
    this.dirtyFrom = 0;
    this.bufferType = null;
    this.marker?.dispose();
    this.marker = undefined;
  }

  read(term: Terminal): OutputLine[] {
    const buffer = term.buffer.active;
    if (buffer.type !== this.bufferType) {
      this.reset();
      this.bufferType = buffer.type;
    }

    // When scrollback is full, xterm drops lines from the top and every index
    // shifts. A marker tracks one line through that; the drift is the shift.
    if (this.marker) {
      if (this.marker.isDisposed || this.marker.line < 0) {
        this.reset();
        this.bufferType = buffer.type;
      } else {
        const shift = this.markerIndex - this.marker.line;
        if (shift > 0) {
          this.rows.splice(0, shift);
          this.wrapped.splice(0, shift);
          this.dirtyFrom = Math.max(0, this.dirtyFrom - shift);
        }
      }
    }

    const len = buffer.length;
    // The alternate screen has no history; any row can change.
    const from = buffer.type === 'alternate' ? 0 : Math.min(this.dirtyFrom, len);
    this.rows.length = Math.min(this.rows.length, len);
    this.wrapped.length = Math.min(this.wrapped.length, len);
    const cell = buffer.getNullCell();
    for (let y = from; y < len; y++) {
      const line = buffer.getLine(y);
      this.rows[y] = line ? readRow(line, term.cols, cell) : [];
      this.wrapped[y] = line?.isWrapped ?? false;
    }
    // Next time, re-read from the top of the current live screen; everything
    // above it has scrolled into immutable history.
    this.dirtyFrom = buffer.baseY;

    this.marker?.dispose();
    this.marker = term.registerMarker(0);
    this.markerIndex = this.marker ? this.marker.line : 0;

    const next = buildLines(this.rows, this.wrapped);
    for (let i = 0; i < next.length; i++) {
      const old = this.prev[i];
      if (old && old.sig === next[i].sig) next[i] = old;
    }
    this.prev = next;
    return next;
  }

  dispose(): void {
    this.marker?.dispose();
    this.marker = undefined;
  }
}
