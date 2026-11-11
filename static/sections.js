import {attackGroups} from './outline.js';
// Suggested practice chunks, never a claim to recover compositional phrasing.
export function suggestPassages(score,{maximum=32,minimum=4}={}) {
  const groups=attackGroups(score); if(!groups.length) return [];
  maximum=Math.max(1,Math.min(512,Math.max(Math.trunc(maximum)||32,Math.ceil(groups.length/128))));
  minimum=Math.max(1,Math.min(maximum,Math.trunc(minimum)||4));
  const ppq=score.ticks_per_quarter||480, boundaries=new Map(), meters=[{tick:0,numerator:4,denominator:4}];
  const markers=[];
  for(const event of score.events||[]) {
    const m=event.message;
    if(m.type==='time_signature' && m.numerator>0 && m.denominator>0) meters.push({tick:event.tick,numerator:m.numerator,denominator:m.denominator});
    if(['marker','cue_marker','cue_point'].includes(m.type)) markers.push({tick:event.tick,text:String(m.text||'Marker').slice(0,80)});
  }
  meters.sort((a,b)=>a.tick-b.tick); markers.sort((a,b)=>a.tick-b.tick);
  let meter=0, marker=0, soundingEnd=0, unknown=false;
  groups.forEach((group,i)=>{
    while(meter+1<meters.length && meters[meter+1].tick<=group.tick) meter++;
    const signature=meters[meter], bar=ppq*4*signature.numerator/signature.denominator;
    while(marker<markers.length && markers[marker].tick<=group.tick) {
      if(i && markers[marker].tick>groups[i-1].tick) boundaries.set(i,'MIDI marker: '+markers[marker].text);
      marker++;
    }
    if(i && !boundaries.has(i)) {
      if(!unknown && group.tick-soundingEnd>=ppq/2) boundaries.set(i,'Rest gap');
      else if(Number.isInteger(bar) && (group.tick-signature.tick)%bar===0) boundaries.set(i,'Meter boundary');
    }
    for(const note of group.notes) {if(note.end_tick===null || note.end_tick===undefined) unknown=true; else soundingEnd=Math.max(soundingEnd,note.end_tick);}
  });
  const sections=[];
  for(let start=0;start<groups.length;) {
    let end=Math.min(groups.length,start+maximum), reason=end===groups.length ? 'End of piece' : 'Length limit';
    const chunkMinimum=Math.max(minimum,Math.ceil((groups.length-start)/(128-sections.length)));
    const candidates=[...boundaries].filter(([index])=>index>=start+chunkMinimum && index<=end);
    const strong=candidates.find(([,why])=>why!=='Meter boundary'), selected=strong||candidates.at(-1);
    if(selected && (end<groups.length || strong)) [end,reason]=selected;
    sections.push({start:start+1,end,label:`Section ${sections.length+1}`,reason,tick:groups[start].tick}); start=end;
  }
  return sections;
}
