import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reduceAttack,filterStudy} from '../static/passage_filters.js';
import {compileScore,compareBeat} from '../static/score_model.js';
import {spell,staffStep} from '../static/core.js';
import {makeOutline} from '../static/outline.js';
import {midiStudy} from '../static/midi_study.js';
import {suggestPassages} from '../static/sections.js';

const settings={low:0,high:127,hand:'both',material:'sharps',span:'full',size:10,key:'C'};
const written=pitches=>pitches.map(midi=>({...spell(midi),staff:midi<60?'bass':'treble'}));
const fixture=()=>compileScore(JSON.parse(readFileSync('static/studies/independent-voices.json')));

test('passage reduction enforces per-hand density, span, leaps and ledger limits without adding pitches',()=>{
  const notes=written([36,48,52,55,60,64,67,72,84]);
  for(const rules of [{'left-density':1,'right-density':2},{'hand-span':7},{'ledger-limit':0},{'left-leap':2,'right-leap':2}]) {
    const previous={left:[48],right:[64]}, filtered=reduceAttack(notes,{...settings,...rules},previous);
    assert.ok(filtered.every(note=>notes.includes(note)));
    for(const staff of ['bass','treble']) {
      const side=staff==='bass'?'left':'right', kept=filtered.filter(note=>note.staff===staff);
      if(rules[side+'-density']) assert.ok(kept.length<=rules[side+'-density']);
      if(rules['hand-span'] && kept.length) assert.ok(Math.max(...kept.map(note=>note.midi))-Math.min(...kept.map(note=>note.midi))<=7);
      if(rules['ledger-limit']===0) assert.ok(kept.every(note=>Math.floor(Math.max(0,(staff==='bass'?18:30)-staffStep(note),staffStep(note)-(staff==='bass'?26:38))/2)===0));
      if(rules[side+'-leap']) assert.ok(kept.every(note=>Math.abs(note.midi-(side==='left'?48:64))<=2));
    }
  }
  const impossible=reduceAttack(written([72]),{...settings,'right-leap':2},{right:[60]});
  assert.deepEqual(impossible,[]);
});

test('authored passage filters preserve exact notation, complete ties, timing and the immutable original',()=>{
  const original=fixture(), before=JSON.stringify(original), full=filterStudy(original,settings);
  assert.deepEqual(full.notes,original.notes); assert.deepEqual(full.source.ties,original.source.ties);
  const left=filterStudy(original,{...settings,hand:'left'});
  assert.ok(left.sounds.length>0 && left.sounds.every(note=>note.staffId==='lower'));
  assert.deepEqual(left.duration,original.duration);
  for(const note of left.sounds) {
    const source=original.sounds.find(sound=>sound.id===note.id);
    assert.deepEqual(note.segments,source.segments); assert.deepEqual(note.end,source.end);
  }
  const simple=filterStudy(original,{...settings,'right-density':1,'left-density':1,size:2});
  assert.ok(simple.sounds.length<original.sounds.length);
  assert.equal(JSON.stringify(original),before);
  assert.throws(()=>filterStudy(original,{...settings,low:120}),/No retained notes/);
});

test('MIDI outlines and studies apply the same per-hand reduction and preserve retained source attacks',()=>{
  const notes=[48,52,55,60,64,67].map((midi,index)=>({id:'note-'+index,midi,start_tick:0,end_tick:480,track:0,channel:0,velocity:90}));
  const input={notes,ticks_per_quarter:480,duration_ticks:480,sha256:'filters',events:[],tempo_map:[{tick:0,microseconds_per_quarter:500000}]};
  const controls={...settings,'left-density':1,'right-density':2,'hand-span':7};
  const outline=makeOutline(input,controls), study=midiStudy(input,controls);
  assert.deepEqual(study.sounds.map(note=>note.midi).sort((a,b)=>a-b),outline.targets[0].map(note=>note.midi).sort((a,b)=>a-b));
  assert.equal(study.sounds.filter(note=>note.staffId==='lower').length,1);
  assert.equal(study.sounds.filter(note=>note.staffId==='upper').length,2);
});

