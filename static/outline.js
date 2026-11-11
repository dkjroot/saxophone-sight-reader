import {candidates,spellChord} from './core.js';
import {filePitchOffset, inSaxRange, saxNote, writtenPitch} from './saxophone.js';
import {reduceAttack} from './passage_filters.js';

export function attackGroups(score) {
  const groups=new Map();
  for(const note of score?.notes||[]) {
    if(note.channel===9) continue; // Preserve percussion in the inspection, outside pitched practice.
    if(!groups.has(note.start_tick)) groups.set(note.start_tick,[]);
    groups.get(note.start_tick).push(note);
  }
  return [...groups].sort(([a],[b])=>a-b).map(([tick,notes])=>({tick,notes}));
}
export function makeOutline(score,settings,{start=1,end=512,tracks=null}={}) {
  const groups=attackGroups(score);
  start=Math.max(1,Math.min(groups.length,Math.trunc(start)||1));
  end=Math.max(start,Math.min(groups.length,start+511,Math.trunc(end)||groups.length));
  if (settings.sax) return saxOutline(groups, settings, start, end, tracks, filePitchOffset(score, settings));
  const pool=new Set(candidates(settings));
  const assignedPool=new Set(candidates({...settings,hand:'both'}));
  const policies=tracks ? new Map(tracks.map(rule=>[rule.track,rule])) : null;
  const staffFor=note=>{
    const explicit=policies?.get(note.track)?.staff;
    return ['treble','bass'].includes(explicit) ? explicit : settings.hand==='left' || (settings.hand==='both' && note.midi<60) ? 'bass' : 'treble';
  };
  const eligible=note=>{
    const rule=policies?.get(note.track);
    if(policies && !rule?.enabled) return false;
    if(rule && ['treble','bass'].includes(rule.staff)) return assignedPool.has(note.midi) && (settings.hand==='both' || staffFor(note)===(settings.hand==='left' ? 'bass' : 'treble'));
    return pool.has(note.midi);
  };
  const targets=[], previous={}; let retained=0, considered=0;
  for(let index=start-1;index<end && index<groups.length;index++) {
    const group=groups[index], included=group.notes.filter(eligible);
    const pitches=[...new Set(included.map(n=>n.midi))].sort((a,b)=>a-b);
    considered+=group.notes.length;
    const priority=[];
    // Melody, bass, then inner notes. Never add pitches absent from the source.
    if(pitches.length) priority.push(pitches.at(-1));
    if(pitches.length>1) priority.push(pitches[0]);
    priority.push(...pitches.slice(1,-1).reverse());
    const selected=[];
    for(const pitch of priority) {
      if(selected.length>=Math.max(1,Math.min(10,+settings.size||1))) break;
      if(spellChord([...selected,pitch],settings.material==='flats',settings.key)) selected.push(pitch);
    }
    if(!selected.length) continue;
    const spelled=spellChord(selected,settings.material==='flats',settings.key);
    const written=reduceAttack(spelled.map(note=>({...note,staff:staffFor(included.find(original=>original.midi===note.midi))})),settings,previous);
    if(!written.length) continue;
    targets.push(written.map(note=>{
      const originals=included.filter(n=>n.midi===note.midi), ids=originals.map(n=>n.id); retained+=ids.length;
      return {...note,staff:staffFor(originals[0]),sourceTick:group.tick,sourceOnset:index+1,sourceIds:ids};
    }));
  }
  return {targets,totalOnsets:groups.length,start,end,retainedNotes:retained,omittedNotes:considered-retained};
}


function saxOutline(groups, settings, start, end, tracks, offset) {
  const enabled = tracks && new Set(tracks.filter(track => track.enabled).map(track => track.track));
  const targets = [];
  let considered = 0;
  for (let index = start - 1; index < end && index < groups.length; index++) {
    const group = groups[index];
    let highest = null, pitch = -1;
    for (const note of group.notes) {
      considered++;
      if (enabled && !enabled.has(note.track)) continue;
      const written = writtenPitch(note.midi, offset);
      if (written > pitch && inSaxRange(written, settings)) {
        highest = note;
        pitch = written;
      }
    }
    if (highest) targets.push([{
      ...saxNote(pitch, settings), sourceTick: group.tick, sourceOnset: index + 1, sourceIds: [highest.id],
    }]);
  }
  return {targets, totalOnsets: groups.length, start, end, retainedNotes: targets.length, omittedNotes: considered - targets.length};
}
