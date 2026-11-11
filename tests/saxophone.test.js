import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {noteName} from '../static/core.js';
import {FlowGate} from '../static/flow.js';
import {makeOutline} from '../static/outline.js';
import {midiStudy} from '../static/midi_study.js';
import {filterStudy} from '../static/passage_filters.js';
import {compileScore} from '../static/score_model.js';
import {writtenKey} from '../static/score_key.js';
import {MIDI_OFFSETS, makeSaxPhrase, soundingPitch, WindPerformance, writtenPitch} from '../static/saxophone.js';

const defaults = {sax:true, key:'C', source:'random', material:'white', low:58, high:90, span:'standard', length:12};
const pitches = phrase => phrase.map(([note]) => note.midi);

test('sax registers and instrument bounds intersect; every target is one treble note', () => {
  const phrase = makeSaxPhrase({...defaults, span:'core', low:64, high:70, leap:'2'}, () => .4);
  assert.equal(phrase.length, 12);
  for (const [index, target] of phrase.entries()) {
    assert.equal(target.length, 1);
    assert.equal(target[0].staff, 'treble');
    assert.ok(target[0].midi >= 64 && target[0].midi <= 70);
    if (index) assert.ok(Math.abs(target[0].midi - phrase[index - 1][0].midi) <= 2);
  }
  assert.deepEqual(makeSaxPhrase({...defaults, span:'core', low:58, high:61}), []);
  assert.deepEqual(pitches(makeSaxPhrase({...defaults, low:60, high:60, length:3})), [60,60,60]);
});

test('jazz pitch recipes preserve spelling, direction and refill phase', () => {
  const blues = {...defaults, source:'blues', low:60, high:72};
  assert.deepEqual(makeSaxPhrase({...blues, length:7}).map(([note]) => noteName(note)),
    ['C4','E♭4','F4','G♭4','G4','B♭4','C5']);
  const bebop = makeSaxPhrase({...blues, source:'bebop', length:9});
  assert.deepEqual(pitches(bebop), [60,62,64,65,67,69,70,71,72]);
  const iiVi = {...blues, source:'ii-v-i', high:74};
  assert.deepEqual(pitches(makeSaxPhrase(iiVi)), [62,65,69,72,74,71,67,65,64,67,71,72]);
  assert.deepEqual(pitches(makeSaxPhrase({...iiVi, length:7, sequenceOffset:29})),
    pitches(makeSaxPhrase({...iiVi, length:36})).slice(29));
  assert.deepEqual(pitches(makeSaxPhrase({...defaults, source:'scale', tonality:'minor', low:57, high:69, span:'full', length:8})),
    [57,59,60,62,64,65,67,69]);
});

test('written and sounding pitches map by exact octave as well as pitch class', () => {
  for (const [instrument, concertC] of Object.entries({written:60, soprano:58, alto:51, tenor:46, baritone:39})) {
    const offset = MIDI_OFFSETS[instrument];
    assert.equal(soundingPitch(60, offset), concertC);
    assert.equal(writtenPitch(concertC, offset), 60);
  }
  assert.equal(writtenKey('C', MIDI_OFFSETS.alto), 'A');
  assert.equal(writtenKey('C', MIDI_OFFSETS.tenor), 'D');
});

