import {planningControls} from './generation.js';
// Untimed reading measurements. No DOM, storage or device dependencies.
export class AttemptTracker {
  constructor({now=()=>globalThis.performance.now(),stamp=()=>new Date().toISOString()}={}) {this.now=now; this.stamp=stamp; this.active=null;}
  start(notes,context={}) {
    this.active=notes.length ? {notes:notes.map(n=>{const note={midi:n.midi,letter:n.letter,accidental:n.accidental,octave:n.octave,staff:n.staff}; for(const field of ['sourceTick','sourceOnset']) if(Number.isFinite(n[field])) note[field]=n[field]; return note;}),context:{...context},elapsed:0,started:this.now(),extras:new Set(),wrongPresses:0,wrongPitches:new Set(),candidate:null} : null;
  }
  pause() {const a=this.active; if (a && a.started!==null) {a.elapsed+=this.now()-a.started; a.started=null; a.candidate=null;}}
  resume() {const a=this.active; if (a && a.started===null) a.started=this.now();}
  observe(held) {
    const a=this.active; if (!a || a.started===null) return;
    const expected=new Set(a.notes.map(n=>n.midi));
    const extras=new Set([...held].filter(n=>!expected.has(n)));
    for (const pitch of extras) if (!a.extras.has(pitch)) {a.wrongPresses++; a.wrongPitches.add(pitch);}
    a.extras=extras;
    const complete=held.size===expected.size && [...expected].every(n=>held.has(n));
    if (!complete) a.candidate=null;
    else if (a.candidate===null) a.candidate=a.elapsed+this.now()-a.started;
  }
  finish() {
    const a=this.active; this.active=null;
    if (!a || a.started===null || a.candidate===null) return null;
    return {version:1,at:this.stamp(),responseMs:Math.max(0,a.candidate),wrongPresses:a.wrongPresses,firstAttemptCorrect:a.wrongPresses===0,wrongPitches:[...a.wrongPitches],notes:a.notes,context:a.context};
  }
}

export function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-1000).filter(r=>r && r.version===1 && typeof r.at==='string' && Number.isFinite(Date.parse(r.at)) && Number.isFinite(r.responseMs) && r.responseMs>=0 && r.responseMs<=86400000 && Number.isInteger(r.wrongPresses) && r.wrongPresses>=0 && typeof r.firstAttemptCorrect==='boolean' && Array.isArray(r.notes) && r.notes.length>0 && r.notes.length<=10 && r.notes.every(n=>n && typeof n.letter==='string' && Number.isInteger(n.midi) && n.midi>=0 && n.midi<=127 && 'CDEFGAB'.includes(n.letter) && n.letter.length===1 && Number.isInteger(n.octave) && [-2,-1,0,1,2].includes(n.accidental) && ['bass','treble'].includes(n.staff)) && r.context && typeof r.context==='object');
}
export function summary(records) {
  if (!records.length) return {count:0,mean:null,median:null,p90:null,accuracy:null};
  const times=records.map(r=>r.responseMs).sort((a,b)=>a-b);
  const middle=(times.length-1)/2;
  return {count:times.length,mean:times.reduce((a,b)=>a+b,0)/times.length,median:(times[Math.floor(middle)]+times[Math.ceil(middle)])/2,p90:times[Math.ceil(times.length*.9)-1],accuracy:records.filter(r=>r.firstAttemptCorrect).length/times.length};
}
export function exerciseIdentity(notes,settings,phrase) {
  const imported=settings.source==='midi';
  const fields=['hand','key','source','material','span','low','high','size','min-size','harmony-scale','hand-span','endAction'];
  if(imported) fields.push('scoreId','passage');
  else for(const field of [...planningControls,'advanced-kind']) if(settings[field]!==undefined) fields.push(field);
  if(settings.progression) fields.push('progression');
  if (settings.sax) {
    fields.push('tonality', 'leap');
    if (imported) fields.push('file-offset');
  }
  if(['triads','cadence'].includes(settings.source) && settings['harmony-kind']) fields.push('harmony-kind');
  if(settings.source==='cadence' && settings['cadence-shape']) fields.push('cadence-shape');
  return JSON.stringify([1,fields.map(field=>[field,settings[field]??null]),notes.map(n=>{const values=[n.midi,n.letter,n.accidental,n.octave,n.staff]; if(imported) values.push(n.sourceOnset); return values;}),settings.endAction==='repeat' && !imported ? phrase.map(chord=>chord.map(n=>n.midi)) : null]);
}
export function grouped(records,dimension) {
  const groups=new Map();
  for (const record of records) {
    if (['note','position','accidental'].includes(dimension) && record.notes.length!==1) continue;
    const note=record.notes[0];
    let key;
    if (dimension==='position') {
      const step=note.octave*7+'CDEFGAB'.indexOf(note.letter), bottom=note.staff==='bass' ? 18 : 30, top=bottom+8;
      const distance=step<bottom ? bottom-step : step>top ? step-top : 0;
      key=note.staff+': '+(distance ? (distance%2 ? 'space '+Math.ceil(distance/2) : 'ledger '+distance/2)+(step<bottom ? ' below' : ' above') : 'on staff');
    } else if (dimension==='note') key=note.letter+({'-2':'𝄫','-1':'♭',0:'',1:'♯',2:'𝄪'})[note.accidental]+note.octave;
    else if (dimension==='accidental') key=({'-2':'Double flat','-1':'Flat',0:'Natural',1:'Sharp',2:'Double sharp'})[note.accidental];
    else key=String(record.context[dimension] || 'Unknown');
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(record);
  }
  return [...groups].map(([label,rows])=>({label,...summary(rows)})).sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
}
export function daily(records) {
  const groups=new Map();
  for (const record of records) {const day=new Date(record.at).toISOString().slice(0,10); if (!groups.has(day)) groups.set(day,[]); groups.get(day).push(record);}
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).slice(-30).map(([day,rows])=>({day,...summary(rows)}));
}


