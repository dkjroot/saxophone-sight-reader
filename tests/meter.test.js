import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {meterDefinition,beatGroupAt} from '../static/meter.js';
import {compileScore,compareBeat} from '../static/score_model.js';
import {sourceBeats} from '../static/beats.js';
import {authoredPlan} from '../static/score_transport.js';
import {ScorePractice} from '../static/score_practice.js';
import {midiStudy} from '../static/midi_study.js';
import {Performance} from '../static/core.js';
import {filterStudy} from '../static/passage_filters.js';
const raw=()=>JSON.parse(readFileSync('static/studies/meter-groups.json'));

test('meter distinguishes simple, compound and explicit irregular groups without inventing a 5/8 grouping',()=>{
  assert.deepEqual(meterDefinition([6,8]),{kind:'compound',groups:[3,3],explicit:false});
  assert.equal(meterDefinition([6,4]).kind,'compound');
  assert.deepEqual(meterDefinition([3,4]).groups,[1,1,1]);
  assert.equal(meterDefinition([3,4]).kind,'simple');
  assert.equal(meterDefinition([5,8]).kind,'irregular');
  assert.deepEqual(meterDefinition([5,8]).groups,[1,1,1,1,1]);
  assert.deepEqual(meterDefinition([5,8],[3,2]).groups,[3,2]);
  for(const groups of [[],[2,2],[0,5],[1.5,3.5],['2',3],null]) assert.throws(()=>meterDefinition([5,8],groups),/Beat groups/);
  for(const meter of [[0,4],[33,4],[3,7],null]) assert.throws(()=>meterDefinition(meter),/time signature/);
});

test('pickup and incomplete measures carry distinct exact offsets; grouping changes and inheritance stay explicit',()=>{
  const source=raw(), before=JSON.stringify(source), score=compileScore(source);
  assert.deepEqual(score.measures.map(measure=>measure.beatGroups),[[3,3],[3,3],[2,3],[3,2],[1,1,1],[1,1,1]]);
  assert.deepEqual(score.measures[0].beatOffset,[5,2]); assert.equal(score.measures[0].pickup,true);
  assert.deepEqual(score.measures[4].beatOffset,[0,1]); assert.equal(score.measures[4].pickup,false);
  assert.deepEqual(Array.from({length:6},(_,i)=>beatGroupAt([i,2],score.measures[1])),[0,0,0,1,1,1]);
  assert.deepEqual(Array.from({length:5},(_,i)=>beatGroupAt([i,2],score.measures[2])),[0,0,1,1,1]);
  assert.deepEqual(Array.from({length:5},(_,i)=>beatGroupAt([i,2],score.measures[3])),[0,0,0,1,1]);
  assert.equal(beatGroupAt([0,1],score.measures[0]),1);
  assert.equal(beatGroupAt([9007199254740990,6004799503160660],score.measures[1]),1,'group boundaries use exact rational arithmetic');
  assert.equal(JSON.stringify(source),before); assert.ok(Object.isFrozen(score.measures[1].beatGroups));
  source.measures[3].beatGroups=undefined; assert.deepEqual(compileScore(source).measures[3].beatGroups,[2,3]);
  const fragment=raw(); delete fragment.measures[0].pickup; fragment.measures[0].beatOffset=[0,1];
  assert.equal(compileScore(fragment).measures[0].pickup,false,'an explicit fragment offset is not a printed pickup');
  source.measures[1].pickup=true; assert.throws(()=>compileScore(source),/pickup/);
});

test('compound source clicks/count-in follow dotted beats and keep phase and tempo-map alignment',()=>{
  const source={ticks_per_quarter:480,tempo_map:[{tick:0,seconds:0,microseconds_per_quarter:500000}],events:[{tick:0,message:{type:'time_signature',numerator:6,denominator:8}}]};
  const plan=sourceBeats(source,{sourceStart:0,sourceEnd:1440},1,1);
  assert.equal(plan.leadIn,1.5);
  assert.deepEqual(plan.beats.map(beat=>[beat.start,beat.beat]),[[-1.5,0],[-.75,1],[0,0],[.75,1]]);
  const cut=sourceBeats(source,{sourceStart:240,sourceEnd:1440},1,1);
  assert.deepEqual(cut.beats.filter(beat=>!beat.countIn).map(beat=>[beat.start,beat.beat]),[[.5,1]]);
  assert.deepEqual(cut.beats.filter(beat=>beat.countIn).map(beat=>beat.start),[-1,-.25]);
  source.tempo_map.push({tick:720,seconds:.75,microseconds_per_quarter:1000000});
  const slow=sourceBeats(source,{sourceStart:0,sourceEnd:2880});
  assert.deepEqual(slow.beats.map(beat=>beat.start),[0,.75,2.25,3.75]);
  source.events[0].message.numerator=5;
  assert.equal(sourceBeats(source,{sourceStart:0,sourceEnd:1200}).beats.length,5,'MIDI alone cannot decide 2+3 versus 3+2');
});

