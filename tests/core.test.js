import './saxophone.test.js';

import {GeneratedStream} from '../static/generated_stream.js';
import './score_practice.test.js';
import './midi_study.test.js';
import './passage_filters.test.js';
import './midi_stream.test.js';
import './meter.test.js';
import './score_tempo.test.js';
import './musicxml_score.test.js';
import {handDistance,attackHands} from '../static/generation.js';
import {scoreSecondsAt,authoredPlan} from '../static/score_transport.js';
import {scoreKeyForPassage} from '../static/score_key.js';
import {readFileSync} from 'node:fs';
import {beat,addBeat,multiplyBeat,compareBeat,compileScore} from '../static/score_model.js';
import {describeExercise} from '../static/exercise.js';
import {libraryValue,libraryFacets,filterLibrary,randomLibraryPiece,parseRecentLibrary,rememberLibraryPiece,recentLibraryPieces} from '../static/library.js';
import {sourceBeats,BeatCursor} from '../static/beats.js';
import {AcousticSamples,nearestSample} from '../static/samples.js';
import {suggestPassages} from '../static/sections.js';
import {FlowGate} from '../static/flow.js';
import {keyboardGeometry,keyboardKeyWidth} from '../static/keyboard.js';
import {cleanPassages,parsePassages,savePassage,passageKey} from '../static/passages.js';
import {secondsAt,referencePlan,PlaybackCursor} from '../static/transport.js';
import {layoutPreset,staffViewport,fitPanel,fitCustomPanels,parseCustomLayout} from '../static/layout.js';
import {attackGroups,makeOutline} from '../static/outline.js';
import {SynthPath,LocalAudio,MetronomeClock} from '../static/audio.js';
import {AttemptTracker,cleanHistory,summary,exerciseIdentity,grouped,daily,dailyPlot,parseHistory,mergeHistory,readingPatterns,clearHistoryPeriod} from '../static/metrics.js';
import {makePracticePhrase, harmonicPitchClasses,cadenceLabels,advancedChord,advancedVocabulary} from '../static/harmony.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {KEYS, keyAlterations, spellInKey, spell, spellChord, noteName, staffStep, candidates, makeTarget, makePhrase, chordName, match, Performance} from '../static/core.js';
import {staffLayout, accidentalLayout, readingWindow} from '../static/notation.js';

