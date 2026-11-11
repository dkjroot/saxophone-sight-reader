import {attackGroups,makeOutline} from './outline.js';
import {compileScore} from './score_model.js';
import {KEYS} from './core.js';
import {writtenKey} from './score_key.js';
import {filePitchOffset} from './saxophone.js';
import {filterStudy} from './passage_filters.js';

// A separate, explicit derivation. Raw ticks, controllers, note IDs and hashes
// remain in the inspection. Notation uses a 1/32 grid; no source attack is merged.
export function midiStudy(inspection,settings,bounds={},title='MIDI passage') {
  const outline=makeOutline(inspection,settings,bounds), byId=new Map(inspection.notes.map(note=>[note.id,note]));
  if(!outline.targets.length) throw new Error('No retained notes in this passage.');
  const groups=attackGroups(inspection), origin=groups[outline.start-1].tick, resolution=inspection.ticks_per_quarter;
  const stop=groups[outline.end]?.tick??inspection.duration_ticks;
  const position=tick=>Math.round((tick-origin)*8/resolution), rows=[];
  const controllers=(inspection.events??[]).filter(event=>event.message.type==='control_change');
  let previousEnd = -1, previousStart = -1;
  for(const target of outline.targets) for(const written of target) for(const id of written.sourceIds) {
    const source=byId.get(id);
    if(!Number.isSafeInteger(source.end_tick)) throw new Error('This passage contains a note without a source release; choose a complete passage.');
    const start=position(source.start_tick), end=Math.min(position(stop),Math.max(start+1,position(source.end_tick)));
    if(end<=start) throw new Error('This cut is shorter than the notation grid; choose a wider passage.');
    if (settings.sax) {
      if (start === previousStart) throw new Error('Separate attacks fall inside one notation-grid cell; use Pitch practice or choose a slower passage.');
      if (start < previousEnd) continue;
      previousStart = start;
      previousEnd = end;
      rows.push({source, written, start, end, soundEnd:end});
      continue;
    }
    const channelEvents=controllers.filter(event=>event.message.channel===source.channel);
    let down=false;
    for(const event of channelEvents) if(event.tick<=source.end_tick) {
      if(event.message.control===64) down=event.message.value>=64;
      if([120,121].includes(event.message.control)) down=false;
    }
    const pedalEnd=down?channelEvents.find(event=>event.tick>source.end_tick && ([120,121].includes(event.message.control) || event.message.control===64 && event.message.value<64))?.tick??stop:source.end_tick;
    const attackIndex=Number(source.id.split(':n')[1]);
    const panic=channelEvents.find(event=>event.message.control===120 && (event.tick>source.start_tick || event.tick===source.start_tick && (event.track>source.track || event.track===source.track && event.index>attackIndex)))?.tick??stop;
    const soundEnd=Math.max(start+1,position(Math.min(stop,pedalEnd,panic)));
    rows.push({source,written,start,end,soundEnd});
  }
  if(rows.length>1024) throw new Error('Choose a shorter study passage (up to 1,024 retained source notes).');
  rows.sort((a,b)=>a.start-b.start || a.source.start_tick-b.source.start_tick || a.source.midi-b.source.midi);
  const onset=new Map();
  for(const row of rows) {
    const key=row.start+':'+row.source.midi, before=onset.get(key);
    if(before!==undefined && before!==row.source.start_tick) throw new Error('Separate repeated attacks fall inside one notation-grid cell; choose a less densely articulated passage.');
    onset.set(key,row.source.start_tick);
  }
  // Coincident pitches with the same release form a chord, not one voice per
  // finger. Different releases and repeated/unison source attacks remain separate.
  const chords=[];
  for(const row of rows) {
    const staff=row.written.staff==='bass'?'lower':'upper';
    let chord=chords.find(chord=>chord.staff===staff && chord.start===row.start && chord.end===row.end && chord.rows.every(other=>other.source.midi!==row.source.midi && other.written.letter+other.written.octave!==row.written.letter+row.written.octave));
    if(!chord) {chord={staff,start:row.start,end:row.end,rows:[]}; chords.push(chord);}
    chord.rows.push(row);
  }
  chords.sort((a,b)=>a.start-b.start || Math.max(...b.rows.map(row=>row.source.midi))-Math.max(...a.rows.map(row=>row.source.midi)));
  const voices=[];
  for(const chord of chords) {
    const centre=chord.rows.reduce((sum,row)=>sum+row.source.midi,0)/chord.rows.length;
    const available=voices.filter(voice=>voice.staff===chord.staff && voice.end<=chord.start);
    available.sort((a,b)=>Math.abs(a.centre-centre)-Math.abs(b.centre-centre));
    let voice=available[0];
    if(!voice) {voice={id:'derived-voice-'+voices.length,staff:chord.staff,end:0,rows:[]}; voices.push(voice);}
    if(voices.length>16) throw new Error('This passage needs more than 16 notated voices; reduce its density or select a shorter passage.');
    voice.rows.push(chord); voice.end=chord.end; voice.centre=centre;
  }
  for(const staff of ['upper','lower']) {
    const lanes=voices.filter(voice=>voice.staff===staff).sort((a,b)=>b.rows.reduce((sum,chord)=>sum+Math.max(...chord.rows.map(row=>row.source.midi)),0)/b.rows.length-a.rows.reduce((sum,chord)=>sum+Math.max(...chord.rows.map(row=>row.source.midi)),0)/a.rows.length);
    lanes.forEach((voice,index)=>{voice.stem=lanes.length===1?undefined:index===0?'up':'down';});
  }
  const events=inspection.events??[], meterEvents=events.filter(event=>event.message.type==='time_signature').sort((a,b)=>a.tick-b.tick);
  const meterAt=tick=>meterEvents.filter(event=>event.tick<=tick).at(-1)??{tick:0,message:{numerator:4,denominator:4}};
  const keyAt=tick=>{
    const markers=events.filter(event=>event.message.type==='key_signature' && event.tick<=tick);
    const latest=markers.at(-1)?.tick, keys=new Set(markers.filter(event=>event.tick===latest).map(event=>event.message.key));
    const raw=keys.size===1?[...keys][0]:null;
    const minor=['Am','Em','Bm','F#m','C#m','G#m','D#m','A#m','Dm','Gm','Cm','Fm','Bbm','Ebm','Abm'];
    const sourceKey = KEYS.some(key => key.id === raw) ? raw : minor.includes(raw) ? KEYS[minor.indexOf(raw)].id : null;
    return writtenKey(sourceKey, filePitchOffset(inspection, settings)) ?? settings.key;
  };
  const duration=Math.max(...rows.flatMap(row=>[row.end,row.soundEnd])), measures=[], ties=[], lastNote=new Map(); let at=0, serial=0;
  const values=[[48,'w',1],[32,'w',0],[28,'h',2],[24,'h',1],[16,'h',0],[14,'q',2],[12,'q',1],[8,'q',0],[7,'8',2],[6,'8',1],[4,'8',0],[3,'16',1],[2,'16',0],[1,'32',0]];
  while(at<duration) {
    if(measures.length>=256) throw new Error('Choose a passage of at most 256 measures.');
    const absolute=origin+at*resolution/8, signature=meterAt(absolute), meter=[signature.message.numerator,signature.message.denominator];
    const full=meter[0]*32/meter[1];
    if(!Number.isInteger(full) || full<1) throw new Error('This meter is outside the study notation grid.');
    const since=(absolute-signature.tick)*8/resolution, remainder=((Math.round(since)%full)+full)%full;
    const change=meterEvents.find(event=>event.tick>absolute);
    const end=Math.min(duration,at+full-remainder,change?Math.max(at+1,position(change.tick)):Infinity);
    const measure={id:'derived-bar-'+measures.length,meter,key:keyAt(absolute),length:[end-at,8],pickup:false,beatOffset:[remainder,8],events:[]};
    for(const voice of voices) {
      let cursor=at;
      while(cursor<end) {
        const row=voice.rows.find(row=>row.start<=cursor && row.end>cursor), next=voice.rows.find(row=>row.start>cursor);
        const finish=Math.min(end,row?.end??next?.start??end);
        const [units,value,dots]=values.find(([units])=>units<=finish-cursor), id='derived-event-'+serial++;
        const notes=(row?.rows??[]).map((member,index)=>({id:id+'-note-'+index,letter:member.written.letter,octave:member.written.octave,accidental:member.written.accidental,playbackEnd:lastNote.has(member.source.id)?undefined:[member.soundEnd,8],sourceIds:[member.source.id],sourceStart:member.source.start_tick,sourceEnd:member.source.end_tick,sourceTrack:member.source.track,sourceChannel:member.source.channel}));
        measure.events.push({id,voice:voice.id,at:[cursor-at,8],value,dots,kind:row?'note':'rest',notes});
        if(row) row.rows.forEach((member,index)=>{const note=notes[index]; if(lastNote.has(member.source.id)) ties.push({from:lastNote.get(member.source.id),to:note.id}); lastNote.set(member.source.id,note.id);});
        cursor+=units;
      }
    }
    measures.push(measure); at=end;
  }
  const tempos=new Map([['0',{at:[0,1],bpm:60_000_000/(inspection.tempo_map.filter(tempo=>tempo.tick<=origin).at(-1)?.microseconds_per_quarter??500000)}]]);
  for(const tempo of inspection.tempo_map) {const point=position(tempo.tick); if(point>0 && point<duration) tempos.set(String(point),{at:[point,8],bpm:60_000_000/tempo.microseconds_per_quarter});}
  const source={version:1,id:'midi-derived-study',title,staves:settings.sax ? [{id:'upper',clef:'treble'}] : [{id:'upper',clef:'treble'},{id:'lower',clef:'bass'}],voices:voices.map(({id,staff,stem})=>({id,staff,stem})),measures,ties,tempos:[...tempos.values()],provenance:{kind:'midi-derived',sha256:inspection.sha256,bounds:{start:outline.start,end:outline.end},grid:[1,8],spelling:settings.sax ? 'selected key and file pitch mapping' : 'selected key and explicit track staff choices',voices:settings.sax ? 'one retained melody line' : 'derived chord and duration lanes, not recovered hands',retainedNotes:rows.length,omittedNotes:outline.omittedNotes + outline.retainedNotes - rows.length,sourceOriginTick:origin,sourceEndTick:stop}};
  return filterStudy(compileScore(source),settings);
}
