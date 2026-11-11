import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileScore,compareBeat,addBeat} from '../static/score_model.js';
import {ScorePractice} from '../static/score_practice.js';
import {Performance} from '../static/core.js';
import {authoredPlan} from '../static/score_transport.js';
const source=()=>JSON.parse(readFileSync(new URL('../static/studies/independent-voices.json',import.meta.url),'utf8'));
const cases=()=>JSON.parse(readFileSync(new URL('../static/studies/notation-cases.json',import.meta.url),'utf8'));
function setup(options={},raw=source()) {
  const score=compileScore(raw), input=new Performance(), gate=new ScorePractice(score,options); let now=0;
  const tick=(delta=0)=>{now+=delta; return gate.update(input,now);};
  const change=fn=>{tick(); fn(); return tick();};
  gate.begin(input,now);
  return {score,input,gate,tick,change,attack:p=>change(()=>input.noteOn('test:0',p)),release:p=>change(()=>input.noteOff('test:0',p))};
}
test('authored practice accepts spread physical attacks immediately then times independent durations',()=>{
  const {gate,attack,release,tick}=setup();
  attack(72); tick(.02); attack(64); tick(.03); attack(48);
  assert.equal(gate.state,'holding'); assert.equal(gate.index,0); const hold=gate.remaining;
  tick(hold); assert.equal(gate.index,1); assert.deepEqual(gate.result.missing,['m1-melody-2-note']);
  assert.deepEqual(gate.result.release,[72]);
  release(72); attack(74); assert.equal(gate.result.ready,true);
  assert.ok(gate.credits.has('m1-inner-1-note')); assert.ok(gate.credits.has('m1-bass-1-note'));
});
test('short holds and extras freeze remaining time and correction reanchors without future lateness',()=>{
  const {gate,attack,release,tick}=setup(); [72,64,48].forEach(attack);
  tick(.2); release(64); const remaining=gate.remaining;
  assert.deepEqual(gate.result.early,['m1-inner-1-note']); tick(10); assert.equal(gate.remaining,remaining);
  attack(64); tick(.01); assert.equal(gate.result.ready,true);
  attack(61); const frozen=gate.remaining; tick(20); assert.equal(gate.remaining,frozen);
  release(61); tick(gate.remaining); assert.equal(gate.index,1);
  assert.equal(gate.counts.earlyRelease,1); assert.equal(gate.counts.extra,1);
});
test('continuing voices can be corrected after an interrupted hold',()=>{
  const {gate,attack,release,tick}=setup(); [72,64,48].forEach(attack); tick(gate.remaining);
  release(72); attack(74); tick(.1); release(48); assert.ok(gate.result.early.includes('m1-bass-1-note'));
  tick(2); attack(48); tick(.01); assert.equal(gate.result.ready,true);
});
test('pedal supports continuity only under the explicit policy and never supplies an attack',()=>{
  for(const policy of ['fingers','pedal']) {
    const {gate,input,attack,release,change,tick}=setup({policy});
    change(()=>input.sustain('test:0',true)); [72,64,48].forEach(attack); release(64);
    assert.equal(gate.result.ready,policy==='pedal'); assert.ok(input.sustained.has(64));
    if(policy==='pedal') {tick(gate.remaining); assert.ok(gate.result.missing.includes('m1-melody-2-note'));}
  }
});
test('duplicate MIDI messages and overlapping sources cannot satisfy repeated authored notes',()=>{
  const {gate,input,attack,release,tick,change}=setup({start:7});
  [76,67,53].forEach(attack); assert.equal(gate.result.ready,true); tick(gate.remaining);
  assert.equal(gate.index,8); assert.ok(gate.result.missing.includes('m2-melody-2-note'));
  attack(76); change(()=>input.noteOn('other:1',76)); release(76);
  assert.ok(gate.result.missing.includes('m2-melody-2-note'));
  change(()=>input.clear('other:1')); attack(76); assert.equal(gate.result.ready,true);
});
test('tie continuation across a barline earns no new attack while a repeat does',()=>{
  const {gate,score,input,tick,change}=setup();
  for(let index=0;index<score.moments.length-1;index++) {
    assert.equal(gate.index,index);
    const point=score.moments[index], notes=new Map(score.sounds.map(note=>[note.id,note]));
    for(const id of point.releases) change(()=>input.noteOff('test:0',notes.get(id).midi));
    for(const id of point.attacks) {const pitch=notes.get(id).midi; change(()=>input.noteOn('test:0',pitch));}
    assert.equal(gate.result.ready,true,'moment '+index);
    if(index===7) assert.equal(gate.credits.get('m1-inner-2-note'),input.attacks.get(67).pressSerial);
    tick(gate.remaining);
  }
  for(const pitch of input.held) change(()=>input.noteOff('test:0',pitch));
  assert.equal(gate.state,'ended'); assert.equal(gate.counts.earlyRelease,0);
});
test('seeking and resume require physical rearticulation, clearing keys and pedal first',()=>{
  const {gate,input,attack,change,tick}=setup({start:7});
  [76,67,53].forEach(attack); tick(.2); gate.pause(); tick(10); assert.equal(gate.state,'paused');
  gate.resume(input,10.2); assert.equal(gate.result.reset,true);
  change(()=>input.clear()); assert.equal(gate.state,'waiting'); assert.equal(gate.credits.size,0);
  [76,67,53].forEach(attack); assert.equal(gate.result.ready,true);
  assert.ok(gate.credits.has('m1-inner-2-note'),'cut tie needs an explicit entry attack');
});
test('loop cuts exclude boundary attacks and require all keys and pedal to reset',()=>{
  const {gate,input,attack,release,change,tick}=setup({end:1,loop:true});
  [72,64,48].forEach(attack); tick(gate.remaining);
  assert.equal(gate.index,1); assert.deepEqual(gate.result.missing,[]); assert.equal(gate.state,'waiting');
  change(()=>input.sustain('test:0',true)); [72,64,48].forEach(release);
  assert.equal(gate.result.reset,true); change(()=>input.sustain('test:0',false));
  assert.equal(gate.cycles,1); tick(); assert.equal(gate.index,0); assert.equal(gate.state,'waiting');
  [72,64,48].forEach(attack); assert.equal(gate.result.ready,true);
});
test('simultaneous unisons keep source IDs but share one observable physical attack',()=>{
  const raw=source(); Object.assign(raw.measures[0].events.find(e=>e.voice==='bass').notes[0],{letter:'E',octave:4});
  const {gate,attack}=setup({},raw); attack(72); attack(64);
  assert.equal(gate.result.ready,true); assert.equal(gate.credits.size,3);
});
test('practice validates boundaries, policy and monotonic clocks',()=>{
  const score=compileScore(source());
  for(const options of [{policy:'silent'},{start:2,end:1},{start:-1},{end:200},{start:.5}]) assert.throws(()=>new ScorePractice(score,options));
  const {gate,input}=setup(); assert.throws(()=>gate.update(input,NaN)); assert.throws(()=>gate.update(input,-1)); gate.stop(); assert.equal(gate.state,'stopped');
});
test('extended original engraving fixture represents nested/mixed tuplets and full-score boundaries exactly',()=>{
  const raw=cases(), before=JSON.stringify(raw), score=compileScore(raw);
  assert.equal(JSON.stringify(raw),before); assert.equal(score.measures.length,10);
  assert.deepEqual(score.measures[0].length,[1,1]); assert.deepEqual(score.measures[8].meter,[3,4]);
  assert.equal(score.measures[6].clefs.upper,'bass'); assert.equal(score.measures[7].clefs.upper,'treble');
  const nested=score.events.filter(event=>event.tuplets.some(rule=>rule.group==='outer-nested'));
  assert.deepEqual(nested.reduce((total,event)=>addBeat(total,event.duration),[0,1]),[2,1]);
  assert.deepEqual(nested[1].duration,[2,9]);
  assert.equal(score.sounds.find(note=>note.segments.length===2).segments.length,2);
  assert.equal(authoredPlan(score).notes.length,score.sounds.length);
  assert.equal(score.pedals[0].value,100); assert.equal(Object.isFrozen(score.pedals[0]),true);
  assert.ok(score.events.some(event=>event.voiceId==='melody' && event.staffId==='lower'));
  assert.equal(score.measures.at(-1).boundary,'final');
});
test('malformed nested tuplets, clefs, boundaries and pedal data are rejected',()=>{
  for(const mutate of [s=>s.measures[1].events[1].tuplets[1].normal=3,s=>s.measures[1].events[0].tuplets[0].unit='bad',s=>s.measures[1].events[0].tuplet={},s=>s.measures[1].clefs={upper:'unknown'},s=>s.measures[0].events[0].notes[0].courtesy='yes',s=>s.measures[0].boundary='unknown',s=>s.pedals[0].value=128,s=>s.pedals.push({...s.pedals[0]})]) {
    const raw=cases(); mutate(raw); assert.throws(()=>compileScore(raw));
  }
});
test('authored hands can exchange independently of voice identity and written staff',()=>{
  const raw=source(), event=raw.measures[0].events[0]; event.staff='lower'; event.hand='left';
  let note=compileScore(raw).notes[0]; assert.equal(note.hand,'left'); assert.equal(note.staffId,'lower'); assert.equal(note.voiceId,'melody');
  event.notes[0].hand='right'; note=compileScore(raw).notes[0]; assert.equal(note.hand,'right');
  event.notes[0].hand='detected'; assert.throws(()=>compileScore(raw));
  delete event.notes[0].hand; event.hand='detected'; assert.throws(()=>compileScore(raw));
});
test('authored damper values affect sounding playback, independently of notated release and live matching',()=>{
  const raw=source(); raw.pedals=[{at:[0,1],value:96},{at:[3,1],value:0},{at:[4,1],controller:66,value:127}];
  const score=compileScore(raw), plan=authoredPlan(score), note=plan.notes.find(note=>note.id==='m1-melody-1-note');
  assert.ok(note.end>note.notatedEnd); assert.equal(note.end,plan.moments.find(point=>point.index===4).time);
  const original=score.sounds.find(note=>note.id==='m1-melody-1-note'); assert.deepEqual(original.end,[1,1]);
  const cut=authoredPlan(score,{start:[2,1],end:[3,1]}); assert.ok(cut.notes.some(note=>note.id===original.id),'pedal resonance is chased at an audio cut');
  assert.equal(score.pedals.at(-1).controller,66);
});
test('rest-only intervals advance on the patient clock without requiring a fictitious note',()=>{
  const raw=source(); for(const measure of raw.measures) for(const event of measure.events) {event.kind='rest'; event.notes=[];} raw.ties=[];
  const {gate,score,tick}=setup({},raw);
  for(let index=0;index<score.moments.length-1;index++) {assert.equal(gate.state,'holding'); tick(gate.remaining);}
  assert.equal(gate.state,'ended'); assert.equal(gate.counts.earlyRelease,0);
});
test('all extended fixture rhythms, different voice releases and shared-pitch repetitions remain playable',()=>{
  const {gate,input,score,tick,change}=setup({},cases()), notes=new Map(score.sounds.map(note=>[note.id,note]));
  for(let index=0;index<score.moments.length-1;index++) {
    assert.equal(gate.index,index);
    const point=score.moments[index], wanted=new Set([...point.attacks,...point.continuing].map(id=>notes.get(id).midi));
    const attacks=new Set(point.attacks.map(id=>notes.get(id).midi));
    for(const pitch of input.held) if(!wanted.has(pitch) || attacks.has(pitch)) change(()=>input.noteOff('test:0',pitch));
    for(const pitch of attacks) change(()=>input.noteOn('test:0',pitch));
    tick(.001); assert.equal(gate.result.ready,true,'extended moment '+index);
    tick(gate.remaining);
  }
  for(const pitch of input.held) change(()=>input.noteOff('test:0',pitch));
  assert.equal(gate.state,'ended');
});
