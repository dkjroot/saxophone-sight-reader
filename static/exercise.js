import {KEYS,noteName,spell} from './core.js';
import {cadenceLabels,advancedVocabulary} from './harmony.js';

// Describe active generation/filter rules, never the file currently being previewed.
export function describeExercise(settings,activePiece=null) {
  const imported=settings.source==='midi', harmonic=['triads','cadence','advanced'].includes(settings.source);
  const key=KEYS.find(key=>key.id===settings.key)||KEYS[0];
  const minor=settings['harmony-scale']==='minor', sevenths=settings['harmony-kind']==='sevenths';
  const title=settings.source==='advanced' ? 'Advanced harmony' : imported ? 'Local MIDI outline' : settings.source==='cadence' ? 'Cadence' : harmonic ? 'Diatonic chords' : 'Random pitches';
  const parts=[];
  if(imported && activePiece) {
    parts.push(activePiece.filename,`Source attacks ${activePiece.bounds.start}–${activePiece.bounds.end}`);
    const tracks=activePiece.bounds.tracks?.filter(track=>track.enabled).length;
    if(tracks!==undefined) parts.push(`${tracks} selected track${tracks===1 ? '' : 's'}`);
  }
  parts.push(harmonic ? key.label.split(' / ')[minor ? 1 : 0].replace('minor',settings.source==='advanced'?'minor':'natural minor') : key.label);
  parts.push(({right:'Right hand',left:'Left hand',both:'Both hands'})[settings.hand]);
  parts.push(({near:'Near middle C',wide:'Wider staff range',full:'All available notes'})[settings.span]);
  if(Number.isInteger(settings.low) && Number.isInteger(settings.high)) parts.push(`Keyboard ${noteName(spell(settings.low))}–${noteName(spell(settings.high))}`);
  const maximum=Math.max(1,Math.min(10,+settings.size||1));
  const minimum=Math.max(1,Math.min(maximum,+settings['min-size']||1));
  parts.push(maximum===1 ? 'Single notes' : imported ? `Up to ${maximum} notes/chord` : `${minimum===maximum ? maximum : `${minimum}–${maximum}`} notes/chord`);
  if(settings.source==='advanced') {const vocabulary=advancedVocabulary[settings['advanced-kind']];parts.push(minor?(vocabulary?.minorLabel||vocabulary?.label):vocabulary?.label);}
  if(harmonic && settings.source!=='advanced') {
    parts.push(sevenths ? 'Diatonic sevenths' : 'Triads');
    if(settings.source==='cadence') parts.push(cadenceLabels(minor,sevenths)[Math.max(0,['authentic','ii-v-i','turnaround'].indexOf(settings['cadence-shape']))]);
    parts.push(`Hand span: ${({7:'fifth',12:'octave',16:'tenth',24:'two octaves'})[settings['hand-span']]||'octave'}`);
  } else if(!harmonic) parts.push(({white:'Notes in key',sharps:'Chromatic, prefer sharps',flats:'Chromatic, prefer flats'})[settings.material]);
  if(!imported && settings.texture && settings.texture!=='block') parts.push(({melody:'Melody with chords',bass:'Bass with chords',broken:'Broken chords',alberti:'Alberti bass'})[settings.texture]);
  if(!imported && settings.hand==='both' && settings['attack-pattern'] && settings['attack-pattern']!=='together') parts.push(`Attack pattern: ${settings['attack-pattern']}`);
  parts.push(settings.endAction==='new' ? imported?'Continue through piece':'Continuous' : settings.endAction==='stop'?'Stop at end':'Repeat');
  return {title,description:parts.filter(Boolean).join(' · ')};
}
