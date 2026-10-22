import { useEffect, useMemo, useState } from 'react';

export interface LiveOracleAgent {
  id: number;
  key: string;
  name: string;
  status: 'active' | 'waiting' | string;
  caoStatus: string;
  provider: string;
  model?: string | null;
  effort?: string | null;
  kind: string;
  activity?: string;
  hasFullTranscript: boolean;
}

export function useLiveOracleAgents(enabled: boolean): {
  agents: LiveOracleAgent[];
  connected: boolean;
  lastUpdated: number | null;
} {
  const [agents, setAgents] = useState<LiveOracleAgent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const result = await fetch('/api/oracle/agents', { cache: 'no-store' });
        if (!result.ok) throw Error(`Agent feed returned ${result.status}`);
        const data = await result.json() as { agents?: LiveOracleAgent[] };
        if (!Array.isArray(data.agents)) throw Error('Agent feed missing agents');
        if (active) {
          setAgents(data.agents);
          setConnected(true);
          setLastUpdated(Date.now());
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 2500);
    const onFocus = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);
  return { agents, connected, lastUpdated };
}

function activityLabel(agent: LiveOracleAgent): string {
  if (agent.status === 'active') return agent.activity && agent.activity !== 'Working' ? agent.activity : 'Working';
  if (agent.caoStatus === 'completed') return 'Completed';
  if (agent.caoStatus === 'offline') return 'Offline';
  if (agent.caoStatus === 'idle') return 'Ready';
  return 'Waiting';
}

export function MobileOfficeHeader({
  working,
  connected,
  zoom,
  onFit,
  onZoomIn,
  onZoomOut,
  onSettings,
}: {
  working: number;
  connected: boolean;
  zoom: number;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="mobile-office-header" data-testid="mobile-office-header">
      <div className="mobile-office-identity">
        <div className="mobile-office-title">PIXEL AGENTS</div>
        <div className="mobile-office-live" aria-live="polite">
          <span className={`mobile-office-live-dot ${connected ? 'is-connected' : ''}`} />
          {connected ? `${working} working · LIVE` : 'Reconnecting…'}
        </div>
      </div>
      <div className="mobile-office-header-actions">
        <button type="button" className="mobile-office-button fit-button" onClick={onFit} title="Fit entire office" aria-label="Fit entire office">FIT</button>
        <button type="button" className="mobile-office-button" disabled={zoom<=1} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">−</button>
        <span className="mobile-office-zoom" aria-live="off">{zoom}×</span>
        <button type="button" className="mobile-office-button" disabled={zoom>=10} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" className="mobile-office-button settings-button" onClick={onSettings} aria-label="Settings" title="Settings">⚙</button>
      </div>
    </header>
  );
}

