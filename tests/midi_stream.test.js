import test from 'node:test';
import assert from 'node:assert/strict';
import {MidiPassageStream} from '../static/midi_stream.js';
import {PlaybackCursor} from '../static/transport.js';

const settings={low:48,high:84,hand:'right',material:'sharps',span:'full',size:1,key:'C'};
const source=pitches=>({notes:pitches.map((midi,i)=>({id:'source-'+i,midi,start_tick:i*480,end_tick:(i+1)*480,track:0,channel:0}))});
const ready=(stream,action)=>new Promise(resolve=>{stream.onReady=resolve; action();});

test('continuous MIDI prepares bounded following passages and ends at the file boundary',async()=>{
  const stream=new MidiPassageStream(), input=source([60,61,62,63,64,65]);
  await ready(stream,()=>stream.prepare(input,settings,{start:1,end:2}));
  let next;
  await ready(stream,()=>{next=stream.take();});
  assert.deepEqual(next.bounds,{start:3,end:4});
  assert.deepEqual(next.targets.map(target=>target[0].midi),[62,63]);
  await ready(stream,()=>{next=stream.take();});
  assert.deepEqual(next.bounds,{start:5,end:6}); assert.equal(stream.ended,true);
  assert.equal(stream.take(),null); stream.reset();
});

test('continuous MIDI skips empty filtered windows, snapshots settings and cancels stale work',async()=>{
  const stream=new MidiPassageStream(), controls={...settings};
  await ready(stream,()=>{stream.prepare(source([60,61,90,91,64,65]),controls,{start:1,end:2}); controls.low=100;});
  const next=stream.take();
  assert.deepEqual(next.bounds,{start:5,end:6}); assert.deepEqual(next.targets.map(target=>target[0].midi),[64,65]);
  let notifications=0; stream.onReady=()=>notifications++;
  stream.prepare(source([60,61,62,63]),settings,{start:1,end:2}); stream.reset();
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(stream.next,null); assert.equal(notifications,0);
});

test('looped playback schedules the next cycle ahead on audio time with unique voice ownership',()=>{
  const plan={duration:1,notes:[{id:'one',start:0,end:.5},{id:'two',start:.5,end:1}]}, cursor=new PlaybackCursor(), emitted=[];
  cursor.play(plan,10,0,{loop:true});
  for(const now of [10,10.5,10.95,11.04]) cursor.pump(now,note=>emitted.push(note));
  assert.deepEqual(emitted.map(note=>+note.time.toFixed(2)),[10.03,10.53,11.03]);
  assert.equal(new Set(emitted.map(note=>note.id)).size,3);
  assert.equal(cursor.state,'playing'); assert.ok(Math.abs(cursor.at(11.53)-.5)<1e-9);
  cursor.pause(11.7); const position=cursor.position;
  cursor.pump(12,()=>assert.fail('paused audio must not schedule'));
  cursor.play(plan,20,position,{loop:true}); cursor.pump(20,note=>emitted.push(note));
  assert.ok(Math.abs(emitted.at(-1).duration-.33)<1e-9);
  cursor.stop(); cursor.pump(100,()=>assert.fail('stopped audio must not restart'));
});

test('looped playback skips expired cycles after a scheduling interruption; play-once still ends',()=>{
  const plan={duration:1,notes:[{id:'one',start:0,end:.5},{id:'two',start:.5,end:1}]}, cursor=new PlaybackCursor(), emitted=[];
  cursor.play(plan,0,0,{loop:true}); cursor.pump(1000,note=>emitted.push(note));
  assert.ok(emitted.length<=2); assert.ok(emitted.every(note=>note.time>=1000));
  cursor.play(plan,0); cursor.pump(2,()=>assert.fail('ended audio must not schedule'));
  assert.equal(cursor.state,'ended'); assert.equal(cursor.position,1);
});
