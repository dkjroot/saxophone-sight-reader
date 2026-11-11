import {match} from './core.js';
// Every untimed target is a new articulation; authored ties will be separate events.
const pressSerial=attack=>attack?.pressSerial??attack?.serial??0;
// Only notes from the immediately previous target can overlap its successor.
export class FlowGate {
  start(target,previous,held,attacks) {
    this.target=target; this.baseline=new Map([...attacks].map(([pitch,attack])=>[pitch,pressSerial(attack)]));
    const pitches=new Set(target.map(note=>note.midi)), before=new Set(previous.map(note=>note.midi));
    this.retiring=new Map([...held].filter(pitch=>before.has(pitch) && !pitches.has(pitch)).map(pitch=>[pitch,attacks.get(pitch)?.serial||0]));
  }
  evaluate(held,attacks) {
    for(const [pitch,serial] of this.retiring) if(!held.has(pitch) || (attacks.get(pitch)?.serial||0)>serial) this.retiring.delete(pitch);
    const effective=new Set([...held].filter(pitch=>!this.retiring.has(pitch))), result=match(this.target,effective);
    const fresh=this.target.map(note=>pressSerial(attacks.get(note.midi))>(this.baseline.get(note.midi)||0));
    const accepted=new Set(this.target.filter((note,index)=>effective.has(note.midi) && fresh[index]).map(note=>note.midi));
    return {...result,effective,accepted,ready:result.complete && fresh.every(Boolean)};
  }
}
