/**
 * Read-only Oracle observer for the ORIGINAL Pixel Agents renderer.
 * OfficeAdmin is unchanged; all assets and animations come from upstream.
 * Live discovery uses exactly the CAO sessions/terminals API behind the
 * OfficeAdmin agent dropdown and pairs active Codex panes to their JSONL files.
 * Raw JSONL is never redacted: GET /api/transcript/:id returns exact bytes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHttpServer } from '../server/src/httpServer.js';
import { AgentStateStore } from '../server/src/agentStateStore.js';
import {
  loadCharacterSprites,
  loadDefaultLayout,
  loadFloorTiles,
  loadFurnitureAssets,
  loadPetSprites,
  loadWallTiles,
} from '../server/src/assetLoader.js';
import type { AssetCache } from '../server/src/clientMessageHandler.js';
import type { AgentState } from '../server/src/types.js';
import { readRawEvents } from './readRawEvents.js';

type State = 'processing' | 'idle' | 'completed' | 'offline' | 'unknown';
type Node = { id:string; name:string; session:string; window:string|null; provider:string; profile:string; status:State; callerId:string|null; kind:string; lastActive:string|null; terminalId:string|null };
type SessionFile = { path:string; birth:number; modified:number; size:number; model:string; provider:'codex'|'claude' };
type Entry = { node:Node; id:number; file:SessionFile|null; lastOffset:number; lineBuffer:string; activeTool:string|null; activeToolName:string|null; model:string|null; effort:string|null; lastStatus:'active'|'waiting'|null; rawTurn:'active'|'waiting'|null; toolSequence:number };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIST = path.join(ROOT,'dist');
const HOME = os.homedir();
const PORT = Number(process.env.PIXEL_ORACLE_PORT || 3215);
const API = 'http://127.0.0.1:9889';
const store = new AgentStateStore();
const entries = new Map<string, Entry>();
const usedIds = new Set<number>();
let lastSnapshotAt = '';
let lastError = '';
let lastFileCount = 0;
let wsConnections = 0;
function jsonFetch<T>(route:string):Promise<T> {
  return fetch(API+route,{signal:AbortSignal.timeout(1500)}).then(async r=>{if(!r.ok) throw Error(`${route} ${r.status}`);return r.json() as Promise<T>});
}
function tmuxSessions():Set<string>{try{return new Set(execFileSync('tmux',['list-sessions','-F','#{session_name}'],{encoding:'utf8',timeout:1500}).trim().split('\n'))}catch{return new Set()}}
function paneStarts():Map<string,number>{
  const result = new Map<string,number>();
  try {
    const output=execFileSync('tmux',['list-panes','-a','-F','#{session_name}\t#{pane_pid}'],{encoding:'utf8',timeout:1500});
    for(const line of output.trim().split('\n')) {
      const [name,pid]=line.split('\t'); if(!name||!/^\d+$/.test(pid)) continue;
      const ps=spawnSync('ps',['-p',pid,'-o','lstart='],{encoding:'utf8',timeout:1000});
      const d=Date.parse((ps.stdout||'').trim()); if(Number.isFinite(d)) result.set(name,d);
    }
  }catch{}return result;
}
function fileList():SessionFile[]{
  const candidates:SessionFile[]=[];
  const today=new Date();
  for(let delta=0;delta<=2;delta++) {
    const day=new Date(today);day.setDate(day.getDate()-delta);
    const [yr,mo,dt]=[String(day.getFullYear()),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')];
    const dir=path.join(HOME,'.codex/sessions',yr,mo,dt);
    try {
      for(const f of fs.readdirSync(dir)) {
        if(!f.endsWith('.jsonl'))continue;
        const full=path.join(dir,f),stat=fs.statSync(full);
        const match=f.match(/^rollout-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-/);
        // Filename is the machine's local time, just like the tmux pane start.
        const time=match?Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}`):stat.birthtimeMs;
        candidates.push({path:full,birth:Number.isFinite(time)?time:stat.birthtimeMs,modified:stat.mtimeMs,size:stat.size,model:'Codex',provider:'codex'});
      }
    }catch{}
  }
  // Preserve every relevant active provider, not just Codex.
  const claudeRoot=path.join(HOME,'.claude/projects');
  try {for(const dir of fs.readdirSync(claudeRoot)){
    const fullDir=path.join(claudeRoot,dir);
    if(!fs.statSync(fullDir).isDirectory())continue;
    for(const f of fs.readdirSync(fullDir)){
      if(!f.endsWith('.jsonl'))continue;
      const full=path.join(fullDir,f),stat=fs.statSync(full);
      if(Date.now()-stat.mtimeMs>2*86400000) continue;
      candidates.push({path:full,birth:stat.birthtimeMs,modified:stat.mtimeMs,size:stat.size,model:'Claude',provider:'claude'});
    }
  }}catch{}
  return candidates;
}
function matchFile(node:Node,files:SessionFile[],starts:Map<string,number>,used:Set<string>):SessionFile|null{
  // Match by exact provider and pane launch time, not by whichever JSONL changed last.
  const start=starts.get(node.session) ?? (node.id==='aiva'?starts.get('aiva'):node.id==='dev'?starts.get('aiva-dev'):undefined);
  if(start===undefined)return null;
  const ranked=files.filter(f=>f.provider===node.provider&&!used.has(f.path))
    .map(f=>({file:f,diff:Math.abs(f.birth-start)})).sort((a,b)=>a.diff-b.diff);
  if(ranked[0]?.diff!==undefined && ranked[0].diff<180_000){used.add(ranked[0].file.path);return ranked[0].file}
  return null;
}
async function roster():Promise<Node[]>{
  type Terminal = {id:string;name?:string;agent_profile?:string;caller_id?:string;provider?:string;session_name?:string;status?:State;last_active?:string;metadata?:Record<string,unknown>};
  type TmuxSession = {id:string};
  const sessions=await jsonFetch<TmuxSession[]>('/sessions');
  const raw=(await Promise.all(sessions.filter(s=>s.id.startsWith('cao-')&&s.id!=='cao-server')
    .map(async s=>{
      const resp=await jsonFetch<{terminals:Terminal[]}>(`/sessions/${encodeURIComponent(s.id)}`).catch(()=>({terminals:[]}));
      return Promise.all((resp.terminals||[]).map(async t=>({ ...t,...await jsonFetch<Terminal>(`/terminals/${encodeURIComponent(t.id)}`).catch(()=>({})) ,session:s.id,window:t.name??null})));
    }))).flat();
  const tmux=tmuxSessions();
  const nodes:Node[]=[];
  const bySession=new Map<string,typeof raw>();
  for(const t of raw){let list=bySession.get(t.session);if(!list){list=[];bySession.set(t.session,list)}list.push(t)}
  for(const [id,name,session,compat] of [['aiva','AIVA','cao-aiva','aiva'],['dev','Dev','cao-aiva-dev','aiva-dev']] as const){
    const t=(bySession.get(session)||[]).find(x=>!x.caller_id);
    nodes.push({id,name,session,window:t?.window??null,provider:t?.provider||'codex',profile:t?.agent_profile||id,status:t?.status|| (tmux.has(compat)?'unknown':'offline'),callerId:null,kind:'global',lastActive:t?.last_active||null,terminalId:t?.id||null});
  }
  for(const t of raw) {
    if((t.session==='cao-aiva'||t.session==='cao-aiva-dev')&&!t.caller_id)continue;
    nodes.push({id:`cao:${t.id}`,name:String(t.metadata?.display_name||t.metadata?.task_title||(t.agent_profile?.startsWith('aiva-native-') && t.session.startsWith('cao-aiva-agent-') ? t.session.slice('cao-aiva-agent-'.length).split('-').map(w=>w.toLowerCase()==='ci'?'CI':w.charAt(0).toUpperCase()+w.slice(1)).join(' ') : null)||t.agent_profile||t.name||`Agent ${t.id}`),session:t.session,window:t.window??null,provider:t.provider||'codex',profile:t.agent_profile||'',status:t.status||'unknown',callerId:t.caller_id||null,kind:'worker',lastActive:t.last_active||null,terminalId:t.id});
  }
  return nodes;
}
function emptyAgent(id:number,node:Node,file:SessionFile|null):AgentState {
  return {
    id,sessionId:node.terminalId||node.id,terminalRef:undefined,isExternal:true,
    projectDir:file?path.dirname(file.path):HOME,jsonlFile:file?.path||'',fileOffset:0,lineBuffer:'',
    activeToolIds:new Set(),activeToolStatuses:new Map(),activeToolNames:new Map(),
    activeSubagentToolIds:new Map(),activeSubagentToolNames:new Map(),backgroundAgentToolIds:new Set(),
    isWaiting:true,permissionSent:false,hadToolsInTurn:false,lastDataAt:0,linesProcessed:0,
    seenUnknownRecordTypes:new Set(),hookDelivered:false,inputTokens:0,outputTokens:0,
    // Reuse the ORIGINAL Pixel Agents character name labels; no custom scene.
    folderName:node.name,
  };
}
function currentModel(file:SessionFile):{model:string|null;effort:string|null}{
  try{
    const stat=fs.statSync(file.path),fd=fs.openSync(file.path,'r');
    const len=Math.min(stat.size,8*1024*1024),buf=Buffer.alloc(len);
    fs.readSync(fd,buf,0,len,stat.size-len);fs.closeSync(fd);
    for(const line of buf.toString('utf8').split('\n').reverse()){
      try{
        const record=JSON.parse(line);
        if(record.type==='turn_context' && typeof record.payload?.model==='string'){
          return {model:record.payload.model,effort:typeof record.payload.effort==='string'?record.payload.effort:null};
        }
      }catch{}
    }
  }catch{}
  return {model:null,effort:null};
}
function lastTurn(file:SessionFile):'active'|'waiting'|null{
  try{
    const fd=fs.openSync(file.path,'r');const len=Math.min(fs.statSync(file.path).size,1_000_000);const buf=Buffer.alloc(len);
    fs.readSync(fd,buf,0,len,Math.max(0,fs.statSync(file.path).size-len));fs.closeSync(fd);
    const lines=buf.toString().split('\n');
    for(let i=lines.length-1;i>=0;i--){
      try{
        const e=JSON.parse(lines[i]);const type=e?.payload?.type;
        if(e.type==='event_msg'){
          if(type==='task_complete'||type==='turn_aborted')return 'waiting';
          if(type==='task_started')return 'active';
        }
      }catch{}
    }
  }catch{}
  return null;
}
function sendStatus(entry:Entry,status:'active'|'waiting',force=false):void{
  if(!force&&entry.lastStatus===status)return;
  entry.lastStatus=status;store.broadcast({type:'agentStatus',id:entry.id,status});
}
function eventToTool(entry:Entry,record:Record<string,unknown>):void{
  const payload=(record.payload||{}) as Record<string,unknown>;
  if(record.type==='turn_context'){
    if(typeof payload.model==='string')entry.model=payload.model;
    if(typeof payload.effort==='string')entry.effort=payload.effort;
  }
  if(record.type==='response_item'){
    const type=payload.type;
    if(type==='custom_tool_call'||type==='function_call'){
      const toolName=String(payload.name||'Bash');
      const toolId=String(payload.call_id||`call-${entry.toolSequence++}`);
      entry.activeTool=toolId;entry.activeToolName=toolName;
      store.broadcast({type:'agentToolStart',id:entry.id,toolId,status:`Running ${toolName}`,toolName});
      sendStatus(entry,'active');
    }else if(type==='custom_tool_call_output'||type==='function_call_output'){
      const toolId=String(payload.call_id||entry.activeTool||'');
      if(toolId){store.broadcast({type:'agentToolDone',id:entry.id,toolId});if(toolId===entry.activeTool){entry.activeTool=null;entry.activeToolName=null}}
    }
  }else if(record.type==='event_msg'){
    const type=payload.type;
    if(type==='task_started'){
      entry.rawTurn='active';sendStatus(entry,'active');
    }else if(type==='task_complete'||type==='turn_aborted'){
      entry.rawTurn='waiting';entry.activeTool=null;entry.activeToolName=null;store.broadcast({type:'agentToolsClear',id:entry.id});sendStatus(entry,'waiting');
    }
  }
  // Complete, unredacted event is available to the owner in the live WebSocket.
  store.broadcast({type:'rawAgentEvent',id:entry.id,record});
}
function followFile(entry:Entry):void{
  const file=entry.file;if(!file)return;
  try{
    const size=fs.statSync(file.path).size;
    if(size<entry.lastOffset)entry.lastOffset=0;
    if(size===entry.lastOffset)return;
    // Read newly appended lines exactly as written. Never strip prompts,
    // reasoning text, tool inputs, output, secrets, or message payloads.
    const fd=fs.openSync(file.path,'r');const sizeToRead=size-entry.lastOffset;
    const buf=Buffer.alloc(sizeToRead);fs.readSync(fd,buf,0,sizeToRead,entry.lastOffset);fs.closeSync(fd);
    const chunks=(entry.lineBuffer||'').concat(buf.toString('utf8')).split('\n');
    entry.lineBuffer=chunks.pop()||'';entry.lastOffset=size;
    for(const text of chunks){if(!text.trim())continue;try{eventToTool(entry,JSON.parse(text) as Record<string,unknown>)}catch{}}
  }catch(error){console.error('[observer] tail failed',entry.node.id,String(error))}
}
async function refresh():Promise<void>{
  try{
    const [nodes,files,starts]=await Promise.all([roster(),Promise.resolve(fileList()),Promise.resolve(paneStarts())]);
    const used=new Set<string>();lastFileCount=files.length;
    const seen=new Set<string>();
    for(const node of nodes){
      seen.add(node.id);const current=entries.get(node.id);
      const linked=current?.file&&fs.existsSync(current.file.path)?current.file:matchFile(node,files,starts,used);
      if(linked)used.add(linked.path);
      let entry=current;
      if(!entry){
        const id=node.id==='aiva'?1:node.id==='dev'?2:Math.max(3,...usedIds)+1;
        usedIds.add(id);
        entry={id,node,file:linked,lastOffset:linked?fs.statSync(linked.path).size:0,activeTool:null,activeToolName:null,...(linked?currentModel(linked):{model:null,effort:null}),lastStatus:null,rawTurn:linked?lastTurn(linked):null,toolSequence:0,lineBuffer:''} as Entry & {lineBuffer:string};
        entries.set(node.id,entry);
        store.set(id,emptyAgent(id,node,linked));
        console.log('[observer] connected',node.id,linked?path.basename(linked.path):'(no JSONL)');
      }else{
        entry.node=node;
        if(!entry.file && linked){entry.file=linked;entry.lastOffset=fs.statSync(linked.path).size;entry.rawTurn=lastTurn(linked);Object.assign(entry,currentModel(linked))}
      }
      followFile(entry);
      let status:'active'|'waiting'=(node.status==='processing'||entry.rawTurn==='active')?'active':'waiting';
      // A named supervisor is visibly coordinating whenever its real CAO
      // children are processing. This never turns absent evidence into activity.
      if(status==='waiting'&&node.kind==='global'){
        const children=nodes.filter(n=>n.callerId===node.terminalId);
        if(children.some(n=>n.status==='processing'))status='active';
      }
      sendStatus(entry,status);
    }
    for(const [key,entry] of entries){if(!seen.has(key)){
      store.delete(entry.id);entries.delete(key);
    }}
    lastSnapshotAt=new Date().toISOString();lastError='';
  }catch(error){lastError=String(error);console.error('[observer]',lastError)}
}
async function main(){
  console.log('[observer] Loading ORIGINAL Pixel Agents sprite assets; no hooks will be installed.');
  const assetCache:AssetCache={
    characters:await loadCharacterSprites(DIST),
    pets:await loadPetSprites(DIST),
    floorTiles:await loadFloorTiles(DIST).then(x=>x?.sprites??null),
    wallTiles:await loadWallTiles(DIST).then(x=>x?.sets??null),
    furniture:await loadFurnitureAssets(DIST),
    defaultLayout:loadDefaultLayout(DIST),
  };
  console.log('[observer] sprites:',assetCache.characters?.characters.length,'furniture:',assetCache.furniture?.catalog.length,'layout:',!!assetCache.defaultLayout);
  await refresh();
  const {app,port}=await createHttpServer({
    embedded:false,host:'127.0.0.1',port:PORT,token:crypto.randomUUID(),store,readOnly:true,
    staticDir:process.env.PIXEL_ORACLE_STATIC_DIR || path.join(DIST,'webview'),assetCache,
    onWebviewReady(send){
      wsConnections++;
      for(const e of entries.values()){
        // Upstream standalone sends existingAgents AFTER layoutLoaded; its
        // frontend buffers that list waiting for a layout that already arrived.
        // Replay the existing upstream agentCreated event as a backend-only
        // compatibility adapter, so real characters appear at their desks.
        send({type:'agentCreated',id:e.id,folderName:e.node.name,isExternal:true});
        if(e.lastStatus)send({type:'agentStatus',id:e.id,status:e.lastStatus});
        if(e.activeTool)send({type:'agentToolStart',id:e.id,toolId:e.activeTool,status:'Running',toolName:e.activeToolName||'Bash'});
      }
    },
    registerExtraRoutes(app){
      app.get('/api/oracle/agents',async()=>({at:lastSnapshotAt,error:lastError,filesSeen:lastFileCount,agents:[...entries.values()].map(e=>({id:e.id,name:e.node.name,key:e.node.id,status:e.lastStatus,caoStatus:e.node.status,provider:e.node.provider,model:e.model,effort:e.effort,kind:e.node.kind,activity:e.activeToolName ? `Running ${e.activeToolName}` : e.lastStatus==='active' ? 'Working' : e.node.status==='completed' ? 'Completed' : e.node.status==='offline' ? 'Offline' : 'Waiting',jsonl:e.file?path.basename(e.file.path):null,session:e.node.session,hasFullTranscript:!!e.file}))}));
      app.get<{Params:{id:string};Querystring:{before?:string;count?:string}}>('/api/oracle/events/:id',async(req,reply)=>{
        const id=Number(req.params.id);
        const entry=[...entries.values()].find(x=>x.id===id);
        if(!entry?.file){reply.code(404).send({error:'Agent session file unavailable'});return}
        const before=req.query.before===undefined?undefined:Number(req.query.before);
        if(before!==undefined&&(!Number.isSafeInteger(before)||before<0)){
          reply.code(400).send({error:'Invalid byte cursor'});return
        }
        reply.header('cache-control','no-store');
        return {agentId:id,...readRawEvents(entry.file.path,before,Number(req.query.count||8))};
      });
      app.get<{Params:{id:string}}>('/api/transcript/:id',async(req,reply)=>{
        const id=Number(req.params.id);const e=[...entries.values()].find(x=>x.id===id);
        if(!e?.file){reply.code(404).send('No transcript for this agent');return}
        reply.header('Content-Type','application/x-ndjson; charset=utf-8');
        reply.header('Content-Disposition',`inline; filename="agent-${id}.jsonl"`);
        return reply.send(fs.createReadStream(e.file.path));
      });
      app.get('/api/oracle/health',async()=>({status:'ok',readOnly:true,renderer:'upstream Pixel Agents',agents:entries.size,assets:{characters:assetCache.characters?.characters.length||0,furniture:assetCache.furniture?.catalog.length||0},syncAt:lastSnapshotAt,error:lastError,wsConnections}));
    },
  });
  console.log(`[observer] ORIGINAL Pixel Agents renderer: http://127.0.0.1:${port}/`);
  setInterval(()=>{void refresh()},2500).unref();
  process.on('SIGTERM',()=>void app.close());
}
main().catch(e=>{console.error(e);process.exitCode=1});
