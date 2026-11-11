import {beatGroupAt} from './meter.js';
import {compareBeat} from './score_model.js';
import {noteName,keyAlterations,staffStep} from './core.js';

const accidental={[-2]:'bb',[-1]:'b',0:'',1:'#',2:'##'};
// VexFlow runs only when laying out an authored score, never on the MIDI input path.
export class ScoreEngraver {
  constructor(container,engine=globalThis.VexFlow) {this.container=container; this.engine=engine; this.nodes=new Map(); this.active=new Map(); this.onSelect=()=>{}; this.renderCount=0;}
  draw(score,{barsPerLine='auto'}={}) {
    this.barsPerLine=[1,2,3,4].includes(+barsPerLine)?+barsPerLine:null;
    const V=this.engine;
    if(!V) throw new Error('The local notation engine is unavailable.');
    if (score.staves.length > 2) throw new Error('The renderer supports up to two staves.');
    this.score=score; this.nodes.clear(); this.active.clear(); this.container.replaceChildren(); this.pageCount=0;
    this.columns=this.barsPerLine??(this.container.clientWidth>=1000 ? 2 : 1);
    const pageSize=Math.floor(8/this.columns)*this.columns;
    for(let offset=0;offset<score.measures.length;offset+=pageSize) this.drawPage(score,score.measures.slice(offset,offset+pageSize),offset);
    this.positions=score.moments.map(moment=>{
      const roles=new Map();
      for(const [ids,role] of [[moment.attacks,'starting'],[moment.continuing,'continuing']]) for(const id of ids) {
        const sound=score.sounds.find(sound=>sound.id===id);
        const segment=sound.segments.map(id=>score.notes.find(note=>note.id===id)).find(note=>compareBeat(note.start,moment.at)<=0 && compareBeat(moment.at,note.end)<0);
        if(segment) roles.set(segment.id,role);
      }
      return roles;
    });
    this.renderCount++; this.container.dataset.renders=String(this.renderCount);
    return this.container.querySelector('svg');
  }
  drawPage(score,measures,offset) {
    const V=this.engine;
    const width=Math.max(1,this.container.clientWidth), columns=this.columns, measureWidth=(width-30)/columns;
    const above=[0,0],below=[0,0]; let nesting=0;
    for(const measure of measures) for(const event of measure.events) {
      const staffIndex=score.staves.findIndex(staff=>staff.id===event.staffId), treble=measure.clefs[event.staffId]==='treble';
      const top=treble?38:26, bottom=treble?30:18;
      for(const note of event.notes) {above[staffIndex]=Math.max(above[staffIndex],(staffStep(note)-top)*5); below[staffIndex]=Math.max(below[staffIndex],(bottom-staffStep(note))*5);}
      nesting=Math.max(nesting,event.tuplets.length);
    }
    const staffDistance=120+above[1]+below[0], topMargin=50+above[0]+nesting*20;
    const single = score.staves.length === 1;
    const rowHeight = single ? 122 + above[0] + below[0] + nesting * 20 : Math.max(300, staffDistance + 100 + above[0] + below[1] + nesting * 20);
    const height=Math.ceil(measures.length/columns)*rowHeight+topMargin+(single ? below[0] : below[1])+20;
    const page=document.createElement('div'); page.id=this.container.id+'-page-'+offset; page.className='score-page'; page.dataset.barsPerLine=columns; this.container.append(page);
    const factory=new V.Factory({renderer:{elementId:page.id,width,height}});
    const context=factory.getContext(); context.setFillStyle('currentColor'); context.setStrokeStyle('currentColor');
    const noteToEvent=new Map(), pedalAnchors=[], tempoAnchors=[];
    for(const [index,measure] of measures.entries()) {
      const system=factory.System({x:15+(index%columns)*measureWidth,y:topMargin+Math.floor(index/columns)*rowHeight,width:measureWidth,spaceBetweenStaves:staffDistance/10,formatOptions:{alignRests:true},formatIterations:2});
      const row=Math.floor(index/columns), byVoice=new Map(), tuples=new Map();
      for(const voice of score.voices) {
        const events=measure.events.filter(event=>event.voiceId===voice.id).sort((a,b)=>compareBeat(a.start,b.start));
        const staveNotes=events.map(event=>{
          const staff=score.staves.find(staff=>staff.id===event.staffId);
          const clef=measure.clefs[staff.id];
          const keys=event.kind==='rest' ? [clef==='bass' ? 'd/3' : 'b/4'] : event.notes.map(note=>`${note.letter.toLowerCase()}${accidental[note.accidental]}/${note.octave}`);
          const node=factory.StaveNote({clef,keys,duration:event.value+'d'.repeat(event.dots??0)+(event.kind==='rest' ? 'r' : ''),autoStem:!voice.stem,stemDirection:voice.stem==='down' ? V.Stem.DOWN : V.Stem.UP});
          for(let dot=0;dot<(event.dots??0);dot++) V.Dot.buildAndAttach([node],{all:true});
          event.notes.forEach((note,keyIndex)=>noteToEvent.set(note.id,{node,event,keyIndex,row}));
          for(const rule of event.tuplets) {if(!tuples.has(rule.group)) tuples.set(rule.group,[]); tuples.get(rule.group).push({node,event,rule});}
          return node;
        });
        byVoice.set(voice.id,{voice:factory.Voice({time:{numBeats:measure.length[0],beatValue:measure.length[1]*4}}),notes:staveNotes,events});
      }
      for(const group of tuples.values()) {
        const rule=group[0].rule;
        factory.Tuplet({notes:group.map(item=>item.node),options:{numNotes:rule.actual,notesOccupied:rule.normal,bracketed:true,ratioed:rule.actual!==3 || rule.normal!==2}});
        if(group.every(item=>item.event.kind==='note' && +item.event.value>=8 && item.event.tuplets.length===1)) factory.Beam({notes:group.map(item=>item.node)});
      }
      for(const line of byVoice.values()) {
        line.voice.addTickables(line.notes);
        let beam=[], beatGroup=null;
        const flush=()=>{if(beam.length>1) factory.Beam({notes:beam}); beam=[];};
        line.events.forEach((event,i)=>{
          const group=beatGroupAt(event.at,measure);
          if(event.kind!=='note' || event.tuplets.length || !(+event.value>=8)) {flush(); beatGroup=null; return;}
          if(group!==beatGroup) flush(); beatGroup=group; beam.push(line.notes[i]);
        });
        flush();
      }
      const staveById=new Map();
      for(const staff of score.staves) {
        const voices=score.voices.filter(voice=>voice.staff===staff.id).map(voice=>byVoice.get(voice.id).voice);
        const stave=system.addStave({voices});
        // VexFlow defaults ledger lines to fixed #444, nearly invisible on our
        // dark paper. Keep them in the same theme ink as the written notes.
        stave.setDefaultLedgerLineStyle({strokeStyle:'currentColor',lineWidth:2});
        staveById.set(staff.id,stave);
        const previous=score.measures[offset+index-1];
        if(index%columns===0 || measure.clefs[staff.id]!==previous?.clefs[staff.id]) stave.addClef(measure.clefs[staff.id]);
        if(index%columns===0 || measure.key!==previous?.key) stave.addKeySignature(measure.key,measure.key!==previous?.key?previous?.key:undefined);
        if(!index || measure.meter.join('/')!==previous?.meter.join('/')) stave.addTimeSignature(measure.meter.join('/'));
        if(measure.boundary) stave.setEndBarType({single:V.Barline.type.SINGLE,double:V.Barline.type.DOUBLE,final:V.Barline.type.END}[measure.boundary]);
      }
      // System assigns the home stave initially; individual tickables can move
      // to the authored destination without changing voice, hand or score time.
      for(const line of byVoice.values()) {
        line.notes.forEach((node,i)=>node.setStave(staveById.get(line.events[i].staffId)));
        if(new Set(line.events.map(event=>event.staffId)).size>1 || line.events.some(event=>event.staffId!==score.voices.find(voice=>voice.id===event.voiceId).staff)) {
          // VexFlow 5 Voice.draw resets every tickable to the voice's home stave.
          // Preserve the individually assigned staves using its public draw APIs.
          line.voice.draw=function(context=this.checkContext()) {
            this.setRendered(); for(const node of this.getTickables()) node.setContext(context).drawWithStyle();
          };
        }
      }
      if (!single && index % columns === 0) system.addConnector('brace');
      system.addConnector('singleLeft'); system.addConnector('singleRight');
      const states=new Map(), signature=keyAlterations(measure.key);
      const ordered=[...byVoice.values()].flatMap(line=>line.notes.map((node,i)=>({node,event:line.events[i]}))).sort((a,b)=>compareBeat(a.event.start,b.event.start));
      // Accidental state belongs to the written staff and octave, across voices.
      // Conflicting simultaneous alterations remain explicit on both notes.
      for(const {node,event} of ordered) event.notes.forEach((note,keyIndex)=>{
        const key=event.staffId+note.letter+note.octave;
        const conflict=ordered.some(other=>compareBeat(other.event.start,event.start)===0 && other.event.staffId===event.staffId && other.event.notes.some(otherNote=>otherNote.letter===note.letter && otherNote.octave===note.octave && otherNote.accidental!==note.accidental));
        const incoming=(score.source.ties??[]).some(tie=>tie.to===note.id);
        if((states.get(key)??signature[note.letter])!==note.accidental && !incoming || note.courtesy || conflict) {
          const mark=new V.Accidental(accidental[note.accidental]||'n'); if(note.courtesy) mark.setAsCautionary(); node.addModifier(mark,keyIndex);
        }
        states.set(key,conflict?99:note.accidental);
      });
      for(const pedal of score.pedals??[]) if(compareBeat(pedal.at,measure.start)>=0 && (compareBeat(pedal.at,measure.end)<0 || measure===score.measures.at(-1) && compareBeat(pedal.at,measure.end)===0)) {
        const anchor=ordered.find(item=>compareBeat(item.event.start,pedal.at)===0)?.node;
        pedalAnchors.push({pedal,anchor,measure,stave:staveById.get(score.staves.at(-1).id)});
      }
      for(const tempo of score.tempos) if(compareBeat(tempo.at,measure.start)>=0 && compareBeat(tempo.at,measure.end)<0) {
        const anchor=ordered.find(item=>compareBeat(item.event.start,tempo.at)===0)?.node;
        tempoAnchors.push({tempo,anchor,measure,stave:staveById.get(score.staves[0].id)});
      }
    }
    const tieStyles=[];
    for(const tie of score.source.ties??[]) {
      const from=noteToEvent.get(tie.from), to=noteToEvent.get(tie.to);
      if(!from && !to) continue;
      const voice=score.voices.find(voice=>voice.id===(from??to).event.voiceId);
      const options={direction:voice.stem==='down'?V.Stem.UP:voice.stem==='up'?V.Stem.DOWN:(from??to).node.getStemDirection()};
      const drawTie=spec=>{tieStyles.push({voice:voice.id,direction:options.direction}); factory.StaveTie({...spec,options});};
      if(from && to && from.row===to.row) drawTie({from:from.node,to:to.node,firstIndexes:[from.keyIndex],lastIndexes:[to.keyIndex]});
      else {
        if(from) drawTie({from:from.node,firstIndexes:[from.keyIndex],lastIndexes:[from.keyIndex]});
        if(to) drawTie({to:to.node,firstIndexes:[to.keyIndex],lastIndexes:[to.keyIndex]});
      }
    }
    factory.draw();
    const svg=page.querySelector('svg');
    [...svg.querySelectorAll('.vf-stavetie')].forEach((element,index)=>{element.dataset.scoreVoice=tieStyles[index].voice; element.dataset.tieSide=tieStyles[index].direction<0?'above':'below';});
    svg.dataset.scorePage=String(++this.pageCount);
    svg.dataset.meterGroups=measures.map(measure=>measure.beatGroups.join('+')).join('|');
    for(const {tempo,anchor,measure,stave} of tempoAnchors) {
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');
      const fraction=(tempo.at[0]/tempo.at[1]-measure.start[0]/measure.start[1])/(measure.length[0]/measure.length[1]);
      text.setAttribute('x',String(anchor?.getAbsoluteX()??(stave.getNoteStartX()+fraction*(stave.getNoteEndX()-stave.getNoteStartX()))));
      text.setAttribute('y',String(stave.getYForTopText(2))); text.setAttribute('font-size','13');
      text.dataset.tempoBpm=tempo.bpm; text.dataset.tempoCurve=tempo.curve??'step';
      const next=score.tempos[score.tempos.indexOf(tempo)+1];
      const displayBpm = Math.round(tempo.bpm * 10) / 10;
      text.textContent='♩ = '+displayBpm+(tempo.curve==='linear'?(next.bpm>tempo.bpm?' · accel.':next.bpm<tempo.bpm?' · rit.':''):'');
      svg.append(text);
    }
    for(const {pedal,anchor,measure,stave} of pedalAnchors) {
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');
      const local=pedal.at[0]/pedal.at[1]-measure.start[0]/measure.start[1], fraction=local/(measure.length[0]/measure.length[1]);
      text.setAttribute('x',String(anchor?.getAbsoluteX()??(stave.getNoteStartX()+fraction*(stave.getNoteEndX()-stave.getNoteStartX()))));
      text.setAttribute('y',String(stave.getYForBottomText(3)+(pedal.controller-64)*8));
      text.setAttribute('font-size','12'); text.setAttribute('data-pedal-value',String(pedal.value));
      text.textContent=({64:'Ped.',66:'Sost.',67:'Una c.'})[pedal.controller]+' '+pedal.value; svg.append(text);
    }
    for(const element of [svg,...svg.querySelectorAll('*')]) for(const property of ['fill','stroke']) {
      if(/^(black|#000|#000000)$/i.test(element.getAttribute(property)||'')) element.setAttribute(property,'currentColor');
      if(/^(black|#000|#000000|rgb\(0, 0, 0\))$/i.test(element.style[property])) element.style[property]='currentColor';
    }
    svg.setAttribute('role','group'); svg.setAttribute('aria-label',score.source.title+' grand staff');
    for(const [id,item] of noteToEvent) {
      const element=item.node.noteHeads[item.keyIndex].getSVGElement();
      if(!element) throw new Error('A written note could not be linked to the score.');
      const note=score.notes.find(note=>note.id===id), glyph=element.querySelector('text');
      const hit=document.createElementNS('http://www.w3.org/2000/svg','rect');
      for(const [name,value] of Object.entries({x:+glyph.getAttribute('x')-3,y:+glyph.getAttribute('y')-12,width:item.node.noteHeads[item.keyIndex].getWidth()+6,height:24,'data-note-hit':id})) hit.setAttribute(name,String(value));
      element.append(hit);
      for(const [name,dx] of [['tick',12],['direction',24]]) {
        const mark=document.createElementNS('http://www.w3.org/2000/svg','text');
        mark.setAttribute('x',String(+glyph.getAttribute('x')+dx)); mark.setAttribute('y',String(+glyph.getAttribute('y')-9));
        mark.setAttribute('font-family','Segoe UI, sans-serif'); mark.setAttribute('font-size','13'); mark.setAttribute('aria-hidden','true');
        mark.dataset['score'+name[0].toUpperCase()+name.slice(1)]=id; if(name==='tick') mark.textContent='✓'; element.append(mark);
      }
      element.dataset.scoreState=''; element.dataset.scoreNote=id; element.setAttribute('tabindex','0'); element.setAttribute('role','button'); element.setAttribute('aria-label',noteName(note)+' · '+note.voiceId);
      element.addEventListener('click',()=>this.onSelect(note));
      element.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' ') {event.preventDefault(); this.onSelect(note);}});
      this.nodes.set(id,element);
    }
  }
  highlight(index) {
    const roles=this.positions[index]??new Map();
    for(const id of new Set([...this.active.keys(),...roles.keys()])) {
      if(this.active.get(id)===roles.get(id)) continue;
      const node=this.nodes.get(id); node.dataset.scoreState=roles.get(id)??'';
      node.classList.toggle('is-starting',roles.get(id)==='starting'); node.classList.toggle('is-continuing',roles.get(id)==='continuing');
    }
    this.active=roles;
  }
}
