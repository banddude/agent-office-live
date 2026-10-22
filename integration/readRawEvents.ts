/** Read complete original JSONL records backward, without altering or redacting fields. */
import fs from 'node:fs';

export interface RawEventPage {
  events: Array<{ start: number; raw: string }>;
  nextBefore: number;
  hasOlder: boolean;
  fileSize: number;
}

/** Cursor always denotes a record boundary; returned events are newest-first. */
export function readRawEvents(filePath: string, before?: number, requestedCount = 8): RawEventPage {
  const fileSize = fs.statSync(filePath).size;
  const count = Math.max(1, Math.min(20, Math.floor(requestedCount) || 8));
  const fd = fs.openSync(filePath, 'r');
  try {
    let end = before === undefined ? fileSize : Math.min(fileSize, Math.max(0, Math.floor(before)));
    if (!end) return { events: [], nextBefore: 0, hasOlder: false, fileSize };
    // A writer might currently be halfway through an event; ignore incomplete
    // trailing records until their newline arrives, never invent a partial event.
    if (before === undefined) {
      const last = Buffer.alloc(1);
      fs.readSync(fd, last, 0, 1, end - 1);
      if (last[0] !== 10) {
        const scan = Buffer.alloc(64 * 1024);
        while (end > 0) {
          const start = Math.max(0, end - scan.length);
          const length = end - start;
          fs.readSync(fd, scan, 0, length, start);
          let found = -1;
          for (let i = length - 1; i >= 0; i--) if (scan[i] === 10) { found = start + i + 1; break; }
          if (found >= 0) { end = found; break; }
          end = start;
        }
      }
    }
    if (!end) return { events: [], nextBefore: 0, hasOlder: false, fileSize };

    const boundaries = [end];
    let pos = end;
    const scan = Buffer.alloc(64 * 1024);
    while (pos > 0 && boundaries.length <= count) {
      const start = Math.max(0, pos - scan.length);
      const length = pos - start;
      fs.readSync(fd, scan, 0, length, start);
      for (let i = length - 1; i >= 0 && boundaries.length <= count; i--) {
        const next = start + i + 1;
        if (scan[i] === 10 && next < boundaries[boundaries.length - 1]) boundaries.push(next);
      }
      pos = start;
    }
    if (pos === 0 && boundaries[boundaries.length - 1] !== 0) boundaries.push(0);
    const events: RawEventPage['events'] = [];
    for (let i = 0; i < boundaries.length - 1 && events.length < count; i++) {
      const lineStart = boundaries[i + 1];
      const lineEnd = boundaries[i];
      const length = lineEnd - lineStart;
      if (length <= 0) continue;
      const bytes = Buffer.alloc(length);
      fs.readSync(fd, bytes, 0, length, lineStart);
      const raw = bytes.toString('utf8').replace(/\n$/, '').replace(/\r$/, '');
      if (raw) events.push({ start: lineStart, raw });
    }
    const nextBefore = events.length ? events[events.length - 1].start : 0;
    return { events, nextBefore, hasOlder: nextBefore > 0, fileSize };
  } finally {
    fs.closeSync(fd);
  }
}