const defaults = {low: 48, high: 84, hand: 'right', material: 'white', span: 'near', size: 1};
test('phrases have bounded lengths and varied chord sizes within minimum/maximum', () => {
  let state = 37;
  const random = () => {state = (state*16807)%2147483647; return state/2147483647;};
  const phrase = makePhrase({...defaults, length:32, size:3, 'min-size':1},random);
  assert.equal(phrase.length,32);
  assert.ok(phrase.every(chord => chord.length >= 1 && chord.length <= 3));
  assert.deepEqual([...new Set(phrase.map(chord => chord.length))].sort(),[1,2,3]);
  assert.equal(makePhrase({...defaults,length:100}).length,32);
  assert.ok(makePhrase({...defaults,length:4,size:3,'min-size':3}).every(chord => chord.length === 3));
});
test('chord names recognise exact common voicings, inversions and doublings', () => {
  const name = pitches => chordName(pitches.map(n => spell(n)));
  assert.equal(name([60,64,67]),'C');
  assert.equal(name([60,64,67,71]),'Cmaj7');
  assert.equal(name([60,64,66,71]),'Cmaj7♭5');
  assert.equal(name([62,65,69,72]),'Dm7');
  assert.equal(name([64,67,72]),'C/E');
  assert.equal(name([60,64,67,72]),'C');
  assert.equal(name([60]),'');
  assert.equal(name([60,61,66]),'');
});
test('key signatures alter generated pitches and preserve enharmonic octave spelling', () => {
  assert.deepEqual(candidates({...defaults, key:'G', low:65, high:67}), [66,67]);
  assert.deepEqual(candidates({...defaults, key:'F', low:69, high:71}), [69,70]);
  assert.equal(noteName(spellInKey(59, 'Cb')), 'C♭4');
  assert.equal(noteName(spellInKey(60, 'C#')), 'B♯3');
  assert.equal(spellInKey(65, 'G'), null);
  for (const key of KEYS) {
    const alterations = keyAlterations(key.id);
    assert.equal(Object.values(alterations).filter(Boolean).length, Math.abs(key.fifths));
    const target = makeTarget({...defaults, key:key.id, hand:'both', size:10});
    assert.equal(target.length, 10);
    for (const note of target) assert.equal(note.accidental, alterations[note.letter]);
  }
});
test('D4 D-sharp4 G4 becomes three distinct written notes D4 E-flat4 G4', () => {
  for (const flats of [false, true]) {
    const notes = spellChord([62, 63, 67], flats);
    assert.deepEqual(notes.map(noteName), ['D4', 'E♭4', 'G4']);
    assert.deepEqual(notes.map(n => n.midi), [62, 63, 67]);
  }
  assert.deepEqual(spellChord([61, 62], true).map(noteName), ['C♯4', 'D4']);
  assert.equal(spellChord([62, 63, 64]), null);
});
test('generated chromatic chords never duplicate a written staff position', () => {
  for (const material of ['sharps', 'flats']) for (let i = 0; i < 150; i++) {
    const notes = makeTarget({...defaults, material, size: 10, hand: 'both'});
    assert.equal(new Set(notes.map(staffStep)).size, notes.length);
    for (const n of notes) {
      const pitch = (n.octave+1)*12 + ({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[n.letter] + n.accidental;
      assert.equal(pitch, n.midi);
    }
  }
  const tight = makeTarget({...defaults, low: 62, high: 64, material: 'sharps', size: 3}, () => 0);
  assert.equal(tight.length, 2);
});
test('accidentals share the nearest column unless their vertical extents conflict', () => {
  const notes = [61, 66, 73].map(n => spell(n));
  const positions = new Map(notes.map(n => [n, 352]));
  const yFor = n => 200-staffStep(n)*5;
  const columns = accidentalLayout(notes, positions, yFor);
  assert.equal(columns.get(notes[2]), 335);
  assert.equal(columns.get(notes[0]), 335);
  assert.equal(columns.get(notes[1]), 317);
});
test('staff layout reserves ledger and stem room above, between and below both staves', () => {
  // Written pitches may eventually cross staves; test each extreme on either one.
  for (const pitches of [[0, 127], [60], [21, 108]]) {
    const target = ['treble', 'bass'].flatMap(staff => pitches.map(midi => ({...spell(midi), staff})));
    const layout = staffLayout(target);
    const trebleYs = target.filter(n => n.staff === 'treble').map(layout.yFor);
    const bassYs = target.filter(n => n.staff === 'bass').map(layout.yFor);
    assert.ok(Math.min(...trebleYs) >= 80);
    assert.ok(layout.height - Math.max(...bassYs) >= 80);
    assert.ok(Math.min(...bassYs, layout.bassBottom-40) - Math.max(...trebleYs, layout.trebleBottom) >= 100);
    assert.ok(target.every(n => layout.yFor(n)-32 > 0 && layout.yFor(n)+15 < layout.height));
  }
});
test('written spelling and staff placement are independent of MIDI pitch', () => {
  assert.equal(noteName(spell(61)), 'C♯4');
  assert.equal(noteName(spell(61, true)), 'D♭4');
  assert.equal(staffStep(spell(61, true)) - staffStep(spell(61)), 1);
  assert.equal(noteName({midi: 62, letter: 'C', accidental: 2, octave: 4}), 'C𝄪4');
  assert.equal(noteName({midi: 60, letter: 'D', accidental: -2, octave: 4}), 'D𝄫4');
});
test('generation respects keyboard, material, reading range and hand', () => {
  assert.deepEqual(candidates({...defaults, low: 61, high: 66}), [62, 64, 65]);
  assert.deepEqual(candidates({...defaults, hand: 'left', low: 70}), []);
  assert.deepEqual(makeTarget({...defaults, low: 61, high: 61}), []);
  for (let i = 0; i < 100; i++) {
    const target = makeTarget({...defaults, size: 10, hand: 'both', material: 'flats'});
    assert.equal(target.length, 10);
    assert.equal(new Set(target.map(n => n.midi)).size, 10);
    assert.ok(target.some(n => n.staff === 'bass'));
    assert.ok(target.some(n => n.staff === 'treble'));
    assert.ok(target.every(n => n.midi >= 48 && n.midi <= 72));
  }
  assert.equal(makeTarget({...defaults, low: 60, high: 62, size: 10}).length, 2);
});
test('exact matching rejects extras and requires simultaneous physical notes', () => {
  const target = [60, 64, 67].map(n => spell(n));
  assert.equal(match(target, new Set([60, 64])).complete, false);
  assert.equal(match(target, new Set([60, 64, 67, 69])).complete, false);
  assert.equal(match(target, new Set([60, 64, 67])).complete, true);
  assert.equal(match([], new Set()).complete, false);
});
test('directions only appear for one target and one played note', () => {
  assert.equal(match([spell(60)], new Set([59])).direction, 'up');
  assert.equal(match([spell(60)], new Set([61])).direction, 'down');
  assert.equal(match([spell(60)], new Set([59, 61])).direction, null);
  assert.equal(match([spell(60), spell(64)], new Set([61])).direction, null);
});
test('chord hints pair nearby errors while preserving correct notes', () => {
  const target = [60, 64, 67].map(n => spell(n));
  assert.deepEqual(match(target, new Set([60, 65, 67])).hints, [{played: 65, target: 64, direction: 'down'}]);
  assert.deepEqual(match(target, new Set([61, 64, 66])).hints, [
    {played: 61, target: 60, direction: 'down'}, {played: 66, target: 67, direction: 'up'}
  ]);
  assert.deepEqual(match(target, new Set([60, 65])).hints, [{played: 65, target: 64, direction: 'down'}]);
  assert.equal(match(target, new Set([60, 65, 67])).complete, false);
});
test('chord hints do not break ties, invent distant pairs or mark extra-only notes', () => {
  assert.deepEqual(match([60, 62].map(n => spell(n)), new Set([61])).hints, []);
  assert.deepEqual(match([60, 64].map(n => spell(n)), new Set([59, 61, 64])).hints, []);
  assert.deepEqual(match([60, 64, 67].map(n => spell(n)), new Set([60, 70, 67])).hints, []);
  assert.deepEqual(match([60, 64].map(n => spell(n)), new Set([60, 64, 65])).hints, []);
  assert.deepEqual(match([60, 62].map(n => spell(n)), new Set([59, 61])).hints, []);
});
test('sustain never impersonates a physically held note', () => {
  const p = new Performance();
  p.midi('piano', [0x90, 60, 100]); p.midi('piano', [0xb0, 64, 127]);
  p.midi('piano', [0x90, 60, 0]); // velocity-zero note-on is note-off
  assert.equal(p.held.size, 0);
  assert.deepEqual([...p.sustained], [60]);
  assert.equal(match([spell(60)], p.held).complete, false);
  p.midi('piano', [0xb0, 64, 0]);
  assert.equal(p.sustained.size, 0);
});
test('channels and input sources cannot release each other’s notes', () => {
  const p = new Performance();
  p.midi('piano', [0x90, 60, 80]); p.midi('piano', [0x91, 60, 90]);
  p.midi('piano', [0x80, 60, 0]); assert.deepEqual([...p.held], [60]);
  p.noteOn('pointer:1', 60); p.midi('piano', [0x81, 60, 0]);
  assert.equal(p.held.has(60), true);
  p.clear('pointer:1'); assert.equal(p.held.size, 0);
});
test('retrigger, reset controllers, panic and disconnection clear state', () => {
  const p = new Performance();
  p.midi('piano', [0xb0, 64, 127]); p.midi('piano', [0x90, 60, 90]); p.midi('piano', [0x80, 60, 0]);
  p.midi('piano', [0x90, 60, 90]); assert.equal(p.sustained.size, 0);
  p.midi('piano', [0x80, 60, 0]); p.midi('piano', [0xb0, 121, 0]);
  assert.equal(p.pedal, false); assert.equal(p.sustained.size, 0);
  p.midi('piano', [0x90, 60, 90]); p.midi('piano', [0xb0, 123, 0]); assert.equal(p.held.size, 0);
  p.midi('piano', [0x90, 60, 90]); p.clear(); assert.equal(p.held.size, 0);
});
test('irrelevant MIDI traffic and unchanged notes do not trigger UI work', () => {
  const p = new Performance();
  for (const data of [[0xfe], [0xf8], [0xe0, 64, 64], [0xb0, 7, 100], [0xd0, 40]]) assert.equal(p.midi('piano', data), false);
  assert.equal(p.midi('piano', [0x90, 60, 100]), true);
  assert.equal(p.midi('piano', [0x90, 60, 100]), false);
});

test('reading windows page without changing targets and retain partial final pages', () => {
  const base={index:5,length:8,capacity:4,preview:3};
  assert.deepEqual(readingWindow(base),[5,6,7,8]);
  assert.deepEqual(readingWindow({...base,mode:'page'}),[4,5,6,7]);
  assert.deepEqual(readingWindow({...base,length:6,mode:'page'}),[4,5]);
  assert.deepEqual(readingWindow({...base,index:7,preview:0,mode:'page'}),[7]);
  assert.deepEqual(readingWindow({...base,index:7,offset:17,length:32,mode:'page',repeat:false}),[7,8,9,10]);
  assert.deepEqual(readingWindow({...base,index:0,length:0}),[]);
  assert.deepEqual(readingWindow({...base,index:0,length:0,repeat:false}),[]);
});

test('compact staff layout removes whitespace without shrinking written intervals or clipping extremes', () => {
  const notes=['treble','bass'].flatMap(staff=>[0,60,127].map(midi=>({...spell(midi),staff})));
  const normal=staffLayout(notes), compact=staffLayout(notes,{compact:true});
  assert.ok(compact.height < normal.height);
  assert.equal(compact.yFor(notes[0])-compact.yFor(notes[1]),normal.yFor(notes[0])-normal.yFor(notes[1]));
  assert.ok(notes.every(note=>compact.yFor(note)-32>0 && compact.yFor(note)+15<compact.height));
});

test('harmonic cadence keeps exact major and relative-minor triads across buffer offsets', () => {
  const settings={...defaults,hand:'right',span:'wide',low:60,high:84,size:3,'min-size':3,length:4,source:'cadence',key:'C','hand-span':12};
  const pcs=chord=>[...new Set(chord.map(n=>n.midi%12))].sort((a,b)=>a-b);
  const major=makePracticePhrase(settings,()=>.2);
  assert.deepEqual(major.map(pcs),[[0,4,7],[0,5,9],[2,7,11],[0,4,7]]);
  const minor=makePracticePhrase({...settings,'harmony-scale':'minor'},()=>.2);
  assert.deepEqual(minor.map(pcs),[[0,4,9],[2,5,9],[4,7,11],[0,4,9]]);
  assert.deepEqual(makePracticePhrase({...settings,sequenceOffset:2,length:2},()=>.2).map(pcs),[[2,7,11],[0,4,7]]);
  assert.deepEqual(harmonicPitchClasses('G',false,0),[7,11,2]);
});
test('harmonic voicings honour physical ranges, hands and span, without blocking random practice', () => {
  let seed=3; const random=()=>((seed=seed*16807%2147483647)/2147483647);
  for (const hand of ['left','right','both']) for (const key of ['C','G','Cb','F#']) {
    const settings={...defaults,hand,key,source:'triads',span:'wide',low:36,high:84,size:6,'min-size':3,length:16,'hand-span':12};
    for (const chord of makePracticePhrase(settings,random)) {
      assert.ok(chord.length>=1);
      assert.ok(chord.every(n=>n.midi>=36 && n.midi<=84));
      for (const staff of ['treble','bass']) {
        const notes=chord.filter(n=>n.staff===staff).map(n=>n.midi);
        assert.ok(notes.length<=5);
        if (notes.length) assert.ok(notes.at(-1)-notes[0]<=12);
      }
    }
  }
  assert.deepEqual(makePracticePhrase({...defaults,length:2},()=>.3),makePhrase({...defaults,length:2},()=>.3));
  assert.deepEqual(makePracticePhrase({...defaults,source:'cadence',low:61,high:61,length:2}),[[],[]]);
});

test('reading measurements allow staggered fingers and exclude confirmation delay', () => {
  let time=0; const tracker=new AttemptTracker({now:()=>time,stamp:()=> '2026-10-16T12:00:00Z'});
  tracker.start([60,64,67].map(midi=>({...spell(midi),staff:'treble'})),{key:'C'});
  time=10; tracker.observe(new Set([60])); time=20; tracker.observe(new Set([60,64]));
  time=30; tracker.observe(new Set([60,64,67])); time=150;
  const record=tracker.finish(); assert.equal(record.responseMs,30); assert.equal(record.firstAttemptCorrect,true);
  assert.equal(record.context.key,'C'); assert.equal(tracker.finish(),null);
});
test('reading measurements count new wrong presses, cancel brief matches and freeze while paused', () => {
  let time=0; const tracker=new AttemptTracker({now:()=>time});
  const target=[{...spell(60),staff:'treble'}]; tracker.start(target);
  time=10; tracker.observe(new Set([61])); tracker.observe(new Set([61]));
  time=20; tracker.observe(new Set()); time=30; tracker.observe(new Set([61]));
  time=40; tracker.observe(new Set([60])); time=50; tracker.observe(new Set([60,61]));
  time=60; tracker.observe(new Set([60])); time=100; tracker.pause();
  time=1100; tracker.observe(new Set([60])); tracker.pause();
  time=1200; tracker.resume(); tracker.resume(); time=1250; tracker.observe(new Set([60]));
  const record=tracker.finish(); assert.equal(record.responseMs,150); assert.equal(record.wrongPresses,3); assert.equal(record.firstAttemptCorrect,false);
  tracker.start(target); tracker.pause(); assert.equal(tracker.finish(),null);
  tracker.start([]); tracker.observe(new Set()); tracker.pause(); tracker.resume(); assert.equal(tracker.finish(),null);
});
test('history validation, comparable identities, summaries and sparse breakdowns are explicit', () => {
  const note={...spell(84),staff:'treble'};
  const record=(ms,clean=true)=>({version:1,at:'2026-10-16T12:00:00Z',responseMs:ms,wrongPresses:clean?0:1,firstAttemptCorrect:clean,notes:[note],context:{hand:'right',key:'C'}});
  const rows=[record(100),record(200,false),record(400)];
  assert.equal(cleanHistory(null).length,0);
  assert.equal(cleanHistory([null,{...record(0),notes:[null]},{...record(0),responseMs:-1},...rows]).length,3);
  assert.deepEqual(summary([]),{count:0,mean:null,median:null,p90:null,accuracy:null});
  assert.equal(summary(rows).median,200); assert.equal(summary(rows.slice(0,2)).median,150); assert.equal(summary(rows).p90,400);
  assert.equal(summary(rows).accuracy,2/3);
  assert.equal(grouped(rows,'position')[0].label,'treble: ledger 2 above');
  assert.equal(grouped(rows,'note')[0].label,'C6'); assert.equal(grouped(rows,'accidental')[0].label,'Natural');
  assert.equal(grouped([{...rows[0],notes:[note,note]}],'position').length,0);
  assert.equal(grouped([{...rows[0],context:{}}],'key')[0].label,'Unknown');
  assert.equal(daily(rows)[0].count,3);
  const id=exerciseIdentity([note],{key:'C',preview:0,endAction:'repeat'},[[note]]);
  assert.equal(id,exerciseIdentity([note],{key:'C',preview:3,endAction:'repeat'},[[note]]));
  assert.notEqual(id,exerciseIdentity([note],{key:'G',endAction:'repeat'},[[note]]));
  assert.notEqual(id,exerciseIdentity([note],{key:'C',endAction:'new'},[[note]]));
});

function fakeAudio() {
  const events=[], nodes=[];
  const param=()=>({value:0,setValueAtTime(...a){events.push(['set',...a]);},linearRampToValueAtTime(...a){events.push(['linear',...a]);},exponentialRampToValueAtTime(...a){events.push(['exp',...a]);},setTargetAtTime(...a){events.push(['target',...a]);},cancelAndHoldAtTime(t){events.push(['hold',t]);},cancelScheduledValues(t){events.push(['cancel',t]);}});
  const node=()=>({gain:param(),frequency:param(),connect(){},disconnect(){this.disconnected=true;},start(t){this.started=t;},stop(t=0){this.stopped=t;}});
  return {currentTime:1,destination:{},events,nodes,createGain:node,createDynamicsCompressor:node,createBufferSource(){const n=node();n.playbackRate=param();nodes.push(n);return n;},createOscillator(){const n=node();nodes.push(n);return n;}};
}
test('audio paths independently sync held/sustained pitch sets, release and panic',()=>{
  const context=fakeAudio(), audio=new LocalAudio(context);
  audio.live.configure('piano',.4); audio.reference.configure('organ',.2);
  audio.live.sync([60,64]); assert.equal(audio.live.voices.size,2); assert.equal(context.nodes.length,6);
  audio.live.sync([60,64]); assert.equal(context.nodes.length,6);
  audio.audition([67]); assert.equal(audio.reference.voices.size,1); assert.equal(context.nodes.length,10);
  assert.ok(Math.abs(context.nodes[0].frequency.value-261.625565)<.00001);
  audio.live.sync([64]); assert.equal(audio.live.voices.size,1); assert.equal(audio.reference.voices.size,1);
  audio.live.configure('organ',2); assert.equal(audio.live.voices.size,0);
  audio.live.sync([64]); audio.click({time:2,beat:0}); audio.click({time:2.5,beat:1});
  assert.equal(audio.clicks.size,2); assert.equal(context.nodes.at(-2).frequency.value,1400); assert.equal(context.nodes.at(-1).frequency.value,900);
  audio.panic(); assert.equal(audio.live.voices.size,0); assert.equal(audio.reference.voices.size,0); assert.equal(audio.clicks.size,0);
  for(const oscillator of context.nodes) {assert.notEqual(oscillator.stopped,undefined); oscillator.onended(); assert.equal(oscillator.disconnected,true);}
});
test('audio validates notes and cleans up timed/retriggered voices without dropping replacements',()=>{
  const context=fakeAudio(), path=new SynthPath(context,context.destination);
  for(const pitch of [-1,128,60.1,NaN]) path.noteOn(pitch);
  assert.equal(path.voices.size,0);
  path.noteOn(60,1,.8); const old=path.voices.get(60);
  path.noteOn(60); const replacement=path.voices.get(60); assert.notEqual(old,replacement);
  old.oscillators.forEach(osc=>osc.onended()); assert.equal(path.voices.get(60),replacement);
  path.configure('unknown',-1); assert.equal(path.instrument,'piano');
  path.noteOn(65,1,.8); const timed=path.voices.get(65); timed.oscillators.forEach(osc=>osc.onended()); assert.equal(path.voices.has(65),false);
  const voice=path.voices.get(60); voice.envelope.gain.cancelAndHoldAtTime=null;
  path.noteOff(60); assert.equal(path.voices.size,0); assert.ok(context.events.some(event=>event[0]==='cancel'));
  path.noteOff(60); path.stop();
});
test('metronome schedules on the audio clock with accents and bounded recovery',()=>{
  const clock=new MetronomeClock(), beats=[];
  clock.pump(0,event=>beats.push(event)); assert.equal(beats.length,0);
  clock.start(0,120,3);
  for(const now of [0,.45,.95,1.45,1.95]) clock.pump(now,event=>beats.push(event));
  assert.deepEqual(beats.map(b=>b.beat),[0,1,2,0,1]); assert.equal(beats[3].bar,1);
  assert.ok(Math.abs(beats[4].time-2.03)<.00001);
  clock.pump(100,event=>beats.push(event)); assert.equal(beats.length,6); assert.equal(beats.at(-1).beat,0); assert.equal(beats.at(-1).time,100.03);
  clock.stop(); clock.pump(200,event=>beats.push(event)); assert.equal(beats.length,6);
  clock.start(0,999,99); assert.equal(clock.interval,.25); assert.equal(clock.beats,12);
  clock.start(0,0,0); assert.equal(clock.interval,.75); assert.equal(clock.beats,4);
});

test('MIDI pitch outlines retain source attack identity without changing timing or notes',()=>{
  const score={notes:[{id:'a',midi:60,start_tick:0,end_tick:480,channel:0},{id:'b',midi:64,start_tick:0,end_tick:960,channel:0},{id:'c',midi:67,start_tick:480,end_tick:960,channel:1},{id:'drum',midi:60,start_tick:240,channel:9}]};
  const original=JSON.stringify(score), settings={...defaults,size:3,key:'C'};
  assert.deepEqual(attackGroups(score).map(group=>group.tick),[0,480]);
  const outline=makeOutline(score,settings);
  assert.deepEqual(outline.targets.map(chord=>chord.map(n=>n.midi)),[[60,64],[67]]);
  assert.equal(outline.retainedNotes,3); assert.equal(outline.omittedNotes,0);
  assert.equal(outline.targets[1][0].sourceTick,480); assert.equal(outline.targets[1][0].sourceOnset,2);
  assert.deepEqual(outline.targets[1][0].sourceIds,['c']); assert.equal(outline.targets[1][0].staff,'treble');
  assert.deepEqual(makeOutline(score,settings,{start:2,end:2}).targets.map(chord=>chord.map(n=>n.midi)),[[67]]);
  assert.equal(JSON.stringify(score),original);
  const simplified=makeOutline(score,{...settings,size:1});
  assert.deepEqual(simplified.targets.map(chord=>chord.map(n=>n.midi)),[[64],[67]]); assert.equal(simplified.omittedNotes,1);
  assert.equal(makeOutline(score,{...settings,low:90,high:100}).targets.length,0);
  assert.equal(makeOutline(null,settings).targets.length,0);
});
test('outline reduction prefers outer voices, obeys filters and keeps distinct written positions',()=>{
  const score={notes:[48,60,61,62,64,67,72].map((midi,i)=>({id:String(i),midi,start_tick:0,channel:0}))};
  const settings={...defaults,low:0,high:127,span:'full',hand:'both',size:3,material:'sharps',key:'C'};
  const reduced=makeOutline(score,settings);
  assert.deepEqual(reduced.targets[0].map(n=>n.midi),[48,67,72]);
  assert.deepEqual(reduced.targets[0].map(n=>n.staff),['bass','treble','treble']);
  const chromatic=makeOutline(score,{...settings,size:10});
  assert.equal(new Set(chromatic.targets[0].map(staffStep)).size,chromatic.targets[0].length);
  assert.ok(chromatic.omittedNotes>0);
  assert.ok(makeOutline(score,{...settings,hand:'left',material:'flats'}).targets[0].every(n=>n.staff==='bass' && n.midi<60));
  const duplicates={notes:[{id:'a',midi:60,start_tick:0,channel:0},{id:'b',midi:60,start_tick:0,channel:1}]};
  const duplicate=makeOutline(duplicates,settings); assert.equal(duplicate.retainedNotes,2); assert.deepEqual(duplicate.targets[0][0].sourceIds,['a','b']);
  const long={notes:Array.from({length:1000},(_,i)=>({id:String(i),midi:60,start_tick:i,channel:0}))};
  assert.equal(makeOutline(long,settings,{start:2,end:1000}).targets.length,512);
  assert.equal(makeOutline(long,settings,{start:99999,end:1}).start,1000);
  assert.equal(attackGroups({notes:[{midi:60,start_tick:0}]}).length,1);
});

test('imported progress identities compare exact source passage and attack with bounded size',()=>{
  const note={...spell(60),staff:'treble',sourceOnset:2};
  const settings={...defaults,source:'midi',endAction:'repeat',scoreId:'hash-a',passage:{start:1,end:512}};
  const phrase=Array.from({length:512},()=>[note]);
  const identity=exerciseIdentity([note],settings,phrase);
  assert.ok(identity.length<800);
  assert.notEqual(identity,exerciseIdentity([note],{...settings,scoreId:'hash-b'},phrase));
  assert.notEqual(identity,exerciseIdentity([note],{...settings,passage:{start:2,end:512}},phrase));
  assert.notEqual(identity,exerciseIdentity([{...note,sourceOnset:3}],settings,phrase));
  const generated={...defaults,endAction:'repeat'}, fields=['hand','key','source','material','span','low','high','size','min-size','harmony-scale','hand-span','endAction'];
  const legacy=JSON.stringify([1,fields.map(field=>[field,generated[field]??null]),[[60,'C',0,4,'treble']],[[60]]]);
  assert.equal(exerciseIdentity([note],generated,[[note]]),legacy);
});

test('resolution presets budget browser chrome, adapt to the viewport and migrate saved choices',()=>{
  for(const [height,preset] of [[500,'720'],[720,'1080'],[900,'1080'],[1000,'1440'],[1240,'1440'],[1800,'2160']]) assert.equal(layoutPreset('auto',height).preset,preset);
  assert.equal(layoutPreset('comfortable',1000).preset,'1440'); assert.equal(layoutPreset('compact',1000).preset,'1080');
  for(const preset of ['720','1080','1440','2160']) {
    const profile=layoutPreset(preset,3000);
    assert.equal(profile.budget,+preset-180); assert.equal(staffViewport(profile,0),profile.preferred);
    assert.equal(staffViewport(profile,5000),profile.minimum);
  }
  assert.equal(layoutPreset('1440',800).budget,800);
  assert.equal(layoutPreset('1440',1160).preferred,380);
  assert.equal(layoutPreset('720',500,390).minimum,170);
  assert.equal(layoutPreset('2160',1800).density,'comfortable');
});

test('history restoration validates complete files and merges without duplicating attempts',()=>{
  const record={version:1,at:'2026-10-16T12:00:00Z',responseMs:150,wrongPresses:0,firstAttemptCorrect:true,wrongPitches:[],notes:[{...spell(60),staff:'treble'}],context:{identity:'one',hand:'right'}};
  const json=records=>JSON.stringify({version:1,records});
  assert.deepEqual(parseHistory(json([record])),[record]); assert.deepEqual(parseHistory(json([])),[]);
  for(const text of [null,'x'.repeat(16_000_001),'oops','null','{}',JSON.stringify({version:2,records:[]}),json(Array(1001).fill(record)),json([record,{...record,responseMs:-1}]),json([{...record,firstAttemptCorrect:false}]),json([{...record,context:{identity:123}}]),json([{...record,context:{identity:'x'.repeat(8001)}}]),json([{...record,notes:[{...record.notes[0],octave:5}]}])]) assert.throws(()=>parseHistory(text));
  const second={...record,at:'2026-10-17T12:00:00Z',responseMs:200};
  assert.deepEqual(mergeHistory([second,record],[record,second]),[record,second]);
  const equivalent={...record,context:{hand:'right',identity:'one'},notes:[{staff:'treble',octave:4,letter:'C',accidental:0,midi:60}]};
  assert.equal(mergeHistory([record],[equivalent]).length,1);
  assert.equal(mergeHistory([],Array.from({length:1100},(_,i)=>({...record,responseMs:i}))).length,1000);
  assert.equal(mergeHistory([{...record,context:{},wrongPitches:undefined}],[]).length,1);
});

test('MIDI track selection and explicit staff assignments respect hands without inventing voices',()=>{
  const score={notes:[{id:'low',midi:48,start_tick:0,track:1,channel:0},{id:'high',midi:72,start_tick:0,track:2,channel:0},{id:'next',midi:55,start_tick:480,track:1,channel:0}]};
  const settings={...defaults,low:0,high:127,span:'full',hand:'both',size:3};
  const tracks=[{track:1,enabled:true,staff:'treble'},{track:2,enabled:false,staff:'bass'}];
  const result=makeOutline(score,{...settings,hand:'right'},{tracks});
  assert.deepEqual(result.targets.map(chord=>chord.map(note=>note.midi)),[[48],[55]]);
  assert.ok(result.targets.every(chord=>chord.every(note=>note.staff==='treble')));
  assert.equal(result.omittedNotes,1); assert.equal(result.totalOnsets,2);
  assert.equal(makeOutline(score,{...settings,hand:'left'},{tracks}).targets.length,0);
  tracks[0].staff='bass'; tracks[1].enabled=true;
  const bass=makeOutline(score,{...settings,hand:'left'},{tracks});
  assert.deepEqual(bass.targets[0].map(note=>[note.midi,note.staff]),[[48,'bass'],[72,'bass']]);
  assert.equal(makeOutline(score,settings,{tracks:[]}).targets.length,0);
  assert.equal(makeOutline(score,{...settings,hand:'right'},{tracks:[{track:2,enabled:true,staff:'auto'}]}).targets[0][0].midi,72);
  const duplicate={notes:[{id:'a',midi:60,start_tick:0,track:1},{id:'b',midi:60,start_tick:0,track:2}]};
  const one=makeOutline(duplicate,settings,{tracks:[{track:1,enabled:false,staff:'auto'},{track:2,enabled:true,staff:'bass'}]});
  assert.deepEqual(one.targets[0][0].sourceIds,['b']); assert.equal(one.targets[0][0].staff,'bass');
});

test('reading history does not duplicate large imported source-note arrays',()=>{
  let now=0; const tracker=new AttemptTracker({now:()=>now});
  const note={...spell(60),staff:'treble',sourceOnset:1,sourceTick:0,sourceIds:Array(25000).fill('source-note')};
  tracker.start([note],{identity:'source hash and passage'}); now=50; tracker.observe(new Set([60]));
  const record=tracker.finish(); assert.equal(record.notes[0].sourceOnset,1); assert.equal(record.notes[0].sourceTick,0);
  assert.equal(record.notes[0].sourceIds,undefined); assert.ok(JSON.stringify(record).length<500);
  const text=JSON.stringify({version:1,records:Array.from({length:1000},(_,i)=>({...record,responseMs:i,context:{identity:'x'.repeat(4000)}}))},null,2);
  assert.ok(text.length>2_000_000); assert.equal(parseHistory(text).length,1000);
});

function playbackFixture() {
  const event=(tick,index,message,track=1)=>({tick,index,track,message});
  return {ticks_per_quarter:480,duration_ticks:960,tempo_map:[{tick:0,seconds:0,microseconds_per_quarter:500000},{tick:480,seconds:.5,microseconds_per_quarter:600000}],notes:[{id:'a',midi:60,start_tick:0,channel:0,track:1},{id:'b',midi:64,start_tick:480,channel:0,track:1}],events:[event(0,0,{type:'note_on',channel:0,note:60,velocity:80}),event(240,1,{type:'control_change',channel:0,control:64,value:127},0),event(480,2,{type:'note_off',channel:0,note:60,velocity:0}),event(480,3,{type:'note_on',channel:0,note:64,velocity:100}),event(720,4,{type:'control_change',channel:0,control:64,value:0},0),event(960,5,{type:'note_on',channel:0,note:64,velocity:0})]};
}
test('source playback derives pedal spans and tempo timing without changing original events',()=>{
  const score=playbackFixture(), original=JSON.stringify(score), plan=referencePlan(score);
  assert.equal(secondsAt(score,240),.25); assert.equal(secondsAt(score,720),.8);
  assert.deepEqual(plan.notes.map(note=>[note.pitch,note.start,note.end]),[[60,0,.8],[64,.5,1.1]]);
  assert.equal(plan.duration,1.1); assert.equal(JSON.stringify(score),original);
  assert.deepEqual(referencePlan(score,{start:1,end:1}).notes.map(note=>[note.pitch,note.end]),[[60,.5]]);
  const later=referencePlan(score,{start:2,end:2},.5);
  assert.equal(later.notes.length,2); assert.deepEqual(later.notes.map(note=>note.pitch),[60,64]); assert.equal(later.notes[0].start,0); assert.ok(Math.abs(later.notes[0].end-.6)<1e-9); assert.ok(Math.abs(later.duration-1.2)<1e-9);
  assert.equal(referencePlan(score,{tracks:[]}).notes.length,0);
  assert.equal(referencePlan(score,{tracks:[{track:1,enabled:true}]}).notes[0].end,.8,'conductor pedal applies to selected notes');
  assert.equal(referencePlan({...score,notes:[]}).duration,0);
});
test('source playback respects controller ordering, all-notes/off resets and voice limits',()=>{
  const score=playbackFixture();
  score.events[1].tick=480; score.events.sort((a,b)=>a.tick-b.tick || b.index-a.index);
  // Note-off before pedal-down at the same tick must not extend that note.
  assert.equal(referencePlan(score).notes[0].end,.5);
  const cutoff=control=>{const data=playbackFixture(); data.events[4].message.control=control; return referencePlan(data);};
  assert.equal(cutoff(121).notes[0].end,.8);
  assert.ok(cutoff(120).notes.every(note=>note.end===.8));
  assert.equal(cutoff(123).notes[0].end,1.1,'all notes off still obeys a down pedal');
  const unmatched=playbackFixture(); unmatched.events.unshift({tick:0,index:9,track:1,message:{type:'note_off',note:20,channel:0}});
  unmatched.events.push({tick:961,index:10,track:1,message:{type:'note_on',note:20,velocity:80,channel:9}});
  assert.equal(referencePlan(unmatched).notes.length,2);
  const dense=playbackFixture(); dense.events=Array.from({length:129},(_,i)=>({tick:0,index:i,track:1,message:{type:'note_on',note:60,channel:0,velocity:80}}));
  assert.throws(()=>referencePlan(dense),/128/);
  assert.equal(referencePlan(playbackFixture(),{start:0,end:999},999).duration,.55);
});
test('audio-clock playback pauses/resumes held spans and skips elapsed notes after a stall',()=>{
  const plan={duration:2,notes:[{id:'a',pitch:60,start:0,end:1},{id:'b',pitch:64,start:.5,end:.6},{id:'c',pitch:67,start:1,end:2}]};
  const cursor=new PlaybackCursor(), emitted=[];
  cursor.pump(0,note=>emitted.push(note)); cursor.pause(0); assert.equal(emitted.length,0);
  cursor.play(plan,10); cursor.pump(10,note=>emitted.push(note));
  assert.equal(emitted[0].time,10.03); assert.equal(emitted[0].duration,1);
  cursor.pause(10.43); assert.ok(Math.abs(cursor.position-.4)<1e-8);
  cursor.play(plan,20,cursor.position); assert.ok(Math.abs(cursor.at(20)-.4)<1e-8);
  cursor.pump(20,note=>emitted.push(note)); assert.ok(Math.abs(emitted.at(-1).duration-.6)<1e-8);
  cursor.pump(20.73,note=>emitted.push(note));
  assert.equal(emitted.at(-1).id,'c'); assert.ok(!emitted.some(note=>note.id==='b'));
  cursor.pump(30,note=>emitted.push(note)); assert.equal(cursor.state,'ended'); assert.equal(cursor.position,2);
  cursor.stop(); assert.equal(cursor.position,0); assert.equal(cursor.state,'stopped');
});
test('scheduled reference voices cancel before attack, own repeated pitches independently and clean up tails',()=>{
  const context=fakeAudio(), path=new SynthPath(context,context.destination);
  path.noteOn(60,2,.5,'a',.5); path.noteOn(60,2.1,.5,'b',1);
  assert.equal(path.voices.size,2); assert.equal(path.sounding.size,2);
  path.stop(); assert.equal(path.voices.size,0); assert.ok(context.nodes.every(node=>node.stopped===1));
  for(const node of context.nodes) node.onended(); assert.equal(path.sounding.size,0);
  path.noteOn(60); path.noteOff(60); assert.equal(path.voices.size,0); assert.equal(path.sounding.size,1);
  path.stop(); assert.equal(path.voices.size,0);
});

test('reading patterns require evidence and compare only matching single-note exercises',()=>{
  const settings={...defaults,low:48,high:84,size:1,key:'C',source:'random',endAction:'new'};
  const record=(pitch,ms,clean=true,overrides={})=>{const note={...spell(pitch),staff:'treble'}, config={...settings,...overrides}; return {version:1,at:'2026-10-16T12:00:00Z',responseMs:ms,wrongPresses:clean?0:1,firstAttemptCorrect:clean,notes:[note],context:{identity:exerciseIdentity([note],config,[])}};};
  const rows=[...Array.from({length:8},()=>record(60,100)),...Array.from({length:8},()=>record(62,200)),...Array.from({length:8},(_,i)=>record(64,1000,i>=3))];
  const original=JSON.stringify(rows), result=readingPatterns(rows);
  assert.equal(result.length,1); assert.equal(result[0].note,'E4'); assert.equal(result[0].count,8); assert.equal(result[0].corrected,3);
  assert.deepEqual(result[0].flags,['Repeated corrections','Slower responses']); assert.equal(result[0].baseline,200);
  assert.equal(result[0].context.key,'C'); assert.equal(JSON.stringify(rows),original);
  const sparse=Array.from({length:7},()=>record(65,5000,false)); assert.deepEqual(readingPatterns(sparse),[]);
  const otherKey=Array.from({length:24},()=>record(67,5000,true,{key:'G'}));
  assert.equal(readingPatterns([...rows,...sparse,...otherKey]).length,1,'another key or sparse exposure must not create a speed flag');
  const onlyCorrections=Array.from({length:8},()=>record(66,2000,false));
  assert.deepEqual(readingPatterns(onlyCorrections)[0].flags,['Repeated corrections']);
  const invalid=[{...rows[0],notes:[rows[0].notes[0],rows[0].notes[0]]},{...rows[0],context:{}},{...rows[0],context:{identity:'bad'}},{...rows[0],context:{identity:'[2,[]]'}},{...rows[0],context:{identity:'[1,[null]]'}}];
  assert.deepEqual(readingPatterns(invalid),[]);
  const duplicates=[...rows,...rows]; assert.equal(readingPatterns(duplicates)[0].count,16);
  assert.deepEqual(readingPatterns([]),[]);
});

test('live synth responds to velocity and retriggers a sustained pitch without inventing releases',()=>{
  const p=new Performance(), context=fakeAudio(), path=new SynthPath(context,context.destination);
  const sync=()=>path.sync(new Set([...p.held,...p.sustained]),p.attacks);
  p.midi('piano',[0x90,60,25]); sync(); const soft=path.voices.get(60), softPeak=context.events.find(event=>event[0]==='linear' && event[1]>0)[1];
  p.midi('piano',[0xb0,64,127]); p.midi('piano',[0x80,60,0]); sync(); assert.equal(path.voices.get(60),soft);
  p.midi('piano',[0x90,60,120]); sync(); const hard=path.voices.get(60); assert.notEqual(hard,soft);
  const peaks=context.events.filter(event=>event[0]==='linear' && event[1]>0).map(event=>event[1]); assert.ok(peaks.at(-1)>softPeak*4);
  assert.equal(match([spell(60)],p.held).complete,true);
  assert.equal(p.midi('piano',[0x90,60,80]),false,'duplicate held input keeps matching semantics'); sync(); assert.notEqual(path.voices.get(60),hard);
  const latest=path.voices.get(60); p.midi('piano',[0x80,60,0]); sync(); assert.equal(path.voices.get(60),latest);
  assert.equal(match([spell(60)],p.held).complete,false); p.midi('piano',[0xb0,64,0]); sync(); assert.equal(path.voices.size,0); assert.equal(p.attacks.size,0);
});
test('older held/sustained sources never reattack when a newer owner releases',()=>{
  const p=new Performance(), context=fakeAudio(), path=new SynthPath(context,context.destination);
  const sync=()=>path.sync(new Set([...p.held,...p.sustained]),p.attacks);
  p.noteOn('a',60,30); sync(); p.noteOn('b',60,110); sync(); const latest=path.voices.get(60);
  p.noteOff('b',60); sync(); assert.equal(path.voices.get(60),latest); assert.equal(p.attacks.get(60).velocity,30);
  p.noteOff('a',60); sync(); assert.equal(path.voices.size,0);
  p.noteOn('a',60,999); assert.equal(p.attacks.get(60).velocity,127); p.noteOn('a',60,'bad'); assert.equal(p.attacks.get(60).velocity,100);
  p.sustain('a',true); p.noteOff('a',60); assert.equal(p.attacks.size,1); p.clear(); assert.equal(p.attacks.size,0);
});

test('saved passages validate bounded metadata, update matching windows and retain file identity',()=>{
  const entry={version:1,hash:'a'.repeat(64),label:'Ending',filename:'study.mid',start:2,end:4,tracks:[{track:0,enabled:false,staff:'auto'},{track:1,enabled:true,staff:'treble'}],updatedAt:'2026-10-16T12:00:00Z'};
  assert.deepEqual(parsePassages(JSON.stringify([entry])),[entry]); assert.deepEqual(cleanPassages(null),[]);
  const invalid=[null,{...entry,version:2},{...entry,hash:'bad'},{...entry,label:''},{...entry,label:'x'.repeat(81)},{...entry,end:514},{...entry,start:0},{...entry,updatedAt:'bad'},{...entry,tracks:[]},{...entry,tracks:[entry.tracks[0]]},{...entry,tracks:[entry.tracks[1],entry.tracks[1]]},{...entry,tracks:[{track:64,enabled:true,staff:'treble'}]},{...entry,tracks:[{track:1,enabled:true,staff:'alto'}]}];
  assert.deepEqual(cleanPassages(invalid),[]);
  assert.throws(()=>parsePassages('x'.repeat(500001))); assert.throws(()=>parsePassages('{}')); assert.throws(()=>parsePassages('bad'));
  const first=savePassage([],entry), updated=savePassage(first,{...entry,label:'New name'});
  assert.equal(updated.length,1); assert.equal(updated[0].label,'New name'); assert.equal(first[0].label,'Ending');
  assert.equal(passageKey(entry),passageKey({...entry,tracks:[...entry.tracks].reverse()}));
  assert.notEqual(passageKey(entry),passageKey({...entry,hash:'b'.repeat(64)}));
  assert.equal(savePassage(first,{...entry,hash:'b'.repeat(64)}).length,2);
  assert.throws(()=>savePassage(first,{...entry,end:9999}));
  let many=[]; for(let start=1;start<=55;start++) many=savePassage(many,{...entry,start,end:start});
  assert.equal(many.length,50); assert.equal(many[0].start,6);
  const clean=cleanPassages([{...entry,extra:'ignore'}]); assert.equal(clean[0].extra,undefined); clean[0].tracks[0].staff='bass'; assert.equal(entry.tracks[0].staff,'auto');
});

test('keyboard geometry fits long instruments and preserves partial black endpoints',()=>{
  for(const [low,high] of [[60,60],[61,61],[61,63],[21,108],[0,127]]) {
    const geometry=keyboardGeometry(low,high); assert.equal(geometry.keys.length,high-low+1);
    for(const key of geometry.keys) assert.ok(key.left>=0 && key.left+(key.white ? 1 : 22/36)<=geometry.units+1e-9);
  }
  const piano=keyboardGeometry(21,108); assert.equal(piano.units,52);
  const auto=keyboardKeyWidth('auto',1040,piano.units); assert.equal(auto,19); assert.ok(auto*piano.units<=1040);
  assert.equal(keyboardKeyWidth('auto',200,52),16); assert.equal(keyboardKeyWidth('auto',200,52,true),28);
  assert.equal(keyboardKeyWidth('36',200,52),36); assert.equal(keyboardKeyWidth('28',200,52),28); assert.equal(keyboardKeyWidth('20',200,52),20);
  assert.equal(keyboardKeyWidth('bad',1040,22),36); assert.equal(keyboardKeyWidth('auto',1040,0),36);
  assert.equal(keyboardGeometry(-100,999).keys.length,128); assert.equal(keyboardGeometry(undefined,undefined).keys.length,1);
});

test('history clearing respects local midnight, elapsed-hour boundaries and older results',()=>{
  const now=new Date(2026,9,16,12,30), midnight=new Date(2026,9,16), hour=+now-3600000;
  const rows=[+midnight-1,+midnight,hour-1,hour,+now,+now+1].map(at=>({at:new Date(at).toISOString()}));
  assert.deepEqual(clearHistoryPeriod(rows,'hour',now),[rows[0],rows[1],rows[2],rows[5]]);
  assert.deepEqual(clearHistoryPeriod(rows,'today',now),[rows[0],rows[5]]);
  assert.deepEqual(clearHistoryPeriod(rows,'all',now),[]);
  assert.equal(rows.length,6);
  assert.throws(()=>clearHistoryPeriod(rows,'week',now));
  assert.throws(()=>clearHistoryPeriod(rows,'today',new Date(NaN)));
  assert.deepEqual(clearHistoryPeriod([{at:'invalid'}],'hour',now),[{at:'invalid'}]);
});

test('fluid progression allows legato overlap but demands fresh attacks and rejects extras',()=>{
  const p=new Performance(), gate=new FlowGate(), notes=(...pitches)=>pitches.map(midi=>({midi}));
  gate.start(notes(60,64),[],p.held,p.attacks);
  p.noteOn('m',60); assert.equal(gate.evaluate(p.held,p.attacks).ready,false);
  p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  gate.start(notes(64,67),notes(60,64),p.held,p.attacks);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false);
  p.noteOn('m',67); assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'shared pitches need their own fresh press');
  p.noteOff('m',64); p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  p.noteOff('m',60); p.noteOn('m',60); assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'a reattacked old pitch becomes an extra');
  p.noteOff('m',60); gate.start(notes(64,67),notes(64,67),p.held,p.attacks);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false);
  p.noteOff('m',64); p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'all repeated chord pitches need new attacks');
  p.noteOff('m',67); p.noteOn('m',67); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  gate.start(notes(64),notes(64,67),p.held,p.attacks);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'carried subset must not auto-skip');
  p.noteOff('m',64); p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  p.sustain('m',true); p.noteOff('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'pedal is not a held target');
  gate.start([],[],p.held,p.attacks); assert.equal(gate.evaluate(p.held,p.attacks).ready,false);
});

