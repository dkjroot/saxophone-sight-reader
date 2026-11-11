import {candidates,staffStep} from './core.js';
import {inSaxRange} from './saxophone.js';
import {compileScore,compareBeat} from './score_model.js';

export const passageControls=['key','hand','size','material','span','hand-span','left-density','right-density','left-leap','right-leap','ledger-limit'];
const limit=value=>value===undefined || value==='any'?Infinity:Number(value);
const side=note=>note.hand??(note.staff==='bass'?'left':'right');

// Reduction keeps source attacks and complete tied sounds. It never substitutes
// pitches or changes the timing to satisfy a player's constraints.
export function reduceAttack(notes,settings,previous={},held=[]) {
  const selected=[...held], pool=new Set(candidates({...settings,hand:'both'}));
  const ordered=[...notes].sort((a,b)=>b.midi-a.midi);
  if(ordered.length>1) ordered.splice(1,0,ordered.pop()); // melody, bass, inner notes
  for(const note of ordered) {
    const hand=side(note), staffNotes=selected.filter(other=>side(other)===hand);
    if(!pool.has(note.midi) || settings.hand!=='both' && settings.hand!==hand) continue;
    if(selected.length>=limit(settings.size) || staffNotes.length>=limit(settings[hand+'-density'])) continue;
    const pitches=[...staffNotes.map(other=>other.midi),note.midi];
    if(Math.max(...pitches)-Math.min(...pitches)>limit(settings['hand-span'])) continue;
    const bottom=note.staff==='bass'?18:30, step=staffStep(note);
    if((note.ledgerLines??Math.floor(Math.max(0,bottom-step,step-bottom-8)/2))>limit(settings['ledger-limit'])) continue;
    if(previous[hand]?.length && Math.min(...previous[hand].map(pitch=>Math.abs(pitch-note.midi)))>limit(settings[hand+'-leap'])) continue;
    selected.push(note);
  }
  for(const hand of ['left','right']) {
    const pitches=selected.filter(note=>side(note)===hand).map(note=>note.midi);
    if(previous[hand]?.some(pitch=>pitches.length && Math.min(...pitches.map(next=>Math.abs(next-pitch)))>limit(settings[hand+'-leap']))) {
      for(let i=selected.length-1;i>=0;i--) if(side(selected[i])===hand && !held.includes(selected[i])) selected.splice(i,1);
    }
    const kept=selected.filter(note=>side(note)===hand).map(note=>note.midi);
    if(kept.length) previous[hand]=kept;
  }
  return selected.filter(note=>!held.includes(note)).sort((a,b)=>a.midi-b.midi);
}

export function filterStudy(score,settings) {
  if (settings.sax) {
    if (score.staves.length !== 1 || score.voices.length !== 1 ||
        score.measures.some(measure => Object.values(measure.clefs).some(clef => clef !== 'treble')) ||
        score.moments.some(point => point.attacks.length + point.continuing.length > 1)) {
      throw new Error('Use a single-voice treble MusicXML part. For polyphonic music, import MIDI and choose a melody track.');
    }
    if (score.sounds.some(note => !inSaxRange(note.midi, {...settings, span:'full'}))) {
      throw new Error('This study goes outside your instrument range. Adjust the lowest or highest written note.');
    }
    return score;
  }
  const kept=new Set(), previous={}, accepted=[];
  const byId=new Map(score.notes.map(note=>[note.id,note])), measures=new Map(score.measures.map(measure=>[measure.id,measure]));
  const notes=score.sounds.map(sound=>({...sound,staff:sound.staffId===score.staves[1]?.id?'bass':'treble',ledgerLines:Math.max(...sound.segments.map(id=>{
    const note=byId.get(id), bottom=measures.get(note.measureId).clefs[note.staffId]==='bass'?18:30, step=staffStep(note);
    return Math.floor(Math.max(0,bottom-step,step-bottom-8)/2);
  }))}));
  notes.sort((a,b)=>compareBeat(a.start,b.start));
  const points=[...new Set(notes.map(note=>note.start.join('/')))];
  for(const point of points) {
    const at=notes.find(note=>note.start.join('/')===point).start;
    const attacks=notes.filter(note=>compareBeat(note.start,at)===0);
    const held=accepted.filter(note=>compareBeat(note.end,at)>0);
    for(const note of reduceAttack(attacks,settings,previous,held)) {accepted.push(note); for(const id of note.segments) kept.add(id);}
  }
  if(!kept.size) throw new Error('No retained notes in this passage. Widen the passage filters.');
  const source=structuredClone(score.source);
  for(const measure of source.measures) for(const event of measure.events) {
    if(event.kind==='rest') continue;
    event.notes=event.notes.filter(note=>kept.has(note.id));
    if(!event.notes.length) event.kind='rest';
  }
  const active=new Set(score.notes.filter(note=>kept.has(note.id)).map(note=>note.voiceId));
  source.voices=source.voices.filter(voice=>active.has(voice.id));
  for(const measure of source.measures) measure.events=measure.events.filter(event=>active.has(event.voice));
  source.ties=(source.ties??[]).filter(tie=>kept.has(tie.from) && kept.has(tie.to));
  source.provenance={...source.provenance,filters:Object.fromEntries(passageControls.map(id=>[id,settings[id]])),omittedSounds:score.sounds.length-accepted.length};
  if(source.provenance.kind==='midi-derived') {source.provenance.retainedNotes=accepted.length; source.provenance.omittedNotes=(score.source.provenance.omittedNotes??0)+score.sounds.length-accepted.length;}
  return compileScore(source);
}
