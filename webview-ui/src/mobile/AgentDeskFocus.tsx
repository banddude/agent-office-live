import { useEffect, useState } from 'react';

import type { LiveOracleAgent } from './MobileOfficeUI.js';
import { useDeskFeed } from './useDeskFeed.js';

type DeskTab = 'screen' | 'thought' | 'message';

function applicationForTool(name: string): { title:string; glyph:string } {
  const lower = name.toLowerCase();
  if (lower.includes('gmail') || lower.includes('email') || lower.includes('mail')) {
    return {title:'MAIL',glyph:'✉'};
  }
  if (lower.includes('github') || lower.includes('git_') || lower.includes('git.')) {
    return {title:'GITHUB',glyph:'⌘'};
  }
  if (lower.includes('notes') || lower.includes('note.')) {
    return {title:'NOTES',glyph:'▤'};
  }
  if (lower.includes('read') || lower.includes('search') || lower.includes('grep')) {
    return {title:'FILES',glyph:'▦'};
  }
  if (lower.includes('browser') || lower.includes('web')) {
    return {title:'BROWSER',glyph:'◎'};
  }
  return {title:'TERMINAL',glyph:'>_'};
}

function labelTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const time = new Date(timestamp);
  if (!Number.isFinite(time.valueOf())) return timestamp;
  return time.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'});
}

/**
 * A perspective-style close-up using the actual upstream Pixel Agents sprite
 * atlas. The monitor faithfully represents JSONL records; it is not a remote
 * desktop or screenshot of an app.
 */