test('passage suggestions cover the source in bounded adjustable sections using MIDI evidence',()=>{
  const score={ticks_per_quarter:480,events:[{tick:0,message:{type:'time_signature',numerator:4,denominator:4}},{tick:4800,message:{type:'marker',text:'B'}}],notes:Array.from({length:24},(_,i)=>({midi:60,channel:0,start_tick:i*480,end_tick:i*480+480}))};
  const before=JSON.stringify(score), sections=suggestPassages(score,{maximum:16});
  assert.deepEqual(sections.map(section=>[section.start,section.end]),[[1,10],[11,24]]);
  assert.match(sections[0].reason,/MIDI marker/); assert.equal(JSON.stringify(score),before);
  const rest={...score,events:[],notes:score.notes.map((note,i)=>({...note,end_tick:i===7 ? note.start_tick+100 : note.end_tick}))};
  assert.equal(suggestPassages(rest,{maximum:16})[0].reason,'Rest gap');
  assert.equal(suggestPassages({...rest,notes:rest.notes.map((note,i)=>i===0 ? {...note,end_tick:null} : note)},{maximum:16})[0].reason,'Meter boundary');
  const changed={...score,events:[{tick:0,message:{type:'cue_point',text:'Intro'}},{tick:1920,message:{type:'time_signature',numerator:3,denominator:4}}]};
  assert.equal(suggestPassages(changed,{maximum:8})[0].end,7);
  assert.deepEqual(suggestPassages({notes:[]}),[]);
  assert.equal(suggestPassages({notes:[{start_tick:0,midi:60}]},{maximum:NaN,minimum:NaN})[0].end,1);
  const long={notes:Array.from({length:25000},(_,i)=>({start_tick:i,midi:60,end_tick:i+1}))};
  const bounded=suggestPassages(long); assert.ok(bounded.length<=128); assert.equal(bounded.at(-1).end,25000);
  assert.ok(bounded.every(section=>section.end-section.start<512));
  assert.equal(suggestPassages(score,{maximum:1,minimum:100}).length,24);
});

