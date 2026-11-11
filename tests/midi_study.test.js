import test from 'node:test';
import assert from 'node:assert/strict';
import {midiStudy} from '../static/midi_study.js';
import {compareBeat} from '../static/score_model.js';
import {authoredPlan} from '../static/score_transport.js';
const settings={low:0,high:127,hand:'both',span:'full',material:'sharps',size:10,key:'C'};
const note=(id,midi,start,end,track=0)=>({id,midi,start_tick:start,end_tick:end,track,channel:0,velocity:90});
const source=()=>({sha256:'local-source-hash',ticks_per_quarter:480,duration_ticks:3840,tempo_map:[{tick:0,microseconds_per_quarter:500000},{tick:480,microseconds_per_quarter:600000}],events:[{tick:0,message:{type:'time_signature',numerator:4,denominator:4}},{tick:1920,message:{type:'key_signature',key:'G'}}],notes:[note('held',48,0,2400),note('first',64,480,720),note('repeat',64,720,960)]});
test('loaded MIDI studies preserve each source attack, source releases and original inspection independently of derived notation',()=>{
  const input=source(), before=JSON.stringify(input), score=midiStudy(input,settings,{},'Loaded piece');
  assert.equal(JSON.stringify(input),before); assert.equal(score.sounds.length,3); assert.equal(score.source.title,'Loaded piece');
  const held=score.sounds.find(sound=>sound.sourceIds[0]==='held'); assert.equal(held.segments.length,2); assert.deepEqual(held.end,[5,1]);
  const attacks=score.sounds.filter(sound=>sound.midi===64); assert.equal(attacks.length,2); assert.ok(compareBeat(attacks[0].start,attacks[1].start)<0);
  assert.equal(score.measures.length,2); assert.equal(score.measures[1].key,'G');
  assert.equal(score.source.provenance.sha256,input.sha256); assert.deepEqual(score.source.provenance.grid,[1,8]);
  assert.equal(held.sourceEnd,2400); assert.equal(Object.isFrozen(score),true); assert.equal(score.tempos[1].bpm,100);
});
test('MIDI passage cuts retain source time alignment, rests and selected attacks without inventing incoming holds',()=>{
  const score=midiStudy(source(),settings,{start:2,end:2});
  assert.equal(score.sounds.length,1); assert.equal(score.sounds[0].sourceIds[0],'first');
  assert.deepEqual(score.duration,[1,2]); assert.equal(score.source.provenance.sourceOriginTick,480); assert.equal(score.source.provenance.sourceEndTick,720);
  const gap=source(); gap.notes[1].end_tick=600;
  const middle=midiStudy(gap,settings,{start:2,end:3}); assert.ok(middle.events.some(event=>event.kind==='rest'));
});
test('MIDI study quantization remains explicit and distinct same-pitch repetitions are never silently merged',()=>{
  const input=source(); input.notes=[note('one',60,0,5),note('two',60,1,10)];
  assert.throws(()=>midiStudy(input,settings),/Separate repeated attacks/);
  input.notes=[note('short',60,0,5)]; const score=midiStudy(input,settings);
  assert.deepEqual(score.sounds[0].duration,[1,8]); assert.equal(score.sounds[0].sourceEnd,5);
});
test('track eligibility, density and explicit staff choices also govern the derived study',()=>{
  const input=source(); input.notes.push(note('other-track',72,0,480,1));
  const score=midiStudy(input,settings,{tracks:[{track:0,enabled:true,staff:'treble'},{track:1,enabled:false,staff:'bass'}]});
  assert.ok(score.notes.every(note=>note.staffId==='upper')); assert.equal(score.sounds.length,3);
  assert.ok(score.notes.every(note=>note.hand===undefined),'derived staves and lanes do not claim recovered hands');
  assert.throws(()=>midiStudy(input,{...settings,low:100}),/No retained/);
});
test('unsupported missing releases, excessive polyphony and oversized studies fail without changing source data',()=>{
  let input=source(); input.notes[0].end_tick=null; assert.throws(()=>midiStudy(input,settings),/source release/);
  input=source(); input.notes=Array.from({length:17},(_,i)=>note('unison-'+i,60,0,480,i)); assert.throws(()=>midiStudy(input,settings),/16 notated voices/);
  input.notes=Array.from({length:1025},(_,i)=>note('many-'+i,60,0,480,i)); assert.throws(()=>midiStudy(input,settings),/1,024/);
});
test('MIDI study playback separates channel pedal resonance from finger duration and unpedalled channels',()=>{
  const input=source(); input.notes=[note('pedalled',60,0,480),{...note('dry',64,0,480),channel:1}];
  input.events.push({tick:0,message:{type:'control_change',channel:0,control:64,value:100}},{tick:960,message:{type:'control_change',channel:0,control:64,value:0}});
  input.events.sort((a,b)=>a.tick-b.tick);
  const score=midiStudy(input,settings), plan=authoredPlan(score);
  assert.deepEqual(score.sounds[0].end,[1,1]);
  const wet=plan.notes.find(note=>note.sourceIds.some(id=>score.notes.find(note=>note.id===id)?.sourceIds[0]==='pedalled'));
  const dry=plan.notes.find(note=>note.sourceIds.some(id=>score.notes.find(note=>note.id===id)?.sourceIds[0]==='dry'));
  assert.ok(wet.end>wet.notatedEnd); assert.equal(dry.end,dry.notatedEnd);
});
test('conflicting MIDI signatures preserve the chosen study signature rather than taking an arbitrary track',()=>{
  const input=source(); input.events=[{tick:0,message:{type:'key_signature',key:'G'}},{tick:0,message:{type:'key_signature',key:'F'}}];
  const score=midiStudy(input,{...settings,key:'D'}); assert.equal(score.measures[0].key,'D');
});
test('source reset before an attack does not mute it, while later panic stops sound independently of a cross-bar physical hold',()=>{
  const input=source(); input.notes=[note('t0:n2',48,0,2400)];
  input.events=[{tick:0,track:0,index:0,message:{type:'control_change',channel:0,control:120,value:0}},{tick:1440,track:0,index:4,message:{type:'control_change',channel:0,control:120,value:0}}];
  const score=midiStudy(input,settings), plan=authoredPlan(score);
  assert.deepEqual(score.sounds[0].end,[5,1]); assert.equal(score.sounds[0].segments.length,2);
  assert.ok(plan.notes[0].end>1); assert.ok(plan.notes[0].end<plan.notes[0].notatedEnd);
});
