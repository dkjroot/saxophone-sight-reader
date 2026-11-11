import {secondsAt} from './transport.js';
import {defaultBeatGroups} from './meter.js';
// Meter pulses use compound groups; MIDI does not supply irregular group choices
// or printed pickups. Count-in preserves source phase without inventing either.
function pulses(meter,ppq,first,last,emit) {
  const groups=defaultBeatGroups(meter.numerator);
  const unit=ppq*4/meter.denominator, bar=unit*meter.numerator;
  for(let cycle=Math.floor((first-meter.tick)/bar);meter.tick+cycle*bar<last;cycle++) {
    let offset=0;
    for(const [beat,group] of groups.entries()) {
      const tick=meter.tick+cycle*bar+offset*unit;
      if(tick>=first && tick<last) emit({tick,beat});
      offset+=group;
    }
  }
}
export function sourceBeats(score,plan,speed=1,bars=0) {
  if(plan.sourceStart===undefined || plan.sourceEnd<=plan.sourceStart) return {beats:[],leadIn:0};
  speed=Math.max(.25,Math.min(2,Number(speed)||1)); bars=Math.max(0,Math.min(2,Math.trunc(bars)||0));
  const first=plan.sourceStart, last=plan.sourceEnd, ppq=score.ticks_per_quarter;
  const meters=new Map([[0,{tick:0,numerator:4,denominator:4}]]);
  for(const event of score.events) if(event.message.type==='time_signature' && event.message.numerator>0 && event.message.denominator>0) meters.set(event.tick,{tick:event.tick,...event.message});
  const changes=[...meters.values()].sort((a,b)=>a.tick-b.tick), beats=[], origin=secondsAt(score,first);
  let entry=changes[0]; for(const meter of changes) if(meter.tick<=first) entry=meter;
  for(let i=0;i<changes.length;i++) {
    const meter=changes[i], end=Math.min(last,changes[i+1]?.tick??last);
    pulses(meter,ppq,Math.max(first,meter.tick),end,({tick,beat})=>{
      if(beats.length>=8192) throw new Error('Source passage exceeds 8,192 metronome pulses; choose a shorter passage.');
      beats.push({start:(secondsAt(score,tick)-origin)/speed,beat,tick});
    });
  }
  const tempo=score.tempo_map.filter(change=>change.tick<=first).at(-1), bar=ppq*4*entry.numerator/entry.denominator;
  const secondsPerTick=tempo.microseconds_per_quarter/1e6/ppq/speed, leadIn=bars*bar*secondsPerTick, countIn=[];
  if(bars) pulses(entry,ppq,first-bars*bar,first,({tick,beat})=>countIn.push({start:(tick-first)*secondsPerTick,beat,countIn:true}));
  return {beats:[...countIn,...beats],leadIn};
}
export class BeatCursor {
  start(beats,origin,position=-Infinity) {this.beats=beats; this.origin=origin; this.index=0; this.position=position;}
  pump(now,emit) {
    if(!this.beats) return;
    while(this.index<this.beats.length && this.origin+this.beats[this.index].start<now+.1) {
      const beat=this.beats[this.index++], time=this.origin+beat.start;
      if(beat.start<this.position-1e-7 || time<now-.03) continue;
      emit({...beat,time:Math.max(now,time)});
    }
  }
}