export function dailyPlot(days) {
  if(!days.length) return [];
  const first=Date.parse(days[0].day), span=Math.max(1,Date.parse(days.at(-1).day)-first), peak=Math.max(1,...days.map(day=>day.median));
  return days.map(day=>({...day,x:days.length===1 ? 320 : 30+580*(Date.parse(day.day)-first)/span,y:110-90*day.median/peak}));
}


export function parseHistory(text) {
  if(typeof text!=='string' || text.length>16_000_000) throw new Error('History files must be no larger than 16 MB.');
  let value;
  try {value=JSON.parse(text);} catch {throw new Error('Invalid history JSON.');}
  if(!value || value.version!==1 || !Array.isArray(value.records)) throw new Error('Unsupported history format or version.');
  if(value.records.length>1000) throw new Error('A history file may contain at most 1,000 attempts.');
  const records=cleanHistory(value.records);
  if(records.length!==value.records.length || records.some(record=>record.firstAttemptCorrect!==(record.wrongPresses===0) || (record.context.identity!==undefined && (typeof record.context.identity!=='string' || record.context.identity.length>8000)) || record.notes.some(note=>12*(note.octave+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[note.letter]+note.accidental!==note.midi))) throw new Error('History contains an invalid attempt; nothing was imported.');
  return records;
}
export function mergeHistory(existing,incoming) {
  const merged=new Map();
  for(const record of [...existing,...incoming]) {
    const key=JSON.stringify([record.at,record.responseMs,record.wrongPresses,record.firstAttemptCorrect,record.notes.map(note=>[note.midi,note.letter,note.accidental,note.octave,note.staff,note.sourceOnset??null]),record.context.identity??null,record.wrongPitches??[]]);
    if(!merged.has(key)) merged.set(key,record);
  }
  return [...merged.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-1000);
}


export function readingPatterns(records) {
  const cohorts=new Map(), cache=new Map();
  for(const record of records) {
    if(record.notes.length!==1 || typeof record.context.identity!=='string') continue;
    const identity=record.context.identity;
    if(!cache.has(identity)) {
      let parsed;
      try {parsed=JSON.parse(identity);} catch {parsed=null;}
      cache.set(identity,Array.isArray(parsed) && parsed[0]===1 && Array.isArray(parsed[1]) && parsed[1].every(field=>Array.isArray(field) && field.length===2 && typeof field[0]==='string') ? {key:JSON.stringify([parsed[0],parsed[1],parsed[3]]),fields:new Map(parsed[1])} : null);
    }
    const context=cache.get(identity); if(!context) continue;
    if(!cohorts.has(context.key)) cohorts.set(context.key,{fields:context.fields,rows:[],notes:new Map()});
    const cohort=cohorts.get(context.key), note=record.notes[0];
    const key=JSON.stringify([note.letter,note.accidental,note.octave,note.staff]);
    cohort.rows.push(record);
    if(!cohort.notes.has(key)) cohort.notes.set(key,{note,rows:[]});
    cohort.notes.get(key).rows.push(record);
  }
  const result=[];
  for(const cohort of cohorts.values()) {
    const baseline=summary(cohort.rows).median;
    for(const {note,rows} of cohort.notes.values()) {
      if(rows.length<8) continue;
      const stats=summary(rows), corrected=rows.filter(record=>!record.firstAttemptCorrect).length, flags=[];
      if(corrected>=3) flags.push('Repeated corrections');
      if(cohort.rows.length>=24 && cohort.notes.size>=3 && stats.median>baseline*1.5+200) flags.push('Slower responses');
      if(!flags.length) continue;
      const fields=cohort.fields;
      result.push({note:note.letter+({'-2':'𝄫','-1':'♭',0:'',1:'♯',2:'𝄪'})[note.accidental]+note.octave,staff:note.staff,count:rows.length,corrected,median:stats.median,baseline,flags,
        context:{scoreTitle:cohort.rows[0].context.scoreTitle,passage:fields.get('passage'),key:fields.get('key'),hand:fields.get('hand'),source:fields.get('source'),harmonyKind:fields.get('harmony-kind'),harmonyScale:fields.get('harmony-scale'),cadenceShape:fields.get('cadence-shape'),mode:fields.get('endAction'),low:fields.get('low'),high:fields.get('high'),material:fields.get('material')}});
    }
  }
  return result.sort((a,b)=>b.corrected/b.count-a.corrected/a.count || b.median/b.baseline-a.median/a.baseline || b.count-a.count).slice(0,12);
}

// Calendar days follow the player's local timezone; the last hour is elapsed time.
export function clearHistoryPeriod(records,period,now=new Date()) {
  if(period==='all') return [];
  if(!['today','hour'].includes(period) || !Number.isFinite(+now)) throw new Error('Unknown history period.');
  const start=period==='hour' ? +now-3600000 : +new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return records.filter(record=>{const at=Date.parse(record.at); return at<start || at>+now || !Number.isFinite(at);});
}
