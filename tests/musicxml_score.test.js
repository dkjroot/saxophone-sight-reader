import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileScore} from '../static/score_model.js';
import {authoredPlan} from '../static/score_transport.js';
import {ScorePractice} from '../static/score_practice.js';
import {Performance} from '../static/core.js';
import {filterStudy} from '../static/passage_filters.js';
const load=name=>JSON.parse(readFileSync(new URL('../tests/fixtures/piano-library/'+name,import.meta.url),'utf8'));
const raw=()=>load('burgmuller-op100-1-excerpt.json');

test('verified La Candeur notation agrees with edition MIDI attacks/releases without recovering spelling from it',()=>{
  const score=compileScore(raw()), midi=load('burgmuller-op100-1.json'), ppq=midi.ticks_per_quarter;
  const expected=midi.notes.filter(note=>note.start_tick<16*ppq).map(note=>[note.midi,note.start_tick/ppq,note.end_tick/ppq]);
  const actual=score.sounds.map(note=>[note.midi,note.start[0]/note.start[1],note.end[0]/note.end[1]]);
  const sort=notes=>notes.sort((a,b)=>a[1]-b[1] || a[0]-b[0]);
  assert.deepEqual(sort(actual),sort(expected));
  assert.equal(score.notes.length,44); assert.equal(score.sounds.length,41);
  assert.equal(score.sounds.filter(note=>note.segments.length===2).length,3);
  assert.deepEqual(score.duration,[16,1]);
  assert.equal(authoredPlan(score).notes.length,41);
  const filtered=filterStudy(score,{low:0,high:127,hand:'both',span:'full',material:'sharps',size:3,key:'C'});
  assert.ok(filtered.sounds.length<score.sounds.length);
  for(const sound of filtered.sounds) assert.deepEqual(sound.segments,score.sounds.find(original=>original.id===sound.id).segments);
  assert.equal(filtered.source.provenance.sha256,score.source.provenance.sha256);
});

test('verified notation supports a complete patient run, correction waits, entry into ties and loop release',()=>{
  const score=compileScore(raw()), input=new Performance(), gate=new ScorePractice(score), notes=new Map(score.sounds.map(note=>[note.id,note]));
  let now=0; gate.begin(input,now);
  input.noteOn('test',80); gate.update(input,now); assert.equal(gate.counts.extra,1);
  input.noteOff('test',80); gate.update(input,4); now=4; assert.equal(gate.index,0);
  for(let step=0;step<100 && gate.state!=='ended';step++) {
    const point=gate.points[gate.index], pitches=new Set([...point.attacks,...point.continuing].map(id=>notes.get(id).midi));
    gate.update(input,now);
    for(const pitch of [...input.held]) if(!pitches.has(pitch) || point.attacks.some(id=>notes.get(id).midi===pitch)) input.noteOff('test',pitch);
    for(const id of point.attacks) input.noteOn('test',notes.get(id).midi);
    gate.update(input,now);
    if(gate.state==='holding') {now+=gate.remaining; gate.update(input,now);}
  }
  assert.equal(gate.state,'ended'); assert.equal(gate.counts.earlyRelease,0);
  const start=score.moments.findIndex(moment=>moment.at[0]===12 && moment.at[1]===1);
  const loop=new ScorePractice(score,{start,loop:true}), fresh=new Performance(); loop.begin(fresh,0);
  assert.ok(loop.result.missing.length>=4,'entry into tied bass requires fresh physical attacks');
  for(const id of [...loop.points[start].attacks,...loop.points[start].continuing]) fresh.noteOn('test',notes.get(id).midi);
  loop.update(fresh,0); assert.equal(loop.state,'holding');
  fresh.noteOff('test',48); loop.update(fresh,.05); assert.equal(loop.counts.earlyRelease,1);
  const remaining=loop.remaining; loop.update(fresh,10); assert.equal(loop.remaining,remaining);
});