test('Rachmaninoff Section 2 groups coincident pitches into chords without losing or inventing source attacks',()=>{
  const input=JSON.parse(readFileSync('tests/fixtures/piano-library/rachmaninoff-op3-2.json')), before=JSON.stringify(input);
  const section=suggestPassages(input)[1], outline=makeOutline(input,settings,section), score=midiStudy(input,settings,section);
  assert.ok(score.voices.length<=4,'chord tones must not become eleven independent voices');
  assert.ok(score.events.filter(event=>event.notes.length>1).length>40);
  assert.ok(score.events.filter(event=>event.kind==='rest').length<30);
  assert.deepEqual(score.sounds.flatMap(note=>note.sourceIds).sort(),outline.targets.flatMap(target=>target.flatMap(note=>note.sourceIds)).sort());
  for(const sound of score.sounds) assert.ok(compareBeat(sound.end,sound.start)>0);
  assert.equal(JSON.stringify(input),before);
});

test('coincident MIDI chords retain independent releases, pedal tails, unisons and dotted values',()=>{
  const input={sha256:'chords',ticks_per_quarter:480,duration_ticks:1920,tempo_map:[{tick:0,microseconds_per_quarter:500000}],events:[],notes:[
    {id:'long',midi:60,start_tick:0,end_tick:720,channel:0,track:0},
    {id:'chord',midi:64,start_tick:0,end_tick:720,channel:0,track:0},
    {id:'short',midi:67,start_tick:0,end_tick:480,channel:0,track:0},
    {id:'unison',midi:60,start_tick:0,end_tick:720,channel:1,track:1},
  ]};
  const score=midiStudy(input,settings);
  assert.equal(score.sounds.length,4);
  assert.ok(score.events.some(event=>event.notes.length===2 && event.dots===1));
  assert.deepEqual(score.sounds.find(note=>note.sourceIds[0]==='short').end,[1,1]);
  assert.deepEqual(score.sounds.find(note=>note.sourceIds[0]==='long').end,[3,2]);
  assert.equal(score.voices.length,3);
});

test('study limits include physically continuing notes and keep accepted ties complete',()=>{
  const input={sha256:'held-constraints',ticks_per_quarter:480,duration_ticks:1920,tempo_map:[{tick:0,microseconds_per_quarter:500000}],events:[],notes:[
    {id:'held',midi:60,start_tick:0,end_tick:960,channel:0,track:0},
    {id:'overlap',midi:64,start_tick:480,end_tick:720,channel:0,track:0},
    {id:'later',midi:64,start_tick:960,end_tick:1440,channel:0,track:0},
  ]};
  const score=midiStudy(input,{...settings,'right-density':1});
  assert.deepEqual(score.sounds.map(note=>note.sourceIds[0]),['held','later']);
  assert.deepEqual(score.sounds[0].end,[2,1]);
  assert.equal(score.source.provenance.retainedNotes,2);
  assert.equal(score.source.provenance.omittedNotes,1);
});

test('authored cross-staff hand assignments survive filtering, while ledger limits follow the written stave',()=>{
  const source=structuredClone(fixture().source);
  source.measures[0].events[0].staff='lower';
  const score=compileScore(source), right=filterStudy(score,{...settings,hand:'right'});
  assert.ok(right.sounds.some(note=>note.hand==='right' && note.staffId==='lower'));
  assert.ok(right.sounds.every(note=>note.hand!=='left'));
  const changed=structuredClone(fixture().source); changed.measures[0].clefs={upper:'bass'};
  const restricted=filterStudy(compileScore(changed),{...settings,'ledger-limit':0});
  assert.ok(restricted.notes.every(note=>note.staffId==='lower'),'ledger filtering follows authored clef changes');
  const keys=filterStudy(fixture(),{...settings,key:'C',material:'white'});
  assert.ok(keys.sounds.every(note=>[0,2,4,5,7,9,11].includes(note.midi%12)));
});
