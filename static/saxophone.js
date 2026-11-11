import {KEYS, Performance, spell, spellInKey} from './core.js';

export const MIDI_OFFSETS = Object.freeze({written: 0, soprano: -2, alto: -9, tenor: -14, baritone: -21});
const REGISTERS = {core: [62, 74], standard: [58, 90], full: [0, 127]};
export const SOURCES = {
  random: 'Pitch drills', scale: 'Scale runs', blues: 'Blues scale',
  bebop: 'Dominant bebop scale', 'ii-v-i': 'ii–V–I arpeggios', midi: 'MIDI melody',
};

const pitchClass = pitch => ((pitch % 12) + 12) % 12;
const letters = 'CDEFGAB';
const naturals = [0, 2, 4, 5, 7, 9, 11];

export function writtenPitch(midi, offset) { return midi - offset; }
export function soundingPitch(written, offset) { return written + offset; }

export function filePitchOffset(score, settings) {
  return score?.provenance?.written_for === 'saxophone' ? 0 : settings['file-offset'] ?? 0;
}

export function saxNote(pitch, settings) {
  return {...(spellInKey(pitch, settings.key) || spell(pitch, settings.source === 'blues' || settings.material !== 'sharps')), staff: 'treble'};
}

export function inSaxRange(pitch, {low, high, span}) {
  const [start, end] = REGISTERS[span] ?? REGISTERS.full;
  return pitch >= Math.max(low, start) && pitch <= Math.min(high, end);
}

export function saxCandidates(settings, inKey = false) {
  return Array.from({length: 128}, (_, pitch) => pitch).filter(pitch =>
    inSaxRange(pitch, settings) && (!inKey || spellInKey(pitch, settings.key)));
}

function tonicFor(settings, minor) {
  const key = KEYS.find(key => key.id === settings.key) ?? KEYS[0];
  const label = key.label.split(' / ')[minor ? 1 : 0];
  const letter = letters.indexOf(label[0]);
  return {letter, pitch: naturals[letter] + (label[1] === '♯' ? 1 : label[1] === '♭' ? -1 : 0)};
}

function patternFor(source, minor) {
  if (source === 'ii-v-i') {
    return [[1,2],[3,5],[5,9],[7,12], [8,14],[6,11],[4,7],[3,5], [2,4],[4,7],[6,11],[7,12]];
  }
  const notes = source === 'blues' ? [[0,0],[2,3],[3,5],[4,6],[4,7],[6,10],[7,12]] :
    source === 'bebop' ? [[0,0],[1,2],[2,4],[3,5],[4,7],[5,9],[6,10],[6,11],[7,12]] :
    (minor ? [0,2,3,5,7,8,10,12] : [0,2,4,5,7,9,11,12]).map((pitch, degree) => [degree,pitch]);
  return [...notes, ...notes.slice(1,-1).reverse()];
}

function spellDegree(pitch, degree, tonic) {
  const letter = (tonic.letter + degree) % 7;
  const accidental = pitchClass(pitch - naturals[letter] + 2) - 2;
  return {midi: pitch, letter: letters[letter], accidental,
    octave: (pitch - naturals[letter] - accidental) / 12 - 1, staff: 'treble'};
}

export function makeSaxPhrase(settings, random = Math.random) {
  const {source, material, length, sequenceOffset = 0, previousTarget = []} = settings;
  const pool = saxCandidates(settings, source === 'random' && material === 'white');
  if (!pool.length) return [];
  let previous = previousTarget[0]?.midi;
  if (source === 'random') {
    const leap = Number(settings.leap) || Infinity;
    return Array.from({length}, () => {
      const nearby = pool.filter(pitch => pitch !== previous && Math.abs(pitch - previous) <= leap);
      const choices = nearby.length ? nearby : previous === undefined ? pool : [previous];
      previous = choices[Math.floor(random() * choices.length)];
      return [saxNote(previous, settings)];
    });
  }
  const minor = source === 'scale' && settings.tonality === 'minor';
  const tonic = tonicFor(settings, minor);
  const recipe = patternFor(source, minor);
  const roots = Array.from({length: 13}, (_, octave) => (octave - 1) * 12 + tonic.pitch);
  const variants = roots.map(root => recipe.filter(([, interval]) => pool.includes(root + interval)).map(
    ([degree, interval]) => spellDegree(root + interval, degree, tonic)));
  const line = variants.reduce((best, notes) => notes.length > best.length ||
    (notes.length === best.length && Math.abs((notes[0]?.midi ?? 0) - 65) < Math.abs((best[0]?.midi ?? 0) - 65)) ? notes : best, []);
  if (!line.length) return [];
  return Array.from({length}, (_, index) => [line[(sequenceOffset + index) % line.length]]);
}

export function describeSaxExercise(settings, piece) {
  const key = KEYS.find(key => key.id === settings.key)?.label ?? KEYS[0].label;
  const tonality = settings.source === 'scale' && settings.tonality === 'minor' ? 1 : 0;
  const register = {core:'Core register', standard:'Standard sax range', full:'Custom range'}[settings.span];
  const source = SOURCES[settings.source];
  const tonic = key.split(' ')[0];
  const label = settings.source === 'blues' ? tonic + ' blues' :
    settings.source === 'bebop' ? tonic + ' dominant' :
    settings.source === 'random' ? key : key.split(' / ')[tonality];
  const description = settings.source === 'midi' ? [piece?.filename, register, key] : [label, register];
  return {title: source, description: description.filter(Boolean).join(' · ')};
}

// A wind note-on can precede the previous note-off during a slur.
// Retire the old pitch atomically, keeping release and duplicate-note ownership.
export class WindPerformance extends Performance {
  midi(id, data, offset = 0) {
    const [status, value, velocity] = data;
    const kind = status & 0xf0;
    const source = `${id}:${status & 15}`;
    if (kind === 0xb0 && (value === 120 || value === 123)) {
      this.clear(source);
      return true;
    }
    if (kind !== 0x80 && kind !== 0x90 || !Number.isInteger(value) || value < 0 || value > 127) return false;
    const pitch = writtenPitch(value, offset);
    if (kind === 0x80 || !velocity) {
      return this.sources.get(source)?.held.has(pitch) ? this.noteOff(source, pitch) : false;
    }
    // MIDI offsets can place a real attack outside the written MIDI interval.
    // Retire it in the same way so it cannot leave a previous note stuck.
    const held = this.sources.get(source)?.held;
    if (held?.has(pitch)) return false;
    for (const previous of held ?? []) this.noteOff(source, previous);
    return this.noteOn(source, pitch, velocity);
  }
}
