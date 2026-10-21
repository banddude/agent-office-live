import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from './bridge.mjs';
test('sanitizes agent identifiers and drops private payloads', () => {
 const event = normalize({agentId:'agent@123',type:'thinking',tool:'gmail',prompt:'confidential',email:'private'});
 assert.deepEqual(event,{agentId:'agent123',type:'thinking',tool:'gmail'});
});
test('rejects missing identifiers',()=>assert.throws(()=>normalize({type:'working'})));