export function MobileAgentDock({
  agents,
  connected,
  selectedAgentId,
  onSelect,
  onEvents,
}: {
  agents: LiveOracleAgent[];
  connected: boolean;
  selectedAgentId: number | null;
  onSelect: (id: number) => void;
  onEvents: () => void;
}) {
  const working = agents.filter(a => a.status === 'active').length;
  return (
    <section className="mobile-agent-dock" data-testid="mobile-agent-dock" aria-label="Live agent roster">
      <div className="mobile-agent-dock-toolbar">
        <div className="mobile-agent-dock-title">
          AGENTS <span>{agents.length} online · {working} working</span>
        </div>
        <button type="button" className="mobile-agent-events-button" onClick={onEvents} disabled={!connected || agents.length === 0}>
          RAW ACTIVITY <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="mobile-agent-track" role="list" aria-label="Agent activity">
        {agents.length === 0 && <div className="mobile-agent-empty">{connected ? 'No agents connected' : 'Connecting to Oracle…'}</div>}
        {agents.map(agent => (
          <div role="listitem" key={agent.key}>
            <button
              type="button"
              className={`mobile-agent-card ${selectedAgentId === agent.id ? 'is-selected' : ''}`}
              data-testid="mobile-agent-card"
              onClick={() => onSelect(agent.id)}
              aria-pressed={selectedAgentId === agent.id}
              title={agent.name}
            >
              <span className="mobile-agent-heading">
                <span className={`mobile-agent-dot ${agent.status === 'active' ? 'active' : agent.caoStatus === 'offline' ? 'offline' : 'waiting'}`} />
                <span className="mobile-agent-name">{agent.name}</span>
              </span>
              <span className="mobile-agent-activity">{activityLabel(agent)}</span>
              <span className="mobile-agent-provider">{agent.model || agent.provider || 'Agent'}{agent.effort ? ` · ${agent.effort}` : ''}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

interface RawRecord { start: number; raw: string }
interface RawPage { events: RawRecord[]; hasOlder: boolean; nextBefore: number; fileSize: number }

function summary(raw: string): {title: string; timestamp: string} {
  try {
    const record = JSON.parse(raw) as {type?: string; timestamp?: string; payload?: {type?:string;name?:string}};
    const kind = record.payload?.type ? `${record.type} / ${record.payload.type}` : record.type || 'Record';
    const tool = record.payload?.name ? ` · ${record.payload.name}` : '';
    return {title: `${kind}${tool}`, timestamp: record.timestamp || ''};
  } catch {
    return {title:'Original JSONL record',timestamp:''};
  }
}

/** The full original JSONL payload is visible, never redacted or summarized away. */
export function MobileRawActivity({agent,onClose}:{agent:LiveOracleAgent;onClose:()=>void}) {
  const [events, setEvents] = useState<RawRecord[]>([]);
  const [nextBefore, setNextBefore] = useState(0);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAll, setExpandedAll] = useState(false);
  const eventEndpoint = `/api/oracle/events/${agent.id}`;
  const fullTranscriptUrl = `/api/transcript/${agent.id}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEvents([]);
    setNextBefore(0);
    setHasOlder(false);
    setError(null);
    const getLatest = async () => {
      try {
        const result = await fetch(`${eventEndpoint}?count=8`, {cache:'no-store'});
        if (!result.ok) throw Error(`Could not read transcript (${result.status})`);
        const page = await result.json() as RawPage;
        if (!alive) return;
        setEvents(prev => {
          const existing = new Map(prev.map(e => [e.start,e]));
          for(const item of page.events) existing.set(item.start,item);
          return [...existing.values()].sort((a,b)=>b.start-a.start);
        });
        setNextBefore(prev => prev === 0 ? page.nextBefore : Math.min(prev,page.nextBefore));
        setHasOlder(prev => prev || page.hasOlder);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load activity');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void getLatest();
    const timer = window.setInterval(() => { if (!document.hidden) void getLatest(); }, 3200);
    return () => { alive = false; window.clearInterval(timer); };
  }, [eventEndpoint]);

  const displayedEvents = useMemo(() => events.map(e => ({...e, ...summary(e.raw)})), [events]);
  const loadOlder = async () => {
    if (!hasOlder || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`${eventEndpoint}?before=${nextBefore}&count=8`, {cache:'no-store'});
      if (!response.ok) throw Error(`Could not load older records (${response.status})`);
      const page = await response.json() as RawPage;
      setEvents(prev => {
        const seen = new Map(prev.map(e=>[e.start,e]));
        for(const item of page.events) seen.set(item.start,item);
        return [...seen.values()].sort((a,b)=>b.start-a.start);
      });
      setHasOlder(page.hasOlder);
      setNextBefore(page.nextBefore);
      setError(null);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load older records'); }
    finally {setLoading(false);}
  };

  return (
    <div className="mobile-activity-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-activity-sheet" role="dialog" aria-modal="true" aria-label={`${agent.name} raw activity`} onClick={e=>e.stopPropagation()}>
        <div className="mobile-activity-header">
          <div className="mobile-activity-heading">
            <strong>{agent.name}</strong>
            <span>LIVE JSONL · ALL FIELDS</span>
          </div>
          <button type="button" className="mobile-office-button" onClick={onClose} aria-label="Close activity">×</button>
        </div>
        <div className="mobile-activity-actions">
          <a href={fullTranscriptUrl} target="_blank" rel="noreferrer">Complete transcript ↗</a>
          <button type="button" onClick={()=>setExpandedAll(v=>!v)}>{expandedAll ? 'Collapse records' : 'Expand records'}</button>
        </div>
        <div className="mobile-activity-scroll" data-testid="mobile-raw-events">
          {error && <div className="mobile-activity-error" role="alert">{error}</div>}
          {displayedEvents.length===0 && !error && <div className="mobile-activity-empty">{loading ? 'Reading live session…' : 'No recorded events yet.'}</div>}
          {displayedEvents.map(record => (
            <details key={record.start} className="mobile-activity-record" open={expandedAll || undefined}>
              <summary>
                <span>{record.title}</span>
                <small>{record.timestamp ? record.timestamp.replace('T',' ').slice(0,19) : `byte ${record.start}`}</small>
              </summary>
              <pre>{record.raw}</pre>
            </details>
          ))}
          {hasOlder && <button type="button" className="mobile-load-older" onClick={()=>void loadOlder()} disabled={loading}> {loading ? 'Reading…' : 'Load older events'} </button>}
        </div>
      </section>
    </div>
  );
}
