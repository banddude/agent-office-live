/**
 * Interpret the read-only JSONL already exposed by the Oracle adapter.
 * Monitor and bubbles are event visualizations, not literal screen recordings.
 */
export interface RawDeskRecord {
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}
export interface DeskTool {
  name: string;
  callId: string;
  input: string;
  output: string | null;
  timestamp: string | null;
  finished: boolean;
}
export interface DeskThought {
  summary: string | null;
  encrypted: boolean;
  timestamp: string | null;
}
export interface DeskMessage {
  role: string;
  text: string;
  timestamp: string | null;
}
export interface DeskState {
  tool: DeskTool | null;
  thought: DeskThought | null;
  message: DeskMessage | null;
  latest: 'screen' | 'thought' | 'message' | null;
}

function readable(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const chunks = value.map((item) => {
      if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
        return item.text;
      }
      return JSON.stringify(item, null, 2);
    });
    return chunks.join('\n');
  }
  return JSON.stringify(value, null, 2);
}

export function interpretDeskEvents(records: RawDeskRecord[]): DeskState {
  const state: DeskState = { tool: null, thought: null, message: null, latest: null };
  const outputs = new Map<string, string>();
  for (const record of records) {
    const payload = record.payload ?? {};
    if (record.type === 'response_item') {
      if ((payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') &&
          typeof payload.call_id === 'string' && !outputs.has(payload.call_id)) {
        outputs.set(payload.call_id, readable(payload.output));
      }
      if ((payload.type === 'custom_tool_call' || payload.type === 'function_call') &&
          typeof payload.call_id === 'string' && !state.tool) {
        state.tool = {
          callId: payload.call_id,
          name: [payload.namespace, payload.name].filter(Boolean).join('.') || 'Tool',
          input: readable(payload.arguments ?? payload.input),
          output: outputs.get(payload.call_id) ?? null,
          timestamp: record.timestamp ?? null,
          finished: outputs.has(payload.call_id),
        };
        if (!state.latest) state.latest = 'screen';
      }
      if (payload.type === 'reasoning' && !state.thought) {
        const recordedSummary = readable(payload.summary);
        const summary = recordedSummary.trim() ? recordedSummary : null;
        state.thought = {
          summary,
          encrypted: !summary && !!payload.encrypted_content,
          timestamp: record.timestamp ?? null,
        };
        if (!state.latest) state.latest = 'thought';
      }
      if (payload.type === 'message' && !state.message) {
        const text = readable(payload.content);
        if (text) {
          state.message = {
            text,
            role: typeof payload.role === 'string' ? payload.role : 'agent',
            timestamp: record.timestamp ?? null,
          };
          if (!state.latest) state.latest = 'message';
        }
      }
    }
    if (record.type === 'event_msg' && payload.type === 'task_complete' && !state.message &&
        typeof payload.last_agent_message === 'string' && payload.last_agent_message) {
      state.message = {
        text: payload.last_agent_message,
        role: 'assistant',
        timestamp: record.timestamp ?? null,
      };
      if (!state.latest) state.latest = 'message';
    }
  }
  return state;
}

/** Newest-first, de-duplicated by byte offset; never alters raw payload text. */
export interface ByteRecord { start: number; raw: string }
export function mergeEventPages(existing: ByteRecord[], latest: ByteRecord[], maxItems = 200): ByteRecord[] {
  const unique = new Map<number, ByteRecord>();
  for (const record of existing) unique.set(record.start, record);
  for (const record of latest) unique.set(record.start, record);
  return Array.from(unique.values()).sort((a, b) => b.start - a.start).slice(0, maxItems);
}

export function parsedDeskEvents(events: ByteRecord[]): RawDeskRecord[] {
  const result: RawDeskRecord[] = [];
  for (const event of events) {
    try { result.push(JSON.parse(event.raw) as RawDeskRecord); } catch { /* unfinished JSONL */ }
  }
  return result;
}
