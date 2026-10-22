/** Read-only smoke test against a running Oracle observer; no agent input. */
import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
const base=process.env.PIXEL_ORACLE_TEST_URL || 'http://127.0.0.1:3215';
test('serves actual upstream Pixel Agents HTML and JS',async()=>{
  const response=await fetch(`${base}/`);assert.equal(response.status,200);
  const html=await response.text();assert.match(html,/assets\/index-[^" ]+\.js/);
  const src=html.match(/src="([^"]+\.js)"/)?.[1];assert.ok(src);
  const asset=await fetch(new URL(src,base));assert.equal(asset.status,200);
  assert.match(asset.headers.get('content-type')||'',/javascript/);
});
test('maps live CAO agents to full, unredacted transcript endpoints',async()=>{
  const response=await fetch(`${base}/api/oracle/agents`);assert.equal(response.status,200);
  const data=await response.json();assert.ok(data.agents.length>=2);
  assert.deepEqual(data.agents.slice(0,2).map(x=>x.name),['AIVA','Dev']);
  for(const agent of data.agents.filter(x=>x.hasFullTranscript)){
    const raw=await fetch(`${base}/api/transcript/${agent.id}`,{method:'HEAD'});
    assert.equal(raw.status,200);
    assert.match(raw.headers.get('content-type')||'',/application\/x-ndjson/);
  }
});
test('original renderer receives original sprite, layout, and agent messages over WebSocket',async()=>{
  await new Promise((resolve,reject)=>{
    const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws');
    const found=new Set();const timer=setTimeout(()=>{ws.close();reject(Error('Timed out waiting for upstream messages: '+[...found].join(',')))},12000);
    ws.on('open',()=>ws.send(JSON.stringify({type:'webviewReady'})));
    ws.on('error',err=>{clearTimeout(timer);reject(err)});
    ws.on('message',packet=>{
      const message=JSON.parse(packet.toString());found.add(message.type);
      if(['characterSpritesLoaded','furnitureAssetsLoaded','layoutLoaded','existingAgents','agentCreated','agentStatus'].every(x=>found.has(x))) {
        clearTimeout(timer);ws.close();resolve();
      }
    });
  });
});
