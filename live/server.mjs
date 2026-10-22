import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const HOME=os.homedir();
const roots=[path.join(HOME,'.codex/sessions'),path.join(HOME,'.claude/projects'),path.join(HOME,'mikeshaffer/sessions/codex')];
const maxFiles=2000;
function scan(dir,depth=0,out=[]){if(depth>6||out.length>=maxFiles)return out;try{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(out.length>=maxFiles)break;const p=path.join(dir,entry.name);if(entry.isDirectory())scan(p,depth+1,out);else if(entry.name.endsWith('.jsonl')){const stat=fs.statSync(p);if(Date.now()-stat.mtimeMs<86400000)out.push({path:p,mtime:stat.mtimeMs,size:stat.size});}}}catch{}return out;}
function roster(){try{return execFileSync('tmux',['list-sessions','-F','#{session_name}'],{encoding:'utf8',timeout:2500}).trim().split('\n').filter(x=>x==='aiva'||x==='aiva-dev'||x.startsWith('cao-aiva-')).slice(0,60)}catch{return ['aiva','aiva-dev']}}
function classify(f){const p=f.path.toLowerCase();return p.includes('claude')?'Claude':'Codex'}
function activity(f){try{const fd=fs.openSync(f.path,'r');const len=Math.min(f.size,12000);const b=Buffer.alloc(len);fs.readSync(fd,b,0,len,Math.max(0,f.size-len));fs.closeSync(fd);const lines=b.toString('utf8').split('\n').slice(-12);for(let i=lines.length-1;i>=0;i--){try{const e=JSON.parse(lines[i]);const t=e.type||'';if(t==='event_msg'||t==='assistant'||t==='assistant_message')return 'working';if(t==='response_item'||t==='tool_result'||t==='user')return 'thinking';}catch{}}}catch{}return 'working'}
function snapshot(){const names=roster();const files=roots.flatMap(r=>scan(r)).sort((a,b)=>b.mtime-a.mtime).slice(0,40);const now=Date.now();const agents=names.map((name,i)=>({id:name,name:name==='aiva'?'AIVA':name==='aiva-dev'?'Dev':name.replace('cao-aiva-',''),kind:'roster',state:'idle',model:'Agent',age:0}));for(const f of files){const age=Math.round((now-f.mtime)/1000);if(age>3600)continue;agents.push({id:'session-'+path.basename(f.path).slice(-25,-6),name:classify(f)+' '+path.basename(f.path).slice(-11,-6),kind:'jsonl',state:age<35?activity(f):'idle',model:classify(f),age});}return {at:new Date().toISOString(),agents,filesObserved:files.length};}
const html=fs.readFileSync(new URL('./index.html',import.meta.url));
http.createServer((req,res)=>{
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  const url = new URL(req.url ?? '/', 'http://localhost');
  const ua = String(req.headers['user-agent'] ?? '').replace(/[\r\n]/g, ' ').slice(0,160);
  console.log(`${new Date().toISOString()} GET ${url.pathname} peer=${req.socket.remoteAddress} ua=${ua}`);
  if(req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405).end();return;}
  if(url.pathname === '/api/state') {
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify(snapshot())); return;
  }
  if(url.pathname === '/api/health') {
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({status:'ok',utc:new Date().toISOString()})); return;
  }
  if(url.pathname === '/probe') {
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Office Connection OK</title></head><body style="background:#163b28;color:white;font:24px -apple-system,system-ui;padding:24px"><h1>Agent Office connection OK</h1><p>This page was served by Oracle through Tailscale.</p><p>${new Date().toISOString()}</p><a style="color:#c7ffe1" href="/">Open animated office</a></body></html>`);return;
  }
  if(url.pathname === '/') {
    res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;
  }
  res.writeHead(404).end('Not found');
}).listen(3212,'127.0.0.1',()=>console.log('Read-only office live on 127.0.0.1:3212'));