test('acoustic paths transpose nearby recordings, preserve velocity and do not retrigger an ended hold',()=>{
  const context=fakeAudio(), samples={ready:true,select:()=>({root:60,buffer:{sample:'C4'}})}, path=new SynthPath(context,context.destination,samples);
  path.configure('acoustic',.4); path.noteOn(62,1,null,62,.2);
  const voice=path.voices.get(62); assert.equal(voice.oscillators.length,1);
  assert.equal(voice.oscillators[0].buffer.sample,'C4');
  assert.ok(Math.abs(voice.oscillators[0].playbackRate.value-2**(2/12))<1e-10);
  voice.oscillators[0].onended(); assert.equal(path.sounding.size,0);
  path.sync([62]); assert.equal(context.nodes.length,1,'a naturally ended held key must stay silent');
  path.noteOff(62); assert.equal(path.voices.size,0);
  path.noteOn(60,1,.8); const timed=path.voices.get(60); timed.oscillators[0].onended(); assert.equal(path.voices.size,0);
  samples.ready=false; path.sync([60]); assert.equal(path.voices.size,0);
  const noBank=new SynthPath(context,context.destination); noBank.configure('acoustic',.2); noBank.noteOn(60); assert.equal(noBank.voices.size,0);
  assert.equal(nearestSample(new Map(),60),null);
  const buffers=new Map([[60,'C'],[63,'Ds']]); assert.equal(nearestSample(buffers,62).buffer,'Ds'); assert.equal(nearestSample(buffers,59).root,60);
});

