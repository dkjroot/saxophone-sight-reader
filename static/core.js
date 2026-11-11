// Written identity is independent of sounding pitch. Future scores can supply
// e.g. {midi: 62, letter: 'C', accidental: 2, octave: 4} for C double sharp.
export const WHITE = [0, 2, 4, 5, 7, 9, 11];
export const KEYS = [
  ['C','C major / A minor',0], ['G','G major / E minor',1], ['D','D major / B minor',2],
  ['A','A major / F♯ minor',3], ['E','E major / C♯ minor',4], ['B','B major / G♯ minor',5],
  ['F#','F♯ major / D♯ minor',6], ['C#','C♯ major / A♯ minor',7],
  ['F','F major / D minor',-1], ['Bb','B♭ major / G minor',-2], ['Eb','E♭ major / C minor',-3],
  ['Ab','A♭ major / F minor',-4], ['Db','D♭ major / B♭ minor',-5], ['Gb','G♭ major / E♭ minor',-6], ['Cb','C♭ major / A♭ minor',-7]
].map(([id,label,fifths]) => ({id,label,fifths}));
export function keyAlterations(key = 'C') {
  const fifths = KEYS.find(k => k.id === key)?.fifths || 0;
  const result = Object.fromEntries([...'CDEFGAB'].map(letter => [letter,0]));
  for (const letter of (fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0,Math.abs(fifths))) result[letter] = Math.sign(fifths);
  return result;
}
export function spellInKey(midi, key = 'C') {
  const alterations = keyAlterations(key);
  for (const [letter, pitch] of Object.entries({C:0,D:2,E:4,F:5,G:7,A:9,B:11})) {
    const octave = (midi-pitch-alterations[letter])/12-1;
    if (Number.isInteger(octave)) return {midi,letter,octave,accidental:alterations[letter]};
  }
  return null;
}
export function spell(midi, flats = false) {
  const names = flats ? ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'] : ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  return {midi, letter: names[midi % 12], accidental: WHITE.includes(midi % 12) ? 0 : flats ? -1 : 1, octave: Math.floor(midi / 12) - 1};
}
export function noteName(note) {
  return `${note.letter}${({'-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪'})[note.accidental]}${note.octave}`;
}
export function staffStep(note) { return note.octave * 7 + 'CDEFGAB'.indexOf(note.letter); }
export function spellChord(pitches, flats = false, key = 'C') {
  const ordered = [...new Set(pitches)].sort((a, b) => a-b);
  // Keep natural notes natural. Black keys may use either enharmonic spelling;
  // prefer the selected style, but reserve a distinct written position per pitch.
  const entries = ordered.map(midi => {
    const inKey = spellInKey(midi, key);
    return {midi, choices: inKey ? [inKey] : WHITE.includes(midi % 12) ? [spell(midi)] : [spell(midi, flats), spell(midi, !flats)]};
  });
  entries.sort((a, b) => a.choices.length-b.choices.length || a.midi-b.midi);
  const used = new Set(), chosen = new Map();
  function assign(index) {
    if (index === entries.length) return true;
    const {midi, choices} = entries[index];
    for (const note of choices) {
      const step = staffStep(note);
      if (used.has(step)) continue;
      used.add(step); chosen.set(midi, note);
      if (assign(index+1)) return true;
      used.delete(step); chosen.delete(midi);
    }
    return false;
  }
  return assign(0) ? ordered.map(midi => chosen.get(midi)) : null;
}
export function candidates({low, high, hand, material, span, key = 'C'}) {
  const limits = span === 'near' ? {left: [48, 59], right: [60, 72], both: [48, 72]} : span === 'wide' ? {left: [36, 60], right: [60, 84], both: [36, 84]} : {left: [0, 59], right: [60, 127], both: [0, 127]};
  const [start, end] = limits[hand];
  const notes = [];
  for (let midi = Math.max(low, start); midi <= Math.min(high, end); midi++) {
    if (material !== 'white' || spellInKey(midi, key)) notes.push(midi);
  }
  return notes;
}
export function makeTarget(settings, random = Math.random) {
  const pool = candidates(settings);
  const count = Math.min(settings.size, pool.length);
  const selected = [];
  const add = midi => {
    if (!spellChord([...selected, midi], settings.material === 'flats', settings.key)) return;
    selected.push(midi);
  };
  // Give both staves a note whenever the range and count permit it.
  if (settings.hand === 'both' && count >= 2) {
    for (const side of [pool.filter(n => n < 60), pool.filter(n => n >= 60)]) {
      if (side.length) add(side[Math.floor(random() * side.length)]);
    }
  }
  const remaining = pool.filter(n => !selected.includes(n));
  while (selected.length < count && remaining.length) add(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
  return spellChord(selected, settings.material === 'flats', settings.key).map(note => ({...note, staff: settings.hand === 'left' || (settings.hand === 'both' && note.midi < 60) ? 'bass' : 'treble'}));
}
export function makePhrase(settings, random = Math.random) {
  const length = Math.max(1, Math.min(32, Number(settings.length) || 4));
  const max = Math.max(1, Math.min(10, Number(settings.size) || 1));
  const min = Math.max(1, Math.min(max, Number(settings['min-size']) || 1));
  return Array.from({length}, () => makeTarget({...settings, size:min+Math.floor(random()*(max-min+1))}, random));
}
export function chordName(notes) {
  if (notes.length < 2) return '';
  const ordered = [...notes].sort((a,b) => a.midi-b.midi);
  const pcs = [...new Set(ordered.map(n => n.midi % 12))];
  const types = [
    ['', [0,4,7]], ['m',[0,3,7]], ['dim',[0,3,6]], ['aug',[0,4,8]],
    ['sus2',[0,2,7]], ['sus4',[0,5,7]], ['7',[0,4,7,10]], ['maj7',[0,4,7,11]],
    ['m7',[0,3,7,10]], ['m(maj7)',[0,3,7,11]], ['m7♭5',[0,3,6,10]], ['dim7',[0,3,6,9]],
    ['maj7♭5',[0,4,6,11]], ['7♭5',[0,4,6,10]], ['6',[0,4,7,9]], ['m6',[0,3,7,9]],
    ['add9',[0,2,4,7]], ['9',[0,2,4,7,10]], ['maj9',[0,2,4,7,11]], ['m9',[0,2,3,7,10]],
    ['11',[0,2,4,5,7,10]], ['13',[0,2,4,5,7,9,10]], ['5',[0,7]]
  ];
  const label = note => `${note.letter}${({'-2':'𝄫','-1':'♭',0:'',1:'♯',2:'𝄪'})[note.accidental]}`;
  // Exact pitch-class sets only. Prefer a root-position interpretation when
  // several names fit (e.g. C6 versus Am7); register doublings do not matter.
  for (const root of pcs) for (const [suffix, intervals] of types) {
    if (pcs.length !== intervals.length || !intervals.every(i => pcs.includes((root+i)%12))) continue;
    const rootNote = ordered.find(n => n.midi % 12 === root);
    const bass = ordered[0];
    return `${label(rootNote)}${suffix}${bass.midi % 12 === root ? '' : '/'+label(bass)}`;
  }
  return '';
}
export function match(target, held) {
  const pitches = new Set(target.map(n => n.midi));
  const missing = [...pitches].filter(n => !held.has(n));
  const extra = [...held].filter(n => !pitches.has(n));
  const correct = [...held].filter(n => pitches.has(n));
  const hints = [];
  if (pitches.size === 1 && held.size === 1 && extra.length) {
    hints.push({played: extra[0], target: missing[0], direction: missing[0] > extra[0] ? 'up' : 'down'});
  } else {
    // Lock correct notes in place, then only pair mutually unique nearest
    // unmatched neighbours within a whole tone. Ties stay unassigned. Do not
    // remove pairs and retry: that could manufacture certainty from a tie.
    const nearest = (pitch, pool) => {
      const distance = Math.min(...pool.map(n => Math.abs(n-pitch)));
      const choices = pool.filter(n => Math.abs(n-pitch) === distance);
      return distance <= 2 && choices.length === 1 ? choices[0] : null;
    };
    for (const played of extra) {
      const intended = nearest(played, missing);
      if (intended !== null && nearest(intended, extra) === played) hints.push({played, target: intended, direction: intended > played ? 'up' : 'down'});
    }
  }
  return {missing, extra, correct, complete: pitches.size > 0 && !missing.length && !extra.length,
    hints, direction: pitches.size === 1 && held.size === 1 ? hints[0]?.direction ?? null : null};
}

export class Performance {
  constructor() { this.sources = new Map(); this.attackSerial=0; this.pressSerials=new Map(); }
  source(id) {
    if (!this.sources.has(id)) this.sources.set(id, {held: new Set(), sustained: new Set(), pedal: false, attacks:new Map()});
    return this.sources.get(id);
  }
  noteOn(id, pitch, velocity=100) {
    const s=this.source(id), changed=!s.held.has(pitch);
    const fresh=![...this.sources.values()].some(source=>source.held.has(pitch));
    const serial=++this.attackSerial;
    if(fresh) this.pressSerials.set(pitch,serial);
    s.held.add(pitch); s.sustained.delete(pitch);
    s.attacks.set(pitch,{serial,pressSerial:this.pressSerials.get(pitch),velocity:Math.max(1,Math.min(127,Number(velocity)||100))});
    return changed;
  }
  noteOff(id, pitch) { const s = this.source(id); const changed = s.held.delete(pitch); if (changed && s.pedal) s.sustained.add(pitch); else if(changed) s.attacks.delete(pitch); return changed; }
  sustain(id, down) { const s = this.source(id); const changed = s.pedal !== down; s.pedal = down; if (!down) {for(const pitch of s.sustained) s.attacks.delete(pitch); s.sustained.clear();} return changed; }
  clear(id) { if (id === undefined) this.sources.clear(); else this.sources.delete(id); }
  get held() { return new Set([...this.sources.values()].flatMap(s => [...s.held])); }
  get sustained() { return new Set([...this.sources.values()].flatMap(s => [...s.sustained]).filter(n => !this.held.has(n))); }
  get attacks() {const attacks=new Map(); for(const source of this.sources.values()) for(const [pitch,attack] of source.attacks) if(!attacks.has(pitch) || attacks.get(pitch).serial<attack.serial) attacks.set(pitch,attack); return attacks;}
  get pedal() { return [...this.sources.values()].some(s => s.pedal); }
  midi(id, data) {
    const [status, pitch, velocity] = data;
    const source = `${id}:${status & 15}`;
    switch (status & 0xf0) {
      case 0x90: return velocity ? this.noteOn(source, pitch, velocity) : this.noteOff(source, pitch);
      case 0x80: return this.noteOff(source, pitch);
      case 0xb0:
        if (pitch === 64) return this.sustain(source, velocity >= 64);
        if (pitch === 120 || pitch === 123) { this.clear(source); return true; }
        if (pitch === 121) return this.sustain(source, false);
    }
    // Clock, active sensing, aftertouch and unrelated CCs must not reset the
    // completion timer or trigger rendering on a busy MIDI connection.
    return false;
  }
}
