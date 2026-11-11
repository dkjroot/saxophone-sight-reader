// MIDI key markers are authoritative; pitch-class inference is a marked fallback.
import {KEYS} from './core.js';

const MIDI_KEYS={
  C:['C','major'],G:['G','major'],D:['D','major'],A:['A','major'],E:['E','major'],B:['B','major'],
  'F#':['F#','major'],'C#':['C#','major'],F:['F','major'],Bb:['Bb','major'],Eb:['Eb','major'],Ab:['Ab','major'],Db:['Db','major'],Gb:['Gb','major'],Cb:['Cb','major'],
  Cm:['Eb','minor'],Gm:['Bb','minor'],Dm:['F','minor'],Am:['C','minor'],Em:['G','minor'],Bm:['D','minor'],
  'F#m':['A','minor'],'C#m':['E','minor'],'G#m':['B','minor'],'D#m':['F#','minor'],'A#m':['C#','minor'],
  Fm:['Ab','minor'],Bbm:['Db','minor'],Ebm:['Gb','minor'],Abm:['Cb','minor'],
};
const MINOR_NAMES={C:'A',G:'E',D:'B',A:'F♯',E:'C♯',B:'G♯','F#':'D♯','C#':'A♯',F:'D',Bb:'G',Eb:'C',Ab:'F',Db:'B♭',Gb:'E♭',Cb:'A♭'};
const MAJOR_PITCH={C:0,G:7,D:2,A:9,E:4,B:11,'F#':6,'C#':1,F:5,Bb:10,Eb:3,Ab:8,Db:1,Gb:6,Cb:11};
const MAJOR_ID_BY_PITCH={0:'C',1:'Db',2:'D',3:'Eb',4:'E',5:'F',6:'Gb',7:'G',8:'Ab',9:'A',10:'Bb',11:'B'};
const MAJOR_PROFILE=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const TIMELINES=new WeakMap(), ESTIMATES=new WeakMap();

function signature(raw) {
  const parsed=MIDI_KEYS[raw];
  return parsed ? {keyId:parsed[0],mode:parsed[1],raw,label:parsed[1]==='minor' ? `${raw.slice(0,-1).replace('#','♯')} minor` : `${raw.replace('#','♯')} major`} : null;
}
function timeline(score) {
  if(TIMELINES.has(score)) return TIMELINES.get(score);
  const grouped=new Map();
  for(const event of score?.events||[]) {
    if(event?.message?.type!=='key_signature' || !Number.isSafeInteger(event.tick) || event.tick<0) continue;
    if(!grouped.has(event.tick)) grouped.set(event.tick,new Set());
    if(signature(event.message.key)) grouped.get(event.tick).add(event.message.key);
  }
  const result=[...grouped].sort((a,b)=>a[0]-b[0]).map(([tick,keys])=>({tick,keys:[...keys].sort(),conflict:keys.size>1,key:keys.size===1 ? signature([...keys][0]) : null}));
  TIMELINES.set(score,result); return result;
}
function correlation(histogram,profile,tonic) {
  const meanX=histogram.reduce((sum,value)=>sum+value,0)/12;
  const values=Array.from({length:12},(_,pitch)=>profile[(pitch-tonic+12)%12]);
  const meanY=values.reduce((sum,value)=>sum+value,0)/12;
  let numerator=0,varianceX=0,varianceY=0;
  for(let pitch=0;pitch<12;pitch++) {
    const x=histogram[pitch]-meanX,y=values[pitch]-meanY;
    numerator+=x*y; varianceX+=x*x; varianceY+=y*y;
  }
  return varianceX && varianceY ? numerator/Math.sqrt(varianceX*varianceY) : 0;
}
function estimate(score,untilTick=Infinity) {
  if(untilTick===Infinity && ESTIMATES.has(score)) return ESTIMATES.get(score);
  const notes=(score?.notes||[]).filter(note=>note.channel!==9 && Number.isInteger(note.midi) && note.midi>=0 && note.midi<=127 && Number.isSafeInteger(note.start_tick) && note.start_tick<untilTick);
  const histogram=Array(12).fill(0); let distinct=0;
  for(const note of notes) {
    const pitch=note.midi%12, duration=note.end_tick===null || !Number.isFinite(note.end_tick) ? 1 : Math.max(1,note.end_tick-note.start_tick);
    histogram[pitch]+=Math.min(duration,Math.max(1,(score.ticks_per_quarter||480)*4));
  }
  distinct=histogram.filter(value=>value>0).length;
  if(notes.length<24 || distinct<5) return null;
  const bySignature=new Map();
  for(const [mode,profile] of [['major',MAJOR_PROFILE],['minor',MINOR_PROFILE]]) for(let tonic=0;tonic<12;tonic++) {
    const tonicPitch=(tonic+(mode==='minor'?3:0))%12, keyId=MAJOR_ID_BY_PITCH[tonicPitch];
    const value=correlation(histogram,profile,tonic), previous=bySignature.get(keyId);
    if(!previous || value>previous.value) bySignature.set(keyId,{keyId,mode,value});
  }
  const ranked=[...bySignature.values()].sort((a,b)=>b.value-a.value);
  const margin=ranked[0].value-ranked[1].value;
  const result=ranked[0].value>=.62 && margin>=.12 ? {...ranked[0],source:'estimated',label:KEYS.find(key=>key.id===ranked[0].keyId).label,confidence:margin} : null;
  if(untilTick===Infinity) ESTIMATES.set(score,result);
  return result;
}

export function scoreKeyForPassage(score,{startTick=0,endTick=Infinity}={}) {
  if(!score || !Number.isSafeInteger(startTick) || startTick<0 || !(Number.isSafeInteger(endTick) || endTick===Infinity) || endTick<startTick) return {keyId:null,source:null,label:'',changes:[],ambiguous:false};
  const markers=timeline(score), prior=markers.filter(marker=>marker.tick<=startTick).at(-1);
  if(prior?.conflict) return {keyId:null,source:'conflict',label:'',changes:markers.filter(marker=>marker.tick>startTick && marker.tick<=endTick),ambiguous:true};
  let active=prior?.key||null, source=active ? 'midi' : 'estimated';
  if(!active) {
    const firstMarker=markers.find(marker=>marker.tick>startTick);
    // If an opening marker is absent, infer only the notes before the first later marker.
    active=estimate(score,firstMarker?.tick??Infinity);
  }
  const changes=[]; let last=prior?.key?.raw||active?.raw||null;
  for(const marker of markers) {
    if(marker.tick<=startTick || marker.tick>endTick) continue;
    if(marker.conflict) {changes.push(marker); continue;}
    if(marker.key.raw!==last) changes.push(marker);
    last=marker.key.raw;
  }
  return {keyId:active?.keyId??null,mode:active?.mode??null,source:active ? source : null,label:active?.label||'',confidence:active?.confidence??null,changes,ambiguous:false};
}


export function writtenKey(keyId, offset = 0) {
  if (!keyId || !offset) return keyId;
  const pitch = ((MAJOR_PITCH[keyId] - offset) % 12 + 12) % 12;
  return MAJOR_ID_BY_PITCH[pitch];
}
