// Portable local passage metadata, without storing music files.
export function passageKey(passage) {return JSON.stringify([passage.hash,passage.start,passage.end,[...passage.tracks].sort((a,b)=>a.track-b.track).map(rule=>[rule.track,rule.enabled,rule.staff])]);}
export function cleanPassages(value) {
  if(!Array.isArray(value)) return [];
  return value.slice(-50).filter(p=>p && p.version===1 && typeof p.hash==='string' && /^[a-f0-9]{64}$/.test(p.hash) && typeof p.label==='string' && p.label.trim().length>0 && p.label.length<=80 && typeof p.filename==='string' && p.filename.length<=255 && Number.isInteger(p.start) && Number.isInteger(p.end) && p.start>=1 && p.end>=p.start && p.end<=25000 && p.end-p.start<512 && typeof p.updatedAt==='string' && Number.isFinite(Date.parse(p.updatedAt)) && Array.isArray(p.tracks) && p.tracks.length>0 && p.tracks.length<=64 && p.tracks.every(rule=>rule && Number.isInteger(rule.track) && rule.track>=0 && rule.track<64 && typeof rule.enabled==='boolean' && ['auto','treble','bass'].includes(rule.staff)) && new Set(p.tracks.map(rule=>rule.track)).size===p.tracks.length && p.tracks.some(rule=>rule.enabled)).map(p=>({version:1,hash:p.hash,label:p.label.trim(),filename:p.filename,start:p.start,end:p.end,updatedAt:p.updatedAt,tracks:p.tracks.map(rule=>({track:rule.track,enabled:rule.enabled,staff:rule.staff}))}));
}
export function parsePassages(text) {
  if(typeof text!=='string' || text.length>500000) throw new Error('Saved passage data is too large.');
  const value=JSON.parse(text);
  if(!Array.isArray(value)) throw new Error('Saved passage format is invalid.');
  return cleanPassages(value);
}
export function savePassage(passages,entry) {
  const clean=cleanPassages([entry]);
  if(!clean.length) throw new Error('Invalid passage name, range or track choices.');
  const key=passageKey(clean[0]);
  return [...cleanPassages(passages).filter(item=>passageKey(item)!==key),clean[0]].slice(-50);
}
