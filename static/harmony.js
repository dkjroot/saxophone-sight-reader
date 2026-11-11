import {makePhrase} from './core.js';
import {planPhrase,planningControls} from './generation.js';

const TONICS={C:0,G:7,D:2,A:9,E:4,B:11,'F#':6,'C#':1,F:5,Bb:10,Eb:3,Ab:8,Db:1,Gb:6,Cb:11};
const MAJOR=[0,2,4,5,7,9,11], MINOR=[0,2,3,5,7,8,10];

// Each tone is an authored diatonic degree plus a semitone alteration from
// major. This retains functional spelling, including double accidentals.
const I=[[0,0],[2,0],[4,0]], V=[[4,0],[6,0],[1,0]], ii7=[[1,0],[3,0],[5,0],[0,0]];
export const advancedVocabulary={
  secondary:{label:'Secondary dominant',chords:[I,[[1,0],[3,1],[5,0],[0,0]],V,I]},
  diminished:{label:'Leading-tone diminished seventh',chords:[I,[[6,0],[1,0],[3,0],[5,-1]],I]},
  mixture:{label:'Borrowed minor subdominant',chords:[I,[[3,0],[5,-1],[0,0]],V,I]},
  'augmented-sixth':{label:'German augmented sixth',chords:[I,[[5,-1],[0,0],[2,-1],[3,1]],V,I]},
  ninths:{label:'Extended ii9–V9–Imaj9',minorLabel:'Extended iiø9–V7♭9–i9',chords:[[[1,0],[3,0],[5,0],[0,0],[2,0]],[[4,0],[6,0],[1,0],[3,0],[5,0]],[[0,0],[2,0],[4,0],[6,0],[1,0]]]},
  altered:{label:'ii7–V7♭9–I',minorLabel:'iiø7–V7♭9–i',chords:[ii7,[[4,0],[6,0],[1,0],[3,0],[5,-1]],I]},
  quartal:{label:'Quartal planing',chords:[[[0,0],[3,0],[6,-1]],[[1,0],[4,0],[0,0]],[[2,0],[5,0],[1,0]],[[0,0],[3,0],[6,-1]]]}
};

export function advancedChord(key,minor,kind,index) {
  const vocabulary=advancedVocabulary[kind]||advancedVocabulary.secondary;
  const tones=vocabulary.chords[index%vocabulary.chords.length];
  const letters='CDEFGAB', base={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const tonicLetter=minor?letters[(letters.indexOf(key[0])+5)%7]:key[0];
  const tonic=((TONICS[key]??0)+(minor?9:0))%12;
  const entries=tones.map(([degree,alter])=>{
    const letter=letters[(letters.indexOf(tonicLetter)+degree)%7];
    // Mixture and chromatic functions are relative to a major tonic. Minor
    // tonic/ii harmonies use the minor third/sixth; dominant leading tones stay raised.
    let offset=MAJOR[degree]+alter;
    if(minor && tones===I && degree===2) offset--;
    if(minor && tones===ii7 && degree===5) offset--;
    if(minor && kind==='ninths') {
      const position=index%3;
      if((position===0 && [2,5].includes(degree)) || (position===1 && degree===5) || (position===2 && [2,6].includes(degree))) offset--;
    }
    const pc=(tonic+offset+12)%12;
    const accidental=(pc-base[letter]+18)%12-6;
    return {pc,letter,accidental};
  });
  return {pcs:entries.map(n=>n.pc),spell:pitches=>{
    const notes=pitches.map(midi=>{
      const tone=entries.find(n=>n.pc===midi%12);
      if(!tone||Math.abs(tone.accidental)>2) return null;
      return {midi,letter:tone.letter,accidental:tone.accidental,octave:(midi-base[tone.letter]-tone.accidental)/12-1};
    });
    return notes.some(n=>!n)||new Set(notes.map(n=>n.octave*7+letters.indexOf(n.letter))).size!==notes.length?null:notes;
  }};
}

export function cadenceLabels(minor=false,sevenths=false) {
  if(sevenths) return minor ? ['i7–iv7–v7–i7','iiø7–v7–i7','i7–VImaj7–iiø7–v7'] : ['Imaj7–IVmaj7–V7–Imaj7','ii7–V7–Imaj7','Imaj7–vi7–ii7–V7'];
  return minor ? ['i–iv–v–i','ii°–v–i','i–VI–ii°–v'] : ['I–IV–V–I','ii–V–I','I–vi–ii–V'];
}

export function harmonicPitchClasses(key, minor, degree, sevenths=false) {
  const scale=minor ? MINOR : MAJOR;
  const tonic=((TONICS[key] ?? 0)+(minor ? 9 : 0))%12;
  return (sevenths ? [0,2,4,6] : [0,2,4]).map(offset=>(tonic+scale[(degree+offset)%7])%12);
}

export function makePracticePhrase(settings, random=Math.random) {
  const source=settings.source || 'random';
  if(source==='random' && !planningControls.some(field=>settings[field]!==undefined) && !settings['hand-span']) return makePhrase(settings,random);
  return planPhrase({...settings,source},random,absolute=>{
      if(source==='advanced') return advancedChord(settings.key||'C',settings['harmony-scale']==='minor',settings['advanced-kind'],absolute);
      const pattern=({'ii-v-i':[1,4,0],turnaround:[0,5,1,4]})[settings['cadence-shape']]||[0,3,4,0];
      const degree=source==='cadence'?pattern[absolute%pattern.length]:Math.floor(random()*7);
      return {pcs:harmonicPitchClasses(settings.key,settings['harmony-scale']==='minor',degree,settings['harmony-kind']==='sevenths')};
  });
}