test('acoustic sample loading is shared, local, atomic and retryable',async()=>{
  const urls=[], context={decodeAudioData:async data=>({decoded:data})};
  const manifest={version:1,samples:[{pitch:60,file:'C4.mp3'},{pitch:63,file:'Ds4.mp3'}]};
  const fetcher=async url=>{urls.push(url); return {ok:true,json:async()=>manifest,arrayBuffer:async()=>url};};
  const bank=new AcousticSamples(context,fetcher);
  await Promise.all([bank.load(),bank.load()]); await bank.load();
  assert.equal(urls.length,3); assert.ok(urls.every(url=>url.startsWith('/static/audio/salamander/')));
  assert.equal(bank.ready,true); assert.equal(bank.select(62).root,63);
  const originalFetch=globalThis.fetch;
  try {globalThis.fetch=function(url){assert.equal(this,globalThis); return fetcher(url);}; await new AcousticSamples(context).load();} finally {globalThis.fetch=originalFetch;}
  const bad=new AcousticSamples(context,async()=>({ok:false})); await assert.rejects(bad.load(),/manifest unavailable/); assert.equal(bad.pending,null);
  bad.fetcher=fetcher; await bad.load(); assert.equal(bad.ready,true);
  const invalid=new AcousticSamples(context,async()=>({ok:true,json:async()=>({version:2})})); await assert.rejects(invalid.load(),/Invalid/);
  const missing=new AcousticSamples(context,async url=>url.endsWith('.json') ? {ok:true,json:async()=>manifest} : {ok:false}); await assert.rejects(missing.load(),/sample unavailable/); assert.equal(missing.buffers.size,0);
  const failure=new AcousticSamples({decodeAudioData:async()=>{throw new Error('decode failed');}},fetcher); await assert.rejects(failure.load(),/decode failed/); assert.equal(failure.ready,false);
});

test('source metronome follows tempo, meter and speed, with phase-preserving count-in pulses',()=>{
  const score=playbackFixture(), original=JSON.stringify(score), plan=referencePlan(score);
  const beatPlan=sourceBeats(score,plan,1,1);
  assert.equal(beatPlan.leadIn,2);
  assert.deepEqual(beatPlan.beats.map(beat=>[beat.start,beat.beat]),[[-2,0],[-1.5,1],[-1,2],[-.5,3],[0,0],[.5,1]]);
  const slow=sourceBeats(score,plan,.5,0); assert.deepEqual(slow.beats.map(beat=>beat.start),[0,1]);
  const meter={...score,events:[...score.events,{tick:480,message:{type:'time_signature',numerator:3,denominator:8}}]};
  assert.deepEqual(sourceBeats(meter,plan).beats.map(beat=>[beat.start,beat.beat]),[[0,0],[.5,0],[.8,1]]);
  const offset=sourceBeats(score,{sourceStart:240,sourceEnd:960},1,1);
  assert.deepEqual(offset.beats.slice(0,4).map(beat=>beat.start),[-1.75,-1.25,-.75,-.25]);
  assert.equal(JSON.stringify(score),original);
  assert.deepEqual(sourceBeats(score,{notes:[],duration:0}),{beats:[],leadIn:0});
  assert.throws(()=>sourceBeats(score,{sourceStart:0,sourceEnd:10_000_000}),/8,192/);
  assert.equal(sourceBeats(score,plan,999,999).leadIn,2);
});

test('source beat scheduling never bursts stale clicks and resumes without a second count-in',()=>{
  const cursor=new BeatCursor(), emitted=[];
  cursor.pump(0,beat=>emitted.push(beat)); assert.equal(emitted.length,0);
  const beats=[{start:-1,beat:0},{start:0,beat:0},{start:.5,beat:1},{start:1,beat:2}];
  cursor.start(beats,1.03); cursor.pump(0,beat=>emitted.push(beat)); assert.ok(Math.abs(emitted[0].time-.03)<1e-9);
  cursor.pump(1.7,beat=>emitted.push(beat)); assert.equal(emitted.length,1,'stale clicks are skipped');
  cursor.pump(2,beat=>emitted.push(beat)); assert.equal(emitted.length,2); assert.equal(emitted[1].beat,2);
  cursor.start(beats,4.53,.5); cursor.pump(5,beat=>emitted.push(beat)); assert.equal(emitted.at(-1).beat,1);
});

test('diatonic sevenths cover every key and preserve voicing bounds and written spellings',()=>{
  assert.deepEqual(harmonicPitchClasses('C',false,0,true),[0,4,7,11]);
  assert.deepEqual(harmonicPitchClasses('C',false,4,true),[7,11,2,5]);
  assert.deepEqual(harmonicPitchClasses('C',true,1,true),[11,2,5,9]);
  for(const {id:key} of KEYS) for(const minor of [false,true]) for(let degree=0;degree<7;degree++) {
    const settings={...defaults,key,source:'triads','harmony-kind':'sevenths','harmony-scale':minor?'minor':'major',span:'full',low:48,high:96,size:4,'min-size':4,length:1,'hand-span':12};
    const chord=makePracticePhrase(settings,()=>degree/7+.0001)[0];
    assert.equal(chord.length,4);
    assert.deepEqual([...new Set(chord.map(note=>note.midi%12))].sort((a,b)=>a-b),harmonicPitchClasses(key,minor,degree,true).sort((a,b)=>a-b));
    assert.ok(chord.at(-1).midi-chord[0].midi<=12);
    assert.equal(new Set(chord.map(staffStep)).size,4);
  }
});

test('cadence choices preserve sequence phase and comparable practice identities',()=>{
  const settings={...defaults,source:'cadence',key:'C',span:'wide',low:60,high:84,size:4,'min-size':4,'harmony-kind':'sevenths',length:3,'cadence-shape':'ii-v-i','hand-span':12};
  const pcs=phrase=>phrase.map(chord=>[...new Set(chord.map(note=>note.midi%12))].sort((a,b)=>a-b));
  assert.deepEqual(pcs(makePracticePhrase(settings,()=>.2)),[[0,2,5,9],[2,5,7,11],[0,4,7,11]]);
  assert.deepEqual(pcs(makePracticePhrase({...settings,sequenceOffset:2,length:2},()=>.2)),[[0,4,7,11],[0,2,5,9]]);
  assert.deepEqual(pcs(makePracticePhrase({...settings,'cadence-shape':'turnaround',length:4},()=>.2)),[[0,4,7,11],[0,4,7,9],[0,2,5,9],[2,5,7,11]]);
  const note={...spell(60),staff:'treble'};
  const id=exerciseIdentity([note],settings,[[note]]);
  assert.notEqual(id,exerciseIdentity([note],{...settings,'harmony-kind':'triads'},[[note]]));
  assert.notEqual(id,exerciseIdentity([note],{...settings,'cadence-shape':'authentic'},[[note]]));
  assert.equal(exerciseIdentity([note],{...settings,source:'random'},[]),exerciseIdentity([note],{...settings,source:'random','harmony-kind':'triads','cadence-shape':'authentic'},[]));
});

test('cadence labels distinguish minor diminished triads from half-diminished sevenths',()=>{
  assert.deepEqual(cadenceLabels(),['I–IV–V–I','ii–V–I','I–vi–ii–V']);
  assert.equal(cadenceLabels(true)[1],'ii°–v–i');
  assert.equal(cadenceLabels(true,true)[1],'iiø7–v7–i7');
  assert.equal(cadenceLabels(false,true)[1],'ii7–V7–Imaj7');
});

test('daily graph spacing uses elapsed UTC dates and centres a single measurement',()=>{
  const days=[{day:'2026-09-30',median:200},{day:'2026-10-01',median:100},{day:'2026-10-10',median:0}], before=JSON.stringify(days);
  assert.deepEqual(dailyPlot(days).map(day=>[day.x,day.y]),[[30,20],[88,65],[610,110]]);
  assert.equal(JSON.stringify(days),before);
  assert.equal(dailyPlot([days[0]])[0].x,320);
  assert.deepEqual(dailyPlot([]),[]);
  assert.equal(dailyPlot([{day:'2026-10-01',median:0}])[0].y,110);
});

test('MIDI outlines demand every source attack even when only part of a chord repeats',()=>{
  const p=new Performance(), gate=new FlowGate();
  const notes=(tick,...pitches)=>pitches.map(midi=>({midi,sourceTick:tick,sourceIds:[`${tick}:${midi}`]}));
  const first=notes(0,60,64), second=notes(480,64,67), third=notes(960,64,69);
  gate.start(first,[],p.held,p.attacks); p.noteOn('m',60); p.noteOn('m',64);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  gate.start(second,first,p.held,p.attacks); p.noteOff('m',60); p.noteOn('m',67);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'a new G must not substitute for the repeated E attack');
  p.sustain('m',true); p.noteOff('m',64);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'pedal does not substitute for a fresh physical press');
  p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  gate.start(third,second,p.held,p.attacks); p.noteOff('m',67); p.noteOn('m',69);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'each later occurrence has its own attack baseline');
  p.noteOff('m',64); p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  gate.start(third,third,p.held,p.attacks);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'loop entry never consumes the previous articulation');
});