export function AgentDeskFocus({
  agent,
  palette = 0,
  hueShift = 0,
  onClose,
  onRaw,
  mobile = true,
}: {
  agent: LiveOracleAgent;
  palette?:number;
  hueShift?:number;
  onClose:()=>void;
  onRaw:()=>void;
  mobile?:boolean;
}) {
  const feed = useDeskFeed(agent.id, agent.hasFullTranscript);
  const { tool, thought, message } = feed.state;
  const [tab, setTab] = useState<DeskTab>('screen');
  const app = applicationForTool(tool?.name ?? '');
  const working = agent.status === 'active';

  useEffect(() => {
    setTab('screen');
  }, [agent.id]);

  useEffect(() => {
    const keyHandler = (e:KeyboardEvent) => {
      if(e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  const colorPalette = Math.min(5,Math.max(0,Math.floor(palette)||0));
  const bubbleTitle = thought?.summary
    ? 'Recorded reasoning summary'
    : thought?.encrypted
      ? 'Reasoning block recorded'
      : working ? 'Working' : 'At desk';
  const bubbleSubtitle = thought?.summary
    ? thought.summary
    : thought?.encrypted
      ? 'Text encrypted by provider'
      : working ? 'Waiting for next event' : 'No current reasoning text';
  const thoughtTime = labelTime(thought?.timestamp ?? null);

  return (
    <section
      className={`desk-focus-panel ${mobile ? 'is-mobile' : 'is-desktop'}`}
      role="region"
      aria-label={`${agent.name} desk view`}
      data-testid="agent-desk-focus"
    >
      <div className="desk-focus-titlebar">
        <button type="button" className="desk-focus-back" onClick={onClose}
          aria-label="Return to office">← OFFICE</button>
        <div className="desk-focus-title">
          <strong title={agent.name}>{agent.name}</strong>
          <span>{agent.model || agent.provider}{agent.effort ? ` · ${agent.effort}` : ''}</span>
        </div>
        <span className={`desk-focus-state ${working ? 'is-busy' : ''}`}>
          <span className="desk-focus-state-dot" />
          {working ? 'WORKING' : agent.caoStatus === 'completed' ? 'DONE' : agent.caoStatus === 'offline' ? 'OFFLINE' : 'WAITING'}
        </span>
      </div>

      <div className="desk-focus-scene">
        <div className="desk-focus-wall" aria-hidden="true" />
        <div className="desk-focus-shelf" aria-hidden="true">
          <span>▥</span><span>▤</span><span>▥</span>
        </div>
        <div className={`desk-focus-thought ${working ? 'is-thinking' : ''}`}
          role="status" data-testid="desk-thought-bubble">
          <div className="desk-focus-thought-title">
            <span aria-hidden="true">◌</span> {bubbleTitle}
            {thoughtTime && <small> · {thoughtTime}</small>}
          </div>
          <p>{bubbleSubtitle}</p>
        </div>

        <div className="desk-focus-monitor" data-testid="desk-monitor">
          <div className="desk-focus-monitor-bar">
            <span className="desk-focus-monitor-brand">
              <span aria-hidden="true">{app.glyph}</span> {tool ? app.title : 'SESSION'}
            </span>
            <span className={`desk-focus-led ${working && feed.connected ? 'on' : ''}`} aria-label={feed.connected ? 'Live' : 'Offline'} />
          </div>
          <nav className="desk-focus-tabs" aria-label="Monitor content">
            <button type="button" data-testid="desk-screen-tab" aria-pressed={tab === 'screen'}
              className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>SCREEN</button>
            <button type="button" data-testid="desk-thinking-tab" aria-pressed={tab === 'thought'}
              className={tab === 'thought' ? 'active' : ''} onClick={() => setTab('thought')}>THINKING</button>
            <button type="button" data-testid="desk-message-tab" aria-pressed={tab === 'message'}
              className={tab === 'message' ? 'active' : ''} onClick={() => setTab('message')}>MESSAGES</button>
          </nav>
          <div className="desk-focus-screen" data-testid="desk-monitor-content">
            {feed.error && <p className="desk-focus-error" role="alert">{feed.error}</p>}
            {feed.loading && !tool && !message && <p className="desk-focus-muted">Connecting to recorded session…</p>}
            {!agent.hasFullTranscript && <p className="desk-focus-muted">This agent has no linked session file yet. Its live status is still shown.</p>}

            {tab === 'screen' && agent.hasFullTranscript && (
              tool
                ? <div className="desk-focus-code-view">
                    <div className="desk-focus-source">
                      <strong>{tool.name}</strong>
                      <span>{tool.finished ? 'FINISHED' : 'RUNNING'}{labelTime(tool.timestamp) ? ` · ${labelTime(tool.timestamp)}` : ''}</span>
                    </div>
                    <div className="desk-focus-code-label">RECORDED TOOL INPUT</div>
                    <pre className="desk-focus-code">{tool.input}</pre>
                    {tool.output !== null && <>
                      <div className="desk-focus-code-label">RECORDED TOOL OUTPUT</div>
                      <pre className="desk-focus-code result">{tool.output}</pre>
                    </>}
                    {working && <span className="desk-focus-cursor" aria-hidden="true">▌</span>}
                  </div>
                : message
                  ? <>
                      <div className="desk-focus-code-label">RECORDED {message.role.toUpperCase()} MESSAGE</div>
                      <pre className="desk-focus-code">{message.text}</pre>
                    </>
                  : <div className="desk-focus-muted">No recorded tool call or readable message in the latest session events.</div>
            )}
            {tab === 'thought' && agent.hasFullTranscript && (
              thought
                ? <>
                    <div className="desk-focus-code-label">LATEST RECORDED REASONING BLOCK</div>
                    {thought.summary
                      ? <pre className="desk-focus-code">{thought.summary}</pre>
                      : <p className="desk-focus-muted">
                          A reasoning block is present in the JSONL, but the provider stored its text in encrypted form.
                          There is no readable text to display. The original record remains available under Raw Activity.
                        </p>}
                    {labelTime(thought.timestamp) && <small className="desk-focus-time">{labelTime(thought.timestamp)}</small>}
                  </>
                : <p className="desk-focus-muted">No reasoning block in the latest recorded session events.</p>
            )}
            {tab === 'message' && agent.hasFullTranscript && (
              message
                ? <>
                    <div className="desk-focus-code-label">LATEST {message.role.toUpperCase()} MESSAGE</div>
                    <pre className="desk-focus-code">{message.text}</pre>
                    {labelTime(message.timestamp) && <small className="desk-focus-time">{labelTime(message.timestamp)}</small>}
                  </>
                : <p className="desk-focus-muted">No readable message in the latest recorded session events.</p>
            )}
          </div>
        </div>

        <div className="desk-focus-tabletop" aria-hidden="true">
          <div className="desk-focus-keyboard" />
          <div className="desk-focus-mouse" />
        </div>
        <div
          className={`desk-focus-avatar ${working ? 'is-typing' : ''}`}
          style={{
            backgroundImage: `url(/assets/characters/char_${colorPalette}.png)`,
            filter: `hue-rotate(${hueShift}deg)`,
          }}
          aria-hidden="true"
          data-testid="desk-back-sprite"
        />
        <div className="desk-focus-scene-footer">
          <span>{feed.connected ? 'LIVE SESSION FEED' : 'RECONNECTING'}</span>
          <button type="button" onClick={onRaw}>ALL RAW EVENTS ↗</button>
        </div>
      </div>
      <div className="desk-focus-disclaimer">
        Visualized from recorded agent events, not a literal remote desktop.
        <span>{feed.recordsObserved > 0 ? ` ${feed.recordsObserved} recent records inspected.` : ''}</span>
      </div>
    </section>
  );
}
