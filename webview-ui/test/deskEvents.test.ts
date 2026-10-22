import { describe, expect, it } from 'vitest';
import { interpretDeskEvents, mergeEventPages, parsedDeskEvents } from '../src/mobile/deskEvents.js';

describe('agent desk event interpretation', () => {
  it('shows the complete recorded tool call with its matching output', () => {
    const arg = '{"input":"hello","more":"a very long argument not to shorten"}';
    const result = 'first output line\nsecond output line';
    const state = interpretDeskEvents([
      {type:'response_item',payload:{type:'custom_tool_call_output',call_id:'a',output:result}},
      {type:'response_item',payload:{type:'custom_tool_call',name:'exec',call_id:'a',input:arg}},
    ]);
    expect(state.tool?.input).toBe(arg);
    expect(state.tool?.output).toBe(result);
    expect(state.tool?.finished).toBe(true);
    expect(state.latest).toBe('screen');
  });

  it('only shows readable thinking when the provider records readable text', () => {
    const encrypted = interpretDeskEvents([{type:'response_item',payload:{
      type:'reasoning',summary:[],encrypted_content:'opaque',
    }}]);
    expect(encrypted.thought?.summary).toBeNull();
    expect(encrypted.thought?.encrypted).toBe(true);
    const readable = interpretDeskEvents([{type:'response_item',payload:{
      type:'reasoning',summary:[{type:'summary_text',text:'Recorded visible summary'}],
    }}]);
    expect(readable.thought?.summary).toBe('Recorded visible summary');
    expect(readable.thought?.encrypted).toBe(false);
  });

  it('preserves complete messages and handles functions tools', () => {
    const text = 'a long prompt with < > & unicode 日本語';
    const state = interpretDeskEvents([
      {type:'response_item',payload:{type:'function_call_output',call_id:'x',output:[{type:'input_text',text:'Done'}]}},
      {type:'response_item',payload:{type:'function_call',name:'send_email',namespace:'gmail',call_id:'x',arguments: '{"body":"full"}'}},
      {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text}]}},
    ]);
    expect(state.tool?.name).toBe('gmail.send_email');
    expect(state.tool?.output).toBe('Done');
    expect(state.message?.text).toBe(text);
  });

  it('merges pages by exact byte cursor and ignores partial records', () => {
    const actual = mergeEventPages([{start:4,raw:'{"a":4}'},{start:1,raw:'{}'}],
      [{start:4,raw:'{"a":4}'},{start:5,raw:'{"a":5}'}]);
    expect(actual.map(x=>x.start)).toEqual([5,4,1]);
    expect(parsedDeskEvents([{start:2,raw:'bad json'},{start:1,raw:'{"type":"event_msg"}'}])).toEqual([{type:'event_msg'}]);
  });
});