test('library facets and intersecting filters preserve catalogue data and keep unrated pieces visible',()=>{
  const pieces=[{id:'b',composer:'Bach',era:'Baroque',style:'Prelude',difficulty:'Intermediate',title:'Prelude'},
    {id:'c',composer:'Chopin',era:'Romantic',style:'Etude',difficulty:'Advanced',title:'Study'},
    {id:'a',composer:'Bach',era:'Baroque',style:'Minuet',title:'Dance'}];
  const before=JSON.stringify(pieces);
  assert.deepEqual(libraryFacets(pieces,'composer'),['Bach','Chopin']);
  assert.deepEqual(libraryFacets(pieces,'difficulty'),['Advanced','Intermediate','Unrated']);
  assert.deepEqual(filterLibrary(pieces,{composer:'Bach',era:'Baroque'}).map(p=>p.id),['a','b']);
  assert.deepEqual(filterLibrary(pieces,{composer:'Bach',difficulty:'Advanced'}),[]);
  assert.deepEqual(filterLibrary(pieces,{difficulty:'Unrated'}).map(p=>p.id),['a']);
  assert.deepEqual(filterLibrary(pieces,{style:'Etude'}).map(p=>p.id),['c']);
  assert.equal(filterLibrary(pieces).length,3); assert.equal(libraryValue({style:'  '},'style'),'Unrated');
  assert.equal(libraryValue(null,'era'),'Unrated'); assert.equal(JSON.stringify(pieces),before);
});

test('exercise descriptions show active filters and omit disabled settings or preview metadata',()=>{
  const base={...defaults,key:'C',source:'random',size:3,'min-size':1,endAction:'repeat'};
  const random=describeExercise(base,{filename:'Unstarted preview.mid'});
  assert.equal(random.title,'Random pitches');
  for(const text of ['C major / A minor','Right hand','Near middle C','Keyboard C3–C6','1–3 notes/chord','Notes in key','Repeat']) assert.ok(random.description.includes(text),text);
  assert.ok(!random.description.includes('Unstarted preview'));
  const piece={filename:'Active piece.mid',bounds:{start:9,end:11,tracks:[{enabled:true},{enabled:false}]}};
  const imported=describeExercise({...base,source:'midi','min-size':9,material:'flats',hand:'left',endAction:'new'},piece);
  assert.equal(imported.title,'Local MIDI outline');
  for(const text of ['Active piece.mid','Source attacks 9–11','1 selected track','Left hand','Up to 3 notes/chord','Chromatic, prefer flats','Continue through piece']) assert.ok(imported.description.includes(text),text);
  assert.ok(!imported.description.includes('9–3 notes'));
  const continuous=describeExercise({...base,source:'random',size:1,endAction:'new',span:'full',hand:'both'});
  assert.match(continuous.description,/Single notes/); assert.match(continuous.description,/Both hands/); assert.match(continuous.description,/Continuous/);
  const cadence=describeExercise({...base,source:'cadence',key:'G','harmony-scale':'minor','harmony-kind':'sevenths','cadence-shape':'ii-v-i','hand-span':'16'});
  assert.equal(cadence.title,'Cadence');
  for(const text of ['E natural minor','Diatonic sevenths','iiø7–v7–i7','Hand span: tenth']) assert.ok(cadence.description.includes(text),text);
  assert.ok(!cadence.description.includes('Notes in key'));
  assert.equal(describeExercise({...base,source:'triads','hand-span':'24'}).title,'Diatonic chords');
  assert.match(describeExercise({...base,source:'triads'}).description,/Triads/);
  assert.match(describeExercise({...base,size:3,'min-size':3,material:'sharps',span:'wide'}).description,/3 notes\/chord/);
  assert.match(describeExercise({...base,source:'midi'},null).description,/Up to 3/);
  assert.match(describeExercise({...base,key:'unknown',size:NaN,'min-size':NaN}).description,/C major/);
});

test('written-note credit resets for every repeated source column, including loop and partial chords',()=>{
  const p=new Performance(), gate=new FlowGate();
  const notes=(...pitches)=>pitches.map(midi=>({midi,sourceIds:[String(midi)]}));
  const first=notes(60,64), second=notes(64,67);
  gate.start(first,[],p.held,p.attacks);
  p.noteOn('m',60); assert.deepEqual([...gate.evaluate(p.held,p.attacks).accepted],[60]);
  p.noteOn('m',64); assert.equal(gate.evaluate(p.held,p.attacks).ready,true);
  gate.start(second,first,p.held,p.attacks);
  assert.deepEqual([...gate.evaluate(p.held,p.attacks).accepted],[],'a carried E must not receive the next column tick');
  p.noteOn('m',67); assert.deepEqual([...gate.evaluate(p.held,p.attacks).accepted],[67]);
  p.noteOff('m',64); p.noteOn('m',64);
  assert.deepEqual([...gate.evaluate(p.held,p.attacks).accepted],[64,67]);
  gate.start(second,second,p.held,p.attacks);
  assert.deepEqual([...gate.evaluate(p.held,p.attacks).accepted],[],'repeat loops do not carry visual credit');
  gate.start([{midi:64},{midi:69}],[{midi:64},{midi:67}],p.held,p.attacks);
  assert.deepEqual([...gate.evaluate(p.held,p.attacks).accepted],[],'generated changing chords also require fresh presses');
});

test('live instrument audition uses the selected sound and gain without changing held or target voices',()=>{
  const context=fakeAudio(), audio=new LocalAudio(context);
  audio.live.configure('organ',.73); audio.reference.configure('piano',.17);
  audio.live.sync([48]); const held=audio.live.voices.get(48);
  audio.audition([60,64,67],'live');
  assert.equal(audio.livePreview.instrument,'organ'); assert.equal(audio.livePreview.volume,.73);
  assert.equal(audio.livePreview.voices.size,3); assert.equal(audio.live.voices.get(48),held);
  assert.equal(audio.reference.voices.size,0);
  audio.live.sync([48]); assert.equal(audio.livePreview.voices.size,3,'physical sync must not cancel the preview');
  audio.audition([72],'reference'); assert.equal(audio.livePreview.voices.size,3);
  assert.equal(audio.reference.instrument,'piano'); assert.equal(audio.reference.volume,.17);
  assert.equal(audio.reference.voices.size,1);
  const previous=[...audio.livePreview.voices.values()];
  audio.live.configure('piano',.31); audio.audition([60],'live');
  assert.equal(audio.livePreview.instrument,'piano'); assert.equal(audio.livePreview.volume,.31);
  assert.equal(audio.livePreview.voices.size,1); assert.ok(previous.every(voice=>voice.released));
  audio.panic(); assert.equal(audio.livePreview.voices.size,0); assert.equal(audio.reference.voices.size,0);
  for(const node of context.nodes) node.onended();
  assert.equal(audio.livePreview.sounding.size,0);
});

test('duplicate note-ons and another still-held source cannot substitute for a physical re-press',()=>{
  const p=new Performance(), gate=new FlowGate(), target=[{midi:60}];
  p.noteOn('a',60); const first=p.attacks.get(60);
  gate.start(target,target,p.held,p.attacks);
  p.noteOn('a',60,120);
  assert.ok(p.attacks.get(60).serial>first.serial,'audio retains repeated note-on velocity updates');
  assert.equal(p.attacks.get(60).pressSerial,first.pressSerial);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false);
  p.noteOn('b',60); p.noteOff('a',60); p.noteOn('a',60);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,false,'a second owner still physically holds the pitch');
  p.sustain('a',true); p.noteOff('a',60); p.noteOff('b',60); p.noteOn('a',60);
  assert.equal(gate.evaluate(p.held,p.attacks).ready,true,'pedal may stay down across a physical re-press');
});

const authoredStudy=()=>JSON.parse(readFileSync(new URL('../static/studies/independent-voices.json',import.meta.url),'utf8'));
test('score beats remain exact across dots, tuplets, comparisons and invalid arithmetic',()=>{
  assert.deepEqual(beat([6,9]),[2,3]); assert.deepEqual(beat([0,8]),[0,1]);
  assert.deepEqual(addBeat([1,3],[2,3]),[1,1]); assert.deepEqual(multiplyBeat([3,4],[2,3]),[1,2]);
  assert.deepEqual(addBeat([-1,2],[1,3]),[-1,6]);
  assert.equal(compareBeat([1,3],[2,6]),0); assert.equal(compareBeat([1,3],[1,2]),-1); assert.equal(compareBeat([1,1],[1,2]),1);
  for(const value of [null,[1,0],[1,-2],[1.2,2],['1',2],[1],[Infinity,2]]) assert.throws(()=>beat(value));
  assert.throws(()=>addBeat([Number.MAX_SAFE_INTEGER,1],[1,1]),/exact integer/);
});
test('authored score keeps independent voices, exact rhythms and explicit tie attacks immutable',()=>{
  const input=authoredStudy(), before=JSON.stringify(input), score=compileScore(input);
  assert.equal(JSON.stringify(input),before); assert.deepEqual(score.duration,[8,1]);
  assert.equal(score.events.length,18); assert.equal(score.notes.length,17); assert.equal(score.sounds.length,16);
  assert.deepEqual(score.events.find(event=>event.id==='m1-melody-3').duration,[3,4]);
  assert.deepEqual(score.events.find(event=>event.id==='m1-triplet-2').start,[10,3]);
  const tie=score.sounds.find(note=>note.id==='m1-inner-2-note');
  assert.deepEqual(tie.segments,['m1-inner-2-note','m2-inner-1-note']); assert.deepEqual(tie.start,[2,1]); assert.deepEqual(tie.end,[6,1]);
  const bar=score.moments.find(moment=>compareBeat(moment.at,[4,1])===0);
  assert.deepEqual(bar.continuing,['m1-inner-2-note']); assert.ok(!bar.attacks.includes('m2-inner-1-note'));
  assert.ok(bar.attacks.includes('m2-melody-1-note')); assert.ok(bar.releases.includes('m1-bass-1-note'));
  assert.ok(score.moments.find(moment=>compareBeat(moment.at,[5,1])===0).attacks.includes('m2-melody-2-note'),'a repeated E is a new event, not a tie');
  assert.deepEqual(score.moments.find(moment=>compareBeat(moment.at,[6,1])===0).rests,['m2-melody-3']);
  assert.deepEqual(score.moments.at(-1).continuing,[]); assert.equal(score.moments.at(-1).releases.length,3);
  assert.equal(Object.isFrozen(score.source.measures[0].events[0].notes[0]),true);
  assert.throws(()=>{score.notes[0].midi=1;},TypeError); assert.throws(()=>score.moments[0].attacks.push('fake'),TypeError);
});
test('authored pickups, changing meter/key, enharmonic octaves and cross-staff voices remain explicit',()=>{
  const source=authoredStudy();
  source.measures[0].events[0].staff='lower';
  delete source.voices[0].hand;
  let score=compileScore(source); assert.equal(score.notes[0].staffId,'lower'); assert.equal(score.voices[0].hand,undefined);
  const single={version:1,id:'pickup-score',title:'Pickup',staves:[{id:'staff',clef:'treble'}],voices:[{id:'voice',staff:'staff'}],measures:[
    {id:'pickup',length:[1,1],events:[{id:'pickup-event',voice:'voice',kind:'note',at:[0,1],value:'q',notes:[{id:'bsharp',letter:'B',accidental:1,octave:3}]}]},
    {id:'three-four',meter:[3,4],key:'Gb',events:[{id:'bar-event',voice:'voice',kind:'note',at:[0,1],value:'h',dots:1,notes:[{id:'cflat',letter:'C',accidental:-1,octave:4}]}]}
  ]};
  score=compileScore(single);
  assert.deepEqual(score.duration,[4,1]); assert.equal(score.notes[0].midi,60); assert.equal(score.notes[0].octave,3);
  assert.equal(score.notes[1].midi,59); assert.equal(score.measures[1].key,'Gb'); assert.deepEqual(score.tempos,[{at:[0,1],bpm:120}]);
  single.measures[1].events[0].value='q'; single.measures[1].events[0].dots=2; single.measures[1].length=[7,4];
  assert.deepEqual(compileScore(single).events[1].duration,[7,4]);
});
test('authored score rejects gaps, overlaps, malformed pitches, tuplets and unsafe ties',()=>{
  const variants=[
    source=>{source.version=2;}, source=>{source.title='';}, source=>{source.staves[0].clef='unknown';},
    source=>{source.voices[0].staff='absent';}, source=>{source.voices[0].hand='detected';}, source=>{source.voices[0].stem='sideways';},
    source=>{source.measures[0].meter=[4,3];}, source=>{source.measures[0].key='H';}, source=>{source.measures[0].length=[0,1];},
    source=>{source.measures[0].events[0].at=[1,2];}, source=>{source.measures[0].events[0].at=[-1,1];},
    source=>{source.measures[0].events[0].voice='missing';}, source=>{source.measures[0].events[0].kind='unknown';},
    source=>{source.measures[0].events[0].id=source.id;}, source=>{source.measures[0].events[0].value='128';},
    source=>{source.measures[0].events[0].dots=3;}, source=>{source.measures[0].events[0].notes=[];},
    source=>{source.measures[0].events[0].notes[0].letter='H';}, source=>{source.measures[0].events[0].notes[0].octave=20;},
    source=>{source.measures[0].events[0].notes[0].midi=1;}, source=>{source.measures[0].events[0].notes[0].staff='lower';},
    source=>{source.measures[0].events[0].notes.push({...source.measures[0].events[0].notes[0],id:'duplicate-pitch'});},
    source=>{source.measures[0].events[6].tuplet.group='incomplete-tuplet';}, source=>{source.measures[0].events[4].tuplet.actual=0;},
    source=>{source.measures[1].events[2].notes=[{id:'rest-pitch',letter:'C',accidental:0,octave:4}];},
    source=>{source.ties.push({...source.ties[0]});}, source=>{source.ties[0].to='missing';}, source=>{source.ties[0].to='m2-melody-1-note';},
    source=>{source.tempos[0].at=[1,1];}, source=>{source.tempos[1].bpm=0;}, source=>{source.tempos[1].at=[0,1];}
  ];
  variants.forEach((change,index)=>{const source=authoredStudy(); change(source); assert.throws(()=>compileScore(source),undefined,`malformed fixture ${index}`);});
  assert.throws(()=>compileScore(null));
});
test('unisons in different authored voices stay independent rather than losing event identity',()=>{
  const source=authoredStudy(), bass=source.measures[0].events.find(event=>event.voice==='bass');
  Object.assign(bass.notes[0],{letter:'E',octave:4}); const score=compileScore(source);
  assert.equal(score.sounds.filter(note=>note.midi===64 && compareBeat(note.start,[0,1])===0).length,2);
  assert.ok(score.moments[0].attacks.includes('m1-inner-1-note')); assert.ok(score.moments[0].attacks.includes('m1-bass-1-note'));
});

