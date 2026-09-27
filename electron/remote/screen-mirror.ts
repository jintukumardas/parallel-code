import xtermHeadless from '@xterm/headless';
import xtermSerialize from '@xterm/addon-serialize';

const { Terminal } = xtermHeadless;
const { SerializeAddon } = xtermSerialize;

// Lines of history kept per session; matches the desktop and phone terminals
// so the phone can scroll back as far as the desktop can. Cost is roughly
// 12 bytes per cell, allocated only as output fills the history (about 14 MB
// for a full 10k lines at 120 columns).
const MIRROR_SCROLLBACK = 10_000;

/**
 * A headless terminal fed the same PTY output as the desktop, so a phone that
 * opens a task gets the rendered screen and full history instead of a replay
 * of the last few raw bytes. Agent TUIs redraw constantly, so a raw byte
 * buffer only ever holds the last few minutes of a conversation.
 */
export class ScreenMirror {
  private readonly term: InstanceType<typeof Terminal>;
  private readonly serializer: InstanceType<typeof SerializeAddon>;

  constructor(cols: number, rows: number) {
    this.term = new Terminal({
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      scrollback: MIRROR_SCROLLBACK,
      allowProposedApi: true,
    });
    this.serializer = new SerializeAddon();
    // The addon's typings name @xterm/xterm's Terminal; the headless one
    // exposes the same buffer API it reads.
    this.term.loadAddon(this.serializer as unknown as Parameters<typeof this.term.loadAddon>[0]);
  }

  write(data: Uint8Array): void {
    this.term.write(data);
  }

  resize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return;
    if (cols === this.term.cols && rows === this.term.rows) return;
    this.term.resize(cols, rows);
  }

  /**
   * Serialize everything written so far. Parsing is asynchronous, so the
   * result arrives once every earlier write has been applied; output written
   * after this call is not included. That boundary is what lets a subscriber
   * registered in the same tick take over with no gap or overlap.
   */
  snapshot(done: (data: string) => void): void {
    this.term.write('', () => done(this.serializer.serialize()));
  }

  dispose(): void {
    this.term.dispose();
  }
}
