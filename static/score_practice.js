import {authoredPlan} from './score_transport.js';

const serial=(input,pitch)=>input.attacks.get(pitch)?.pressSerial??0;
// A patient score clock: musical duration runs only while the current state is
// correct. Corrections re-anchor remaining time; they never make later notes late.
export class ScorePractice {
  constructor(score,{speed=1,tempoMode='score',policy='fingers',loop=false,start=0,end=score.moments.length-1}={}) {
    if(!['fingers','pedal'].includes(policy)) throw new Error('Unknown continuity policy.');
    if(!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end>=score.moments.length || start>=end) throw new Error('Invalid practice loop.');
    this.score=score; this.plan=authoredPlan(score,{speed,tempoMode}); this.policy=policy; this.loop=loop; this.start=start; this.end=end;
    this.notes=new Map(score.sounds.map(note=>[note.id,note]));
    this.points=score.moments.map((moment,index)=>({...moment,time:this.plan.moments[index].time}));
    const before=this.points[end];
    this.points[end]={...before,attacks:[],continuing:[],releases:[...new Set([...before.releases,...before.continuing])]};
    this.state='stopped'; this.index=start; this.credits=new Map(); this.counts={earlyRelease:0,extra:0}; this.faults=new Set(); this.cycles=0;
  }
  begin(input,now,index=this.start) {
    this.index=index; this.credits.clear(); this.baseline=new Map([...input.attacks].map(([pitch])=>[pitch,serial(input,pitch)]));
    this.remaining=0; this.last=now; this.state='entry'; this.result={ready:false,missing:[],release:[],early:[],extra:[]};
    return this.update(input,now);
  }
  stop() {this.state='stopped'; this.credits.clear();}
  pause() {if(!['stopped','ended'].includes(this.state)) this.state='paused';}
  resume(input,now) {return this.begin(input,now,this.index);}
  evaluate(input,entry=false) {
    const point=this.points[this.index], held=input.held, sounding=new Set([...held,...(this.policy==='pedal' ? input.sustained : [])]);
    const attacks=new Set(point.attacks), continuing=new Set(point.continuing);
    // Seeking into a tie deliberately asks for a new physical articulation.
    if(this.reenter) for(const id of continuing) attacks.add(id);
    const active=[...new Set([...attacks,...continuing])], expected=new Set(active.map(id=>this.notes.get(id).midi));
    const attackPitches=new Set([...attacks].map(id=>this.notes.get(id).midi));
    const coincidentAttacks=new Set(point.attacks.map(id=>this.notes.get(id).midi));
    const missing=[],early=[];
    for(const id of active) {
      const note=this.notes.get(id), pitch=note.midi, fresh=serial(input,pitch)>(this.baseline.get(pitch)??0);
      if(attacks.has(id)) {
        if(held.has(pitch) && fresh) this.credits.set(id,serial(input,pitch));
        if(!this.credits.has(id)) missing.push(id);
      }
      const credit=this.credits.get(id);
      if(credit!==undefined && (!sounding.has(pitch) || (!attackPitches.has(pitch) && serial(input,pitch)!==credit)) && !(continuing.has(id) && coincidentAttacks.has(pitch))) early.push(id);
      // A single physical attack can represent coincident unisons, but cannot
      // prove hand/finger identity. A repeat against a hold needs one new attack.
      if(credit!==undefined && held.has(pitch) && fresh) this.credits.set(id,serial(input,pitch));
    }
    const extra=[...held].filter(pitch=>!expected.has(pitch));
    const release=extra.filter(pitch=>point.releases.some(id=>this.notes.get(id).midi===pitch));
    const reset=this.index===this.end && (input.pedal || input.sustained.size>0);
    return {ready:!missing.length && !early.length && !extra.length && !reset,missing,early,extra,release,expected,entry,reset};
  }
  update(input,now) {
    if(!Number.isFinite(now) || (this.last!==undefined && now<this.last)) throw new Error('Practice needs a monotonic clock.');
    if(['stopped','paused','ended'].includes(this.state)) return this.result;
    if(this.state==='entry' || this.state==='loop-release') {
      this.last=now;
      if(input.held.size || input.sustained.size || input.pedal) return this.result={ready:false,missing:[],early:[],extra:[],release:[...new Set([...input.held,...input.sustained])],reset:true};
      this.baseline=new Map([...input.attacks].map(([pitch])=>[pitch,serial(input,pitch)])); this.reenter=true; this.state='waiting';
    }
    const elapsed=now-this.last; this.last=now;
    // Charge elapsed time against the previous valid snapshot, before applying
    // this event. MIDI adapters call update before and after changing ownership.
    if(this.state==='holding' && this.result.ready) this.remaining=Math.max(0,this.remaining-elapsed);
    if(this.state==='holding' && this.remaining<=1e-9) {
      this.index++; this.state='waiting'; this.reenter=false;
      this.baseline=new Map([...input.attacks].map(([pitch])=>[pitch,serial(input,pitch)]));
      for(const id of this.points[this.index].releases) this.credits.delete(id);
    }
    this.result=this.evaluate(input);
    const faults=new Set([...this.result.early.map(id=>'earlyRelease:'+id),...this.result.extra.filter(pitch=>!this.result.release.includes(pitch)).map(pitch=>'extra:'+pitch)]);
    for(const fault of faults) if(!this.faults.has(fault)) this.counts[fault.split(':')[0]]++;
    this.faults=faults;
    if(this.result.ready) {
      if(this.index===this.end) {
        if(this.loop) {this.cycles++; this.index=this.start; this.credits.clear(); this.state='loop-release'; this.result={...this.result,ready:false,reset:true};}
        else this.state='ended';
      } else if(this.state==='waiting') {
        this.remaining=this.points[this.index+1].time-this.points[this.index].time; this.state='holding';
      }
    }
    return this.result;
  }
}