test('meter study plays and judges independent voices/rests across pickup and meter changes, including correction waits',()=>{
  const score=compileScore(raw()), input=new Performance(), gate=new ScorePractice(score), plan=authoredPlan(score);
  assert.deepEqual(score.duration,[27,2]); assert.equal(plan.duration,6.75);
  const settings={low:0,high:127,hand:'both',span:'full',material:'sharps',size:10,key:'C'};
  const filtered=filterStudy(score,{...settings,hand:'right'});
  assert.deepEqual(filtered.measures.map(measure=>measure.beatGroups),score.measures.map(measure=>measure.beatGroups));
  let now=0; gate.begin(input,now);
  for(let step=0;step<200 && gate.state!=='ended';step++) {
    const point=gate.points[gate.index], notes=new Map(score.sounds.map(note=>[note.id,note]));
    const expected=new Set([...point.attacks,...point.continuing].map(id=>notes.get(id).midi));
    gate.update(input,now);
    for(const pitch of [...input.held]) if(!expected.has(pitch) || point.attacks.some(id=>notes.get(id).midi===pitch)) input.noteOff('meter',pitch);
    for(const id of point.attacks) input.noteOn('meter',notes.get(id).midi);
    gate.update(input,now);
    if(gate.state==='holding') {now+=gate.remaining; gate.update(input,now);}
    assert.ok(compareBeat(score.moments[gate.index].at,score.duration)<=0);
  }
  assert.equal(gate.state,'ended'); assert.equal(gate.counts.earlyRelease,0); assert.equal(gate.counts.extra,0);
  const faulty=new Performance(), correction=new ScorePractice(score); correction.begin(faulty,0);
  correction.update(faulty,3); assert.equal(correction.index,0,'missing pickup waits');
  faulty.noteOn('wrong',61); correction.update(faulty,3); assert.equal(correction.counts.extra,1);
  faulty.noteOff('wrong',61); faulty.noteOn('correct',60); correction.update(faulty,3);
  correction.update(faulty,3.05); faulty.noteOff('correct',60); correction.update(faulty,3.05);
  assert.equal(correction.counts.earlyRelease,1); const remaining=correction.remaining;
  correction.update(faulty,10); assert.equal(correction.remaining,remaining,'correction freezes remaining pickup time');
  faulty.noteOn('correct',60); correction.update(faulty,10); correction.update(faulty,10+remaining);
  assert.equal(correction.index,1,'the restored hold completes without accumulating lateness');
});

test('MIDI fragments retain actual source beat phase instead of becoming invented printed pickups',()=>{
  const input={sha256:'compound-cut',ticks_per_quarter:480,duration_ticks:1440,tempo_map:[{tick:0,seconds:0,microseconds_per_quarter:500000}],events:[{tick:0,message:{type:'time_signature',numerator:6,denominator:8}}],notes:[0,240,480,720,960,1200].map((tick,i)=>({id:'tone-'+i,midi:60+i,start_tick:tick,end_tick:tick+240,track:0,channel:0}))};
  const settings={low:0,high:127,hand:'both',span:'full',material:'sharps',size:10,key:'C'};
  const first=midiStudy(input,settings,{start:1,end:1});
  assert.equal(first.measures[0].pickup,false); assert.deepEqual(first.measures[0].beatOffset,[0,1]);
  const middle=midiStudy(input,settings,{start:3,end:4});
  assert.equal(middle.measures[0].pickup,false); assert.deepEqual(middle.measures[0].beatOffset,[1,1]);
  assert.equal(beatGroupAt([0,1],middle.measures[0]),0); assert.equal(beatGroupAt([1,2],middle.measures[0]),1);
  const invalid=raw(); invalid.measures[1].beatOffset=[1,1]; assert.throws(()=>compileScore(invalid),/Beat offset/);
});