test('authored playback respects tempo changes, exact tuplets and tie chains without extra attacks',()=>{
  const score=compileScore(authoredStudy()), before=JSON.stringify(score), plan=authoredPlan(score);
  const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} differs from ${b}`);
  close(scoreSecondsAt(score,[4,1]),20/7); close(plan.duration,75/14);
  assert.equal(plan.notes.length,16);
  const tie=plan.notes.find(note=>note.id==='m1-inner-2-note');
  assert.deepEqual(tie.sourceIds,['m1-inner-2-note','m2-inner-1-note']); close(tie.start,10/7); close(tie.end,20/7+1.25);
  assert.ok(!plan.notes.some(note=>note.id==='m2-inner-1-note'));
  const repeats=plan.notes.filter(note=>note.id.startsWith('m2-melody-') && note.pitch===76);
  assert.equal(repeats.length,2); close(repeats[1].start-repeats[0].start,.625);
  const triplets=plan.notes.filter(note=>note.id.startsWith('m1-triplet'));
  for(const note of triplets) close(note.end-note.start,5/21);
  assert.equal(plan.moments.length,score.moments.length); close(plan.moments[7].time,20/7);
  assert.equal(JSON.stringify(score),before);
});
test('authored playback clips tied holds at boundaries, filters voices and scales only audio time',()=>{
  const score=compileScore(authoredStudy()), original=authoredPlan(score), fast=authoredPlan(score,{speed:2});
  assert.equal(fast.duration,original.duration/2);
  assert.deepEqual(fast.notes.map(note=>note.sourceIds),original.notes.map(note=>note.sourceIds));
  const cut=authoredPlan(score,{start:[4,1],end:[6,1],voices:['inner']});
  assert.equal(cut.notes.length,1); assert.equal(cut.notes[0].start,0); assert.ok(Math.abs(cut.notes[0].end-1.25)<1e-10); assert.ok(Math.abs(cut.duration-1.25)<1e-10);
  assert.deepEqual(cut.notes[0].sourceIds,['m1-inner-2-note','m2-inner-1-note']);
  assert.equal(authoredPlan(score,{voices:[]}).notes.length,0);
  assert.equal(authoredPlan(score,{speed:NaN}).duration,original.duration);
  for(const options of [{start:[-1,1]},{end:[9,1]},{start:[4,1],end:[4,1]}]) assert.throws(()=>authoredPlan(score,options));
  assert.throws(()=>scoreSecondsAt(score,[-1,1])); assert.throws(()=>scoreSecondsAt(score,[9,1]));
  const dense={...score,sounds:Array.from({length:129},(_,i)=>({...score.sounds[0],id:'dense-'+i}))};
  assert.throws(()=>authoredPlan(dense),/128 simultaneous/);
});
test('audio-clock cursor chases an authored tie once on resume and skips elapsed score attacks',()=>{
  const score=compileScore(authoredStudy()), plan=authoredPlan(score), cursor=new PlaybackCursor(), notes=[];
  const position=scoreSecondsAt(score,[4,1]); cursor.play(plan,10,position);
  cursor.pump(10,note=>notes.push(note));
  assert.equal(notes.filter(note=>note.id==='m1-inner-2-note').length,1);
  assert.ok(!notes.some(note=>note.id==='m2-inner-1-note'));
  assert.ok(!notes.some(note=>note.id==='m1-melody-1-note'));
  assert.equal(notes.filter(note=>note.pitch===76).length,1);
  assert.ok(notes.every(note=>note.duration>0 && note.time>=10));
  cursor.pause(10.1); const saved=cursor.position; cursor.play(plan,20,saved);
  const resumed=[]; cursor.pump(20,note=>resumed.push(note));
  assert.equal(resumed.filter(note=>note.id==='m1-inner-2-note').length,1);
});

test('random library selection respects all filters and avoids the current choice when alternatives exist',()=>{
  const pieces=[{id:'a',composer:'Bach',era:'Baroque',style:'Prelude',difficulty:'Unrated',title:'A'},
    {id:'b',composer:'Bach',era:'Baroque',style:'Prelude',difficulty:'Unrated',title:'B'},
    {id:'c',composer:'Chopin',era:'Romantic',style:'Prelude',difficulty:'Unrated',title:'C'}];
  assert.equal(randomLibraryPiece(pieces,{composer:'Bach'},'a',()=>.8).id,'b');
  assert.equal(randomLibraryPiece(pieces,{era:'Romantic',style:'Prelude',difficulty:'Unrated'},'c',()=>0).id,'c');
  assert.equal(randomLibraryPiece(pieces,{composer:'Missing'},'',()=>0),null);
  assert.equal(randomLibraryPiece([],{},'',()=>0),null);
  assert.equal(randomLibraryPiece(pieces,{},'',()=>0).id,'a'); assert.equal(randomLibraryPiece(pieces,{},'',()=>.999).id,'c');
  assert.equal(randomLibraryPiece(pieces,{},'',()=>1).id,'c'); assert.equal(randomLibraryPiece(pieces,{},'',()=>-1).id,'a');
  assert.equal(randomLibraryPiece(pieces,{},'',()=>NaN).id,'a');
  assert.equal(randomLibraryPiece(pieces,{},'',()=>.42).id,randomLibraryPiece(pieces,{},'',()=>.42).id,'injected randomness is reproducible');
});


test('library search matches accents, opus spacing and accidentals within selected facets',()=>{
  const pieces=[{id:'chopin-op28-7',composer:'Frédéric Chopin',title:'Prelude in A major, Op. 28 No. 7',era:'Romantic',style:'Prelude'},
    {id:'rachmaninoff-op3-2',composer:'Sergei Rachmaninoff',title:'Prelude in C-sharp minor, Op. 3 No. 2',era:'Romantic',style:'Prelude'},
    {id:'bach-bwv846',composer:'Johann Sebastian Bach',title:'Prelude in C major, BWV 846',era:'Baroque',style:'Prelude'}];
  const before=JSON.stringify(pieces);
  for(const query of ['frederic CHOPIN','op28 7','Frédéric 28','chopin-op28-7'])
    assert.deepEqual(filterLibrary(pieces,{query}).map(piece=>piece.id),['chopin-op28-7']);
  for(const query of ['c# minor','C♯ minor','RACHMANINOFF Op3'])
    assert.deepEqual(filterLibrary(pieces,{query}).map(piece=>piece.id),['rachmaninoff-op3-2']);
  assert.deepEqual(filterLibrary(pieces,{query:'bwv846'}).map(piece=>piece.id),['bach-bwv846']);
  assert.equal(filterLibrary(pieces,{query:'prelude',era:'Romantic'}).length,2);
  assert.equal(filterLibrary(pieces,{query:'Chopin',era:'Baroque'}).length,0);
  assert.equal(filterLibrary(pieces,{query:'  ...  '}).length,3);
  assert.equal(filterLibrary(pieces,{query:42}).length,3);
  assert.equal(filterLibrary(pieces,{query:'x'.repeat(200000)}).length,0);
  assert.equal(randomLibraryPiece(pieces,{query:'op3'},'',()=>0).id,'rachmaninoff-op3-2');
  assert.equal(randomLibraryPiece(pieces,{query:'no such piece'},'',()=>0),null);
  assert.equal(JSON.stringify(pieces),before);
});


test('recent library identities are bounded, ordered, portable and tied to reviewed checksums',()=>{
  const a={id:'bach-bwv846',sha256:'a'.repeat(64),title:'Prelude'}, b={id:'chopin-op28-7',sha256:'b'.repeat(64),title:'Prelude'};
  let recent=rememberLibraryPiece([],a); recent=rememberLibraryPiece(recent,b);
  assert.deepEqual(recent.map(piece=>piece.id),[b.id,a.id]);
  recent=rememberLibraryPiece(recent,a);
  assert.deepEqual(recent,[{id:a.id,sha256:a.sha256},{id:b.id,sha256:b.sha256}]);
  const text=JSON.stringify({version:1,pieces:recent}); assert.deepEqual(parseRecentLibrary(text),recent);
  assert.deepEqual(recentLibraryPieces([b,a],recent),[a,b]);
  assert.deepEqual(recentLibraryPieces([{...a,sha256:'c'.repeat(64)}],recent),[],'changed editions cannot silently reuse a saved identity');
  assert.deepEqual(recentLibraryPieces([],recent),[]);
  const old=recent; recent=rememberLibraryPiece(recent,{...a,sha256:'c'.repeat(64)});
  assert.equal(recent[0].sha256,'c'.repeat(64)); assert.equal(old[0].sha256,a.sha256);
  for(let i=0;i<25;i++) recent=rememberLibraryPiece(recent,{id:'piece-'+i,sha256:'d'.repeat(64)});
  assert.equal(recent.length,20); assert.equal(recent[0].id,'piece-24'); assert.equal(recent.at(-1).id,'piece-5');
  assert.deepEqual(rememberLibraryPiece(null,a),[{id:a.id,sha256:a.sha256}]);
  const bad=[null,{}, {...a,id:'../outside'}, {...a,id:'x'.repeat(81)}, {...a,sha256:'wrong'}, {...a,id:42}];
  assert.deepEqual(parseRecentLibrary(JSON.stringify({version:1,pieces:[...bad,a,a,b]})),[{id:a.id,sha256:a.sha256},{id:b.id,sha256:b.sha256}]);
  assert.deepEqual(parseRecentLibrary(JSON.stringify({version:1,pieces:[{...a,path:'private.mid',data:'music'}]})),[{id:a.id,sha256:a.sha256}]);
  for(const text of ['oops','null','[]','{}','{"version":2,"pieces":[]}', 'x'.repeat(5001),null]) assert.throws(()=>parseRecentLibrary(text));
  for(const entry of bad) assert.throws(()=>rememberLibraryPiece([],entry));
});

test('score key selection trusts passage markers, reports modulations and ignores duplicate staff events',()=>{
  const notes=[...Array(8)].flatMap((_,cycle)=>[60,62,64,65,67,69,71].map((midi,index)=>({midi,start_tick:cycle*2800+index*100,end_tick:cycle*2800+index*100+80,channel:0})));
  const score={ticks_per_quarter:100,notes,events:[
    {tick:0,track:1,message:{type:'key_signature',key:'A'}},{tick:0,track:2,message:{type:'key_signature',key:'A'}},
    {tick:2800,track:1,message:{type:'key_signature',key:'Fm'}},{tick:2800,track:2,message:{type:'key_signature',key:'Fm'}},
    {tick:5600,track:1,message:{type:'key_signature',key:'Db'}}]};
  const opening=scoreKeyForPassage(score,{startTick:0,endTick:5500});
  assert.equal(opening.keyId,'A'); assert.equal(opening.source,'midi'); assert.equal(opening.label,'A major');
  assert.equal(opening.changes.length,1); assert.equal(opening.changes[0].keys[0],'Fm');
  const later=scoreKeyForPassage(score,{startTick:3000,endTick:8000});
  assert.equal(later.keyId,'Ab'); assert.equal(later.label,'F minor'); assert.equal(later.changes.length,1); assert.equal(later.changes[0].keys[0],'Db');
  assert.equal(scoreKeyForPassage(score,{startTick:6000,endTick:8000}).keyId,'Db');
  assert.equal(scoreKeyForPassage(score,{startTick:10000,endTick:12000}).keyId,'Db');
});

test('score key is estimated only from strong whole-piece pitch evidence when metadata is absent',()=>{
  const bach=JSON.parse(readFileSync('tests/fixtures/piano-library/bach-bwv846.json','utf8'));
  const estimate=scoreKeyForPassage(bach);
  assert.equal(estimate.keyId,'C'); assert.equal(estimate.mode,'major'); assert.equal(estimate.source,'estimated');
  const conflicting={...bach,events:[...bach.events,{tick:0,track:50,message:{type:'key_signature',key:'G'}}]};
  assert.equal(scoreKeyForPassage(conflicting).keyId,'G','explicit score metadata outranks a statistical estimate');
  const notes=[...Array(2)].flatMap(()=>Array.from({length:12},(_,midi)=>({midi,start_tick:midi,end_tick:midi+1,channel:0})));
  const chromatic=scoreKeyForPassage({notes,ticks_per_quarter:100,events:[]});
  assert.equal(chromatic.keyId,null); assert.equal(chromatic.source,null);
  assert.equal(scoreKeyForPassage({notes:notes.slice(0,12),ticks_per_quarter:100,events:[]}).keyId,null);
  const conflict=scoreKeyForPassage({...bach,events:[...bach.events,{tick:0,track:50,message:{type:'key_signature',key:'G'}},{tick:0,track:51,message:{type:'key_signature',key:'F'}}]});
  assert.equal(conflict.keyId,null); assert.equal(conflict.ambiguous,true); assert.equal(conflict.source,'conflict');
});


test('authored advanced vocabularies preserve functional tones and double accidentals',()=>{
  const pcs=(kind,index)=>advancedChord('C',false,kind,index).pcs;
  assert.deepEqual(pcs('secondary',1),[2,6,9,0]);
  assert.deepEqual(pcs('diminished',1),[11,2,5,8]);
  assert.deepEqual(pcs('augmented-sixth',1),[8,0,3,6]);
  assert.deepEqual(pcs('altered',1),[7,11,2,5,8]);
  assert.deepEqual(advancedChord('C',true,'secondary',2).pcs,[4,8,11]);
  const written=advancedChord('B',true,'secondary',1).spell([70,74,77,80]);
  assert.deepEqual(written.map(noteName),['A♯4','C𝄪5','E♯5','G♯5']);
  const german=advancedChord('C',false,'augmented-sixth',1).spell([56,60,63,66]);
  assert.deepEqual(german.map(noteName),['A♭3','C4','E♭4','F♯4']);
  for(const key of KEYS) for(const minor of [false,true]) for(const [kind,vocab] of Object.entries(advancedVocabulary)) {
    for(let i=0;i<vocab.chords.length;i++) {
      const recipe=advancedChord(key.id,minor,kind,i);
      const pitches=recipe.pcs.map(pc=>60+pc);
      const notes=recipe.spell(pitches);
      assert.ok(notes,`${key.id}/${minor}/${kind}/${i}`);
      for(const n of notes) assert.equal((n.octave+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[n.letter]+n.accidental,n.midi);
    }
  }
});

test('all generated sources obey hand density, span, ledger and refill leap limits',()=>{
  let seed=812; const random=()=>((seed=seed*16807%2147483647)/2147483647);
  for(const source of ['random','triads','cadence','advanced']) for(const hand of ['left','right','both']) {
    const settings={...defaults,source,hand,texture:'block',span:'full',low:36,high:84,size:6,'min-size':2,length:16,'hand-span':7,'left-density':2,'right-density':3,'left-leap':5,'right-leap':5,'ledger-limit':2};
    const first=makePracticePhrase(settings,random), next=makePracticePhrase({...settings,sequenceOffset:16,previousTarget:first.at(-1)},random);
    const previous={left:[],right:[]};
    for(const chord of [...first,...next]) {
      assert.equal(new Set(chord.map(staffStep)).size,chord.length);
      assert.ok(chord.every(n=>n.midi>=36 && n.midi<=84));
      for(const side of ['left','right']) {
        const notes=chord.filter(n=>n.hand===side), pitches=notes.map(n=>n.midi);
        assert.ok(pitches.length<=(side==='left'?2:3));
        if(pitches.length) {
          assert.ok(pitches.at(-1)-pitches[0]<=7);
          assert.ok(handDistance(previous[side],pitches)<=5);
          previous[side]=pitches;
        }
        const bottom=side==='left'?18:30;
        assert.ok(notes.every(n=>Math.floor(Math.max(0,bottom-staffStep(n),staffStep(n)-bottom-8)/2)<=2));
      }
    }
    assert.ok(first.some(chord=>chord.length),source+'/'+hand);
  }
});

test('musical textures have distinct moving-hand roles and ordered broken patterns',()=>{
  const base={...defaults,source:'cadence',hand:'both',texture:'block',span:'wide',low:48,high:84,size:4,'min-size':4,length:8};
  const melody=makePracticePhrase({...base,texture:'melody'},()=>.3);
  assert.ok(melody.every(chord=>chord.filter(n=>n.hand==='right').length===1 && chord.filter(n=>n.hand==='left').length===3));
  const bass=makePracticePhrase({...base,texture:'bass'},()=>.3);
  assert.ok(bass.every(chord=>chord.filter(n=>n.hand==='left').length===1 && chord.filter(n=>n.hand==='right').length===3));
  for(const [texture,order] of [['broken',[0,1,2,1]],['alberti',[0,2,1,2]]]) {
    const phrase=makePracticePhrase({...base,hand:'right',texture,size:1,'min-size':1,length:4},()=>.3);
    const pitches=phrase.map(c=>c[0].midi), sorted=[...new Set(pitches)].sort((a,b)=>a-b);
    assert.equal(sorted.length,3);
    assert.deepEqual(pitches,order.map(i=>sorted[i]));
    assert.ok(phrase.flat().every(n=>[0,4,7].includes(n.midi%12)));
  }
});

test('attack independence schedules exact fresh pitch sets without implied holds',()=>{
  assert.deepEqual(Array.from({length:4},(_,i)=>attackHands('3:2',i)),[[true,true],[false,true],[true,false],[false,true]]);
  const settings={...defaults,source:'random',texture:'block',hand:'both',span:'wide',size:4,'min-size':4,length:8,'attack-pattern':'3:2'};
  const phrase=makePracticePhrase(settings,()=>.3);
  for(let i=0;i<phrase.length;i++) {
    const [left,right]=attackHands('3:2',i);
    assert.equal(phrase[i].some(n=>n.hand==='left'),left);
    assert.equal(phrase[i].some(n=>n.hand==='right'),right);
    assert.ok(phrase[i].every(n=>n.sourceOnset===undefined));
  }
  const id=exerciseIdentity(phrase[0],settings,phrase);
  for(const [field,value] of [['texture','melody'],['left-leap','2'],['ledger-limit','0'],['attack-pattern','alternate']]) assert.notEqual(exerciseIdentity(phrase[0],{...settings,[field]:value},phrase),id);
});

test('narrow ranges never bypass strict limits and repeat seams respect both hand leaps',()=>{
  const impossible=makePracticePhrase({...defaults,source:'advanced',texture:'block',key:'C',low:61,high:61,length:3,'advanced-kind':'secondary'},()=>.2);
  assert.deepEqual(impossible,[[],[],[]]);
  const settings={...defaults,source:'random',texture:'melody',hand:'both',span:'wide',size:2,'min-size':2,length:8,endAction:'repeat','left-leap':2,'right-leap':2};
  const phrase=makePracticePhrase(settings,()=>.3);
  assert.ok(phrase.every(c=>c.length));
  for(const side of ['left','right']) {
    const first=phrase[0].filter(n=>n.hand===side).map(n=>n.midi), last=phrase.at(-1).filter(n=>n.hand===side).map(n=>n.midi);
    assert.ok(handDistance(first,last)<=2);
  }
  assert.equal(handDistance([48,60],[48,72]),12);
});


test('worker refills are bounded, retain each hand and ignore obsolete settings',()=>{
  const messages=[], worker={postMessage:data=>messages.push(data)};let changes=0;
  const stream=new GeneratedStream(()=>changes++,()=>worker);
  const phrase=[[{midi:48,staff:'bass'}],[{midi:72,staff:'treble'}]];
  stream.prepare({texture:'block'},phrase,32);
  assert.equal(messages[0].settings.length,17);
  assert.deepEqual(messages[0].settings.previousTarget.map(n=>n.midi),[48,72]);
  assert.equal(stream.take(17),null);
  stream.reset();worker.onmessage({data:{revision:messages[0].revision,targets:[[spell(60)]]}});
  assert.equal(changes,0);assert.equal(stream.queue.length,0);
  stream.prepare({texture:'melody'},phrase,32);
  worker.onmessage({data:{revision:messages[1].revision,targets:Array.from({length:17},()=>[spell(60)])}});
  assert.equal(changes,1);assert.equal(stream.take(17).length,17);assert.equal(stream.queue.length,0);
  worker.onmessage({data:{revision:stream.revision,error:'unavailable'}});assert.equal(stream.error,'unavailable');
  worker.onerror();assert.match(stream.error,/Choose Repeat/);
  const unsupported=new GeneratedStream(()=>{},()=>{throw Error('unsupported');});
  unsupported.prepare({},[],0);assert.match(unsupported.error,/Choose Repeat/);
});

test('broken texture carries its harmonic and register pattern across a refill',()=>{
  const settings={...defaults,source:'cadence',texture:'broken',hand:'right',span:'wide',low:60,high:84,size:1,'min-size':1,captureState:true};
  const whole=makePracticePhrase({...settings,length:8},()=>.3);
  const opening=makePracticePhrase({...settings,length:5},()=>.3);
  const refill=makePracticePhrase({...settings,length:3,sequenceOffset:5,previousTarget:opening.at(-1),generationState:opening.generationState},()=>.3);
  assert.deepEqual(refill.map(c=>c.map(n=>n.midi)),whole.slice(5).map(c=>c.map(n=>n.midi)));
});


test('custom panels validate saved geometry and remain reachable on smaller viewports',()=>{
  const panels={staff:{x:0,y:0,width:700,height:600},keyboard:{x:720,y:0,width:400,height:240}};
  const saved={version:1,density:'compact',scale:.65,panels};
  assert.deepEqual(parseCustomLayout(JSON.stringify(saved)),saved);
  for(const text of ['bad','null','{}',JSON.stringify({...saved,version:2}),JSON.stringify({...saved,scale:8}),JSON.stringify({...saved,density:'unknown'}),JSON.stringify({...saved,panels:{staff:panels.staff}}),JSON.stringify({...saved,panels:{...panels,keyboard:{...panels.keyboard,width:-1}}})]) assert.equal(parseCustomLayout(text),null);
  const mobile=fitCustomPanels(panels,288);
  assert.equal(mobile.staff.width,288);assert.equal(mobile.keyboard.x,0);
  assert.ok(mobile.keyboard.y>=mobile.staff.y+mobile.staff.height);
  assert.deepEqual(fitCustomPanels(panels,1200),panels);
  assert.equal(panels.keyboard.x,720,'viewport fitting must not destroy the desktop save');
  assert.equal(fitCustomPanels({...panels,staff:{...panels.staff,width:280,height:180}},1200).staff.height,320);
  assert.deepEqual(fitPanel({x:-40,y:9000,width:30,height:9000},800),{x:0,y:3000,width:280,height:2000});
  const reversed=fitCustomPanels({staff:panels.keyboard,keyboard:panels.staff},288);
  assert.ok(reversed.staff.y>=reversed.keyboard.y+reversed.keyboard.height);
});
