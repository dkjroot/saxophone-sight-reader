import {attackGroups} from './outline.js';

export function secondsAt(score,tick) {
  const map=score.tempo_map; let low=0, high=map.length;
  while(low<high) {const middle=(low+high)>>>1; if(map[middle].tick<=tick) low=middle+1; else high=middle;}
  const tempo=map[Math.max(0,low-1)];
  return tempo.seconds+(tick-tempo.tick)*tempo.microseconds_per_quarter/score.ticks_per_quarter/1_000_000;
}
export function referencePlan(score,{start=1,end=512,tracks=null}={},speed=1) {
  const groups=attackGroups(score);
  if(!groups.length) return {notes:[],duration:0};
  start=Math.max(1,Math.min(groups.length,Math.trunc(start)||1));
  end=Math.max(start,Math.min(groups.length,start+511,Math.trunc(end)||groups.length));
  const first=groups[start-1].tick, last=groups[end]?.tick??score.duration_ticks;
  speed=Math.max(.25,Math.min(2,Number(speed)||1));
  const included=tracks ? new Set(tracks.filter(rule=>rule.enabled).map(rule=>rule.track)) : null;
  const voices=new Map(), held=new Map(), pedal=new Set(), spans=[];
  const close=(voice,tick)=>{voice.end=tick; voices.delete(voice.id);};
  const release=(voice,tick)=>{voice.released=true; if(!pedal.has(voice.channel)) close(voice,tick);};
  for(const event of score.events) {
    if(event.tick>=last) break;
    const message=event.message, channel=message.channel;
    if(channel===9) continue;
    if(message.type==='control_change') {
      if(message.control===64 || message.control===121) {
        if(message.control===64 && message.value>=64) pedal.add(channel);
        else {pedal.delete(channel); for(const voice of [...voices.values()]) if(voice.channel===channel && voice.released) close(voice,event.tick);}
      }
      if(message.control===120 || message.control===123) {
        for(const voice of [...voices.values()]) if(voice.channel===channel) {
          if(message.control===120) close(voice,event.tick); else release(voice,event.tick);
        }
        for(const [key,queue] of held) if(queue[0]?.channel===channel) held.delete(key);
      }
      continue;
    }
    if(included && !included.has(event.track)) continue;
    if(!['note_on','note_off'].includes(message.type)) continue;
    const key=`${event.track}:${channel}:${message.note}`;
    if(message.type==='note_on' && message.velocity>0) {
      const voice={id:`t${event.track}:n${event.index}`,pitch:message.note,velocity:message.velocity,channel,start:event.tick,end:null,released:false};
      voices.set(voice.id,voice); spans.push(voice);
      if(!held.has(key)) held.set(key,[]); held.get(key).push(voice);
    } else {
      const voice=held.get(key)?.shift(); if(voice && voices.has(voice.id)) release(voice,event.tick);
    }
  }
  // A passage boundary is a transport stop, not an invented physical note-off.
  for(const voice of voices.values()) voice.end=last;
  const origin=secondsAt(score,first);
  const notes=spans.filter(voice=>voice.start<last && voice.end>Math.max(first,voice.start)).map(voice=>({id:voice.id,pitch:voice.pitch,velocity:voice.velocity,start:(secondsAt(score,Math.max(first,voice.start))-origin)/speed,end:(secondsAt(score,voice.end)-origin)/speed}));
  const edges=notes.flatMap(note=>[[note.start,1],[note.end,-1]]).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  let simultaneous=0; for(const [,change] of edges) {simultaneous+=change; if(simultaneous>128) throw new Error('Source passage exceeds 128 simultaneous playback voices.');}
  return {notes,duration:Math.max(0,(secondsAt(score,last)-origin)/speed),sourceStart:first,sourceEnd:last};
}
export class PlaybackCursor {
  constructor() {this.state='stopped'; this.position=0; this.plan=null;}
  play(plan,now,position=0,{loop=false}={}) {
    this.plan=plan; this.position=Math.max(0,Math.min(plan.duration,position));
    this.origin=now+.03-this.position; this.index=0; this.cycle=0; this.loop=loop && plan.duration>0; this.state='playing';
  }
  at(now) {if(this.state!=='playing') return this.position; const elapsed=Math.max(this.position,now-this.origin); return this.loop?elapsed%this.plan.duration:Math.min(this.plan.duration,elapsed);}
  pause(now) {if(this.state==='playing') {this.position=this.at(now); this.state='paused';}}
  stop() {this.position=0; this.index=0; this.state='stopped';}
  pump(now,emit) {
    if(this.state!=='playing') return;
    const position=Math.max(this.position,now-this.origin), duration=this.plan.duration;
    if(!this.loop && position>=duration) {this.position=duration; this.state='ended'; return;}
    if(this.loop && this.cycle<Math.floor(position/duration)) {this.cycle=Math.floor(position/duration); this.index=0;}
    let budget=this.loop?512:Infinity;
    while(this.index<this.plan.notes.length && budget-->0) {
      const note=this.plan.notes[this.index], offset=this.loop?this.cycle*duration:0;
      if(this.origin+offset+note.start>=now+.1) break;
      this.index++;
      if(this.loop && this.index===this.plan.notes.length) {this.index=0; this.cycle++;}
      const start=Math.max(offset+note.start,this.position,position), end=offset+note.end;
      if(end<=start) continue;
      emit({...note,id:this.loop?note.id+':cycle:'+offset/duration:note.id,time:Math.max(now,this.origin+start),duration:end-start});
    }
  }
}
