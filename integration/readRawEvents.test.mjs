import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRawEvents } from './readRawEvents.ts';

test('returns full unredacted records, pages backward without duplication', () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-events-test-'));
  try {
    const file = join(dir, 'session.jsonl');
    const records = [
      {type:'user',prompt:'Confidential literal prompt value',unicode:'日本語'},
      {type:'tool',input:{command:'hello | world'},output:'Complete exact output'},
      {type:'response',reasoning:'A full recorded thought', secret:'some-value'},
      {type:'still-writing',value:'incomplete'},
    ];
    writeFileSync(file,records.slice(0,3).map(x=>JSON.stringify(x)+'\n').join('')+JSON.stringify(records[3]).slice(0,18));
    const first=readRawEvents(file,undefined,2);
    assert.deepEqual(first.events.map(x=>JSON.parse(x.raw)),records.slice(1,3).reverse());
    const older=readRawEvents(file,first.nextBefore,2);
    assert.deepEqual(older.events.map(x=>JSON.parse(x.raw)),records.slice(0,1));
    assert.equal(older.hasOlder,false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
