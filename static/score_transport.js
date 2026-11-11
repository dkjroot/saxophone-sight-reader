import {beat,addBeat,compareBeat} from './score_model.js';

function timing(score,tempoMode='score') {
  if(!['score','steady'].includes(tempoMode)) throw new Error('Unknown tempo policy.');
  // Linear means BPM linear in score beats, not seconds. Integrate 60/BPM
  // analytically so seeking/cuts and full playback share the same clock.
  const interval=(tempo,next,distance)=>{
    const length=distance[0]/distance[1];
    if(tempoMode==='steady') return length*60/score.tempos[0].bpm;
    if(tempo.curve!=='linear' || !next) return length*60/tempo.bpm;
    const span=addBeat(next.at,[-tempo.at[0],tempo.at[1]]), slope=(next.bpm-tempo.bpm)/(span[0]/span[1]);
    return slope===0?length*60/tempo.bpm:60*Math.log1p(slope*length/tempo.bpm)/slope;
  };
  let elapsed=0;
  const map=score.tempos.map((tempo,index)=>{
    if(index) {const previous=score.tempos[index-1], distance=addBeat(tempo.at,[-previous.at[0],previous.at[1]]); elapsed+=interval(previous,tempo,distance);}
    return {...tempo,seconds:elapsed};
  });
  return at=>{
    at=beat(at);
    if(compareBeat(at,[0,1])<0 || compareBeat(at,score.duration)>0) throw new Error('Playback beat is outside the score.');
    let low=0,high=map.length;
    while(low<high) {const middle=(low+high)>>>1; if(compareBeat(map[middle].at,at)<=0) low=middle+1; else high=middle;}
    const tempo=map[Math.max(0,low-1)], distance=addBeat(at,[-tempo.at[0],tempo.at[1]]);
    return tempo.seconds+interval(tempo,map[low],distance);
  };
}
export function scoreSecondsAt(score,at,options={}) {return timing(score,options.tempoMode)(at);}
// Convert only at the audio-clock boundary. Original rational notation stays intact.
export function authoredPlan(score,{speed=1,start=[0,1],end=score.duration,voices=null,tempoMode='score'}={}) {
  start=beat(start); end=beat(end);
  if(compareBeat(start,[0,1])<0 || compareBeat(end,score.duration)>0 || compareBeat(start,end)>=0) throw new Error('Invalid authored playback range.');
  speed=Math.max(.25,Math.min(2,Number(speed)||1));
  const seconds=timing(score,tempoMode), origin=seconds(start), selected=voices ? new Set(voices) : null;
  const damper=(score.pedals??[]).filter(event=>event.controller===64);
  const soundingEnd=note=>{
    if(note.playbackEnd) return note.playbackEnd;
    const down=damper.filter(event=>compareBeat(event.at,note.end)<=0).at(-1)?.value>=64;
    return down ? damper.find(event=>compareBeat(event.at,note.end)>0 && event.value<64)?.at??score.duration : note.end;
  };
  const notes=score.sounds.map(note=>({...note,soundingEnd:soundingEnd(note)})).filter(note=>(!selected || selected.has(note.voiceId)) && compareBeat(note.start,end)<0 && compareBeat(note.soundingEnd,start)>0).map(note=>({
    id:note.id,pitch:note.midi,voiceId:note.voiceId,velocity:80,
    start:(seconds(compareBeat(note.start,start)<0 ? start : note.start)-origin)/speed,
    end:(seconds(compareBeat(note.soundingEnd,end)>0 ? end : note.soundingEnd)-origin)/speed,
    notatedEnd:(seconds(compareBeat(note.end,start)<0?start:note.end)-origin)/speed,
    sourceIds:[...note.segments]
  })).sort((a,b)=>a.start-b.start || a.pitch-b.pitch || a.id.localeCompare(b.id));
  const edges=notes.flatMap(note=>[[note.start,1],[note.end,-1]]).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  let held=0; for(const [,change] of edges) {held+=change; if(held>128) throw new Error('Authored playback exceeds 128 simultaneous voices.');}
  const moments=score.moments.map((moment,index)=>({index,time:(seconds(moment.at)-origin)/speed})).filter(moment=>moment.time>=0 && moment.time<=(seconds(end)-origin)/speed);
  return {notes,moments,duration:(seconds(end)-origin)/speed,sourceStart:start,sourceEnd:end};
}
