import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileScore} from '../static/score_model.js';
import {authoredPlan,scoreSecondsAt} from '../static/score_transport.js';
import {ScorePractice} from '../static/score_practice.js';
import {Performance} from '../static/core.js';
import {filterStudy} from '../static/passage_filters.js';
const raw=()=>JSON.parse(readFileSync(new URL('../static/studies/tempo-curves.json',import.meta.url),'utf8'));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} ≠ ${expected}`);

test('gradual BPM integrates analytically through acceleration, slowing, steps and cuts',()=>{
  const source=raw(), before=JSON.stringify(source), score=compileScore(source), ramp=4*Math.log(2);
  near(scoreSecondsAt(score,[4,1]),ramp);
  near(scoreSecondsAt(score,[8,1]),2*ramp);
  near(scoreSecondsAt(score,[12,1]),2*ramp+4);
  near(authoredPlan(score).duration,2*ramp+4+8/3);
  const cut=authoredPlan(score,{start:[2,1],end:[6,1],speed:.5});
  near(cut.duration,2*(scoreSecondsAt(score,[6,1])-scoreSecondsAt(score,[2,1])));
  assert.ok(cut.notes.every(note=>note.start>=0 && note.end<=cut.duration));
  const plan=authoredPlan(score);
  for(const moment of plan.moments) near(moment.time,scoreSecondsAt(score,score.moments[moment.index].at));
  assert.equal(JSON.stringify(source),before); assert.ok(Object.isFrozen(score.tempos[0]));
  const flat=raw(); flat.tempos[1].bpm=60;
  near(scoreSecondsAt(compileScore(flat),[4,1]),4,'equal endpoints are stable');
  const tiny=raw(); tiny.tempos[1].bpm=60+1e-10;
  near(scoreSecondsAt(compileScore(tiny),[4,1]),4);
});

test('steady teaching tempo ignores tempo changes for playback and patient clock, retaining source notation',()=>{
  const score=compileScore(raw()), steady=authoredPlan(score,{tempoMode:'steady',speed:2});
  near(steady.duration,8); near(scoreSecondsAt(score,[7,2],{tempoMode:'steady'}),3.5);
  const input=new Performance(), gate=new ScorePractice(score,{tempoMode:'steady'});
  gate.begin(input,0); input.noteOn('test',60); input.noteOn('test',48); gate.update(input,0);
  near(gate.remaining,1); gate.update(input,.4); input.noteOff('test',60); gate.update(input,.4);
  near(gate.remaining,.6); gate.update(input,20); near(gate.remaining,.6);
  input.noteOn('test',60); gate.update(input,20); gate.update(input,20.6);
  assert.equal(gate.index,1,'correction reanchors a steady beat');
  const filtered=filterStudy(score,{low:0,high:127,hand:'right',span:'full',material:'sharps',size:10,key:'C'});
  assert.deepEqual(filtered.tempos,score.tempos); near(authoredPlan(filtered).duration,authoredPlan(score).duration);
  assert.throws(()=>authoredPlan(score,{tempoMode:'unknown'}),/tempo policy/);
  assert.throws(()=>scoreSecondsAt(score,[-1,1]),/outside/);
});

test('patient tempo follows the same ramp as audio and freezes on missing/wrong attacks',()=>{
  const score=compileScore(raw()), input=new Performance(), gate=new ScorePractice(score);
  gate.begin(input,0); gate.update(input,5); assert.equal(gate.index,0);
  input.noteOn('test',61); gate.update(input,5); assert.equal(gate.counts.extra,1);
  input.noteOff('test',61); input.noteOn('test',60); input.noteOn('test',48); gate.update(input,5);
  near(gate.remaining,4*Math.log(1.25));
  gate.update(input,5+gate.remaining); assert.equal(gate.index,1);
  near(gate.plan.duration,authoredPlan(score).duration);
});

test('tempo curves reject unknown policies and ramps without endpoints',()=>{
  for(const [index,curve] of [[0,'exponential'],[3,'linear'],[0,{}]]) {
    const source=raw(); source.tempos[index].curve=curve; assert.throws(()=>compileScore(source),/Tempo curve/);
  }
  const source=raw(); source.tempos[3].curve='step'; assert.doesNotThrow(()=>compileScore(source));
});