test('wind MIDI handles overlapping slurs, repeated attacks, channel ownership and breath data', () => {
  const wind = new WindPerformance(), gate = new FlowGate(), offset = MIDI_OFFSETS.alto;
  const send = data => wind.midi('ae05', data, offset);
  const c = [{midi:60}], d = [{midi:62}];
  gate.start(c, [], wind.held, wind.attacks);
  send([0x90,51,100]);
  assert.equal(gate.evaluate(wind.held, wind.attacks).ready, true);
  gate.start(d, c, wind.held, wind.attacks);
  assert.equal(send([0xb0,2,115]), false);
  assert.equal(send([0xe0,0,64]), false);
  assert.equal(send([0xb0,64,127]), false);
  assert.equal(send([0x90,53,100]), true);
  assert.equal(send([0x80,51,0]), false);
  assert.deepEqual([...wind.held], [62]);
  assert.equal(gate.evaluate(wind.held, wind.attacks).ready, true);

  gate.start(d, d, wind.held, wind.attacks);
  assert.equal(send([0x90,53,120]), false);
  send([0x91,53,95]);
  send([0x80,53,0]);
  assert.equal(gate.evaluate(wind.held, wind.attacks).ready, false);
  send([0x91,53,0]);
  send([0x90,53,100]);
  assert.equal(gate.evaluate(wind.held, wind.attacks).ready, true);
  send([0xb0,123,0]);
  assert.deepEqual([...wind.held], []);
});

test('a MIDI melody retains a single source ID per attack and preserves input data', () => {
  const score = {
    sha256:'example', ticks_per_quarter:480, duration_ticks:960, tempo_map:[],
    events:[{tick:0,message:{type:'key_signature',key:'C'}}],
    notes:[
      {id:'t0:n0', track:0, channel:0, start_tick:0, end_tick:480, midi:51},
      {id:'t1:n0', track:1, channel:0, start_tick:0, end_tick:720, midi:55},
      {id:'t1:n1', track:1, channel:0, start_tick:480, end_tick:840, midi:57},
      {id:'t1:n2', track:1, channel:0, start_tick:840, end_tick:960, midi:58},
    ],
  };
  const snapshot = structuredClone(score);
  const settings = {...defaults, key:'A', 'file-offset':-9};
  const outline = makeOutline(score, settings);
  assert.deepEqual(pitches(outline.targets), [64,66,67]);
  assert.deepEqual(outline.targets.map(([note]) => note.sourceIds), [['t1:n0'],['t1:n1'],['t1:n2']]);
  assert.equal(outline.omittedNotes, 1);
  const study = midiStudy(score, settings);
  assert.equal(study.staves.length, 1);
  assert.equal(study.voices.length, 1);
  assert.deepEqual(study.sounds.map(note => note.midi), [64,67]);
  assert.equal(study.source.provenance.omittedNotes, 2);
  assert.equal(study.measures[0].key, 'A');
  assert.deepEqual(score, snapshot);
});

test('bundled sax studies compile as single-voice melodies with written rhythms', () => {
  for (const id of ['after-hours','turnaround']) {
    const score = compileScore(JSON.parse(readFileSync(new URL('../static/studies/' + id + '.json', import.meta.url))));
    assert.equal(filterStudy(score, defaults), score);
    assert.equal(score.staves.length, 1);
    assert.equal(score.measures.length, 4);
    assert.ok(score.moments.every(moment => moment.attacks.length + moment.continuing.length <= 1));
    assert.ok(score.events.some(event => event.kind === 'rest'));
  }
});


test('built-in sax tunes retain their written key, range and attacks in both practice views', () => {
  const read = name => JSON.parse(readFileSync(new URL('../static/library/' + name, import.meta.url)));
  for (const entry of read('catalogue.json').pieces) {
    const score = read(entry.inspection);
    const signature = score.events.find(event => event.message.type === 'key_signature').message.key;
    const key = {Dm:'F',Em:'G'}[signature] || signature;
    const settings = {...defaults, source:'midi', key, 'file-offset':-14};
    const outline = makeOutline(score, settings);
    assert.equal(outline.omittedNotes, 0, entry.title);
    assert.deepEqual(pitches(outline.targets), score.notes.map(note => note.midi), entry.title);
    const study = midiStudy(score, settings);
    assert.equal(study.measures[0].key, key, entry.title);
    assert.equal(study.staves.length, 1);
    assert.deepEqual(study.sounds.map(note => note.midi), pitches(outline.targets), entry.title);
  }
});
