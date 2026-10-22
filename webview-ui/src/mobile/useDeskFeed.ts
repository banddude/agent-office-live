import { useEffect, useMemo, useRef, useState } from 'react';

import type { ByteRecord,DeskState } from './deskEvents.js';
import { interpretDeskEvents, mergeEventPages, parsedDeskEvents } from './deskEvents.js';

interface EventPage {
  events: ByteRecord[];
  nextBefore: number;
  hasOlder: boolean;
}

export interface LiveDeskFeed {
  state: DeskState;
  loading: boolean;
  connected: boolean;
  error: string | null;
  lastUpdated: number | null;
  recordsObserved: number;
}

const EMPTY: DeskState = { tool: null, thought: null, message: null, latest: null };

/** Event paging stays within the selected agent; never shares another agent's data. */
export function useDeskFeed(agentId: number, enabled = true): LiveDeskFeed {
  const [state, setState] = useState<DeskState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [recordsObserved, setRecordsObserved] = useState(0);
  const records = useRef<ByteRecord[]>([]);

  useEffect(() => {
    records.current = [];
    setState(EMPTY);
    setLoading(true);
    setConnected(false);
    setLastUpdated(null);
    setRecordsObserved(0);
    setError(null);
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const merged = records.current;
        let next: ByteRecord[] = merged;
        let before: number | undefined;
        for (let pageNo = 0; pageNo < 10; pageNo++) {
          const url = new URL(`/api/oracle/events/${agentId}`, window.location.origin);
          url.searchParams.set('count', '20');
          if (before !== undefined) url.searchParams.set('before', String(before));
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) throw new Error(`Session feed HTTP ${response.status}`);
          const page = await response.json() as EventPage;
          next = mergeEventPages(next, page.events);
          const parsed = interpretDeskEvents(parsedDeskEvents(next));
          if ((parsed.tool && parsed.thought && parsed.message) ||
              !page.hasOlder || page.nextBefore === before) break;
          before = page.nextBefore;
        }
        if (!alive) return;
        records.current = next;
        setState(interpretDeskEvents(parsedDeskEvents(next)));
        setRecordsObserved(next.length);
        setConnected(true);
        setLastUpdated(Date.now());
        setError(null);
      } catch (e) {
        if (alive) {
          setConnected(false);
          setError(e instanceof Error ? e.message : 'Session feed unavailable');
        }
      } finally {
        if (alive) setLoading(false);
        inFlight = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 3200);
    const wake = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [agentId, enabled]);

  return useMemo(() => ({state,loading,connected,error,lastUpdated,recordsObserved}),
    [state,loading,connected,error,lastUpdated,recordsObserved]);
}
