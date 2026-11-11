import {filterStudy} from './passage_filters.js';
import {compileScore,compareBeat} from './score_model.js';
import {ScorePractice} from './score_practice.js';
import {ScoreEngraver} from './engraving.js';
import {authoredPlan} from './score_transport.js';
import {PlaybackCursor} from './transport.js';
import {match,noteName} from './core.js';
const $=id=>document.getElementById(id);
let enginePromise;
function loadEngine() {
  if(globalThis.VexFlow) return Promise.resolve();
  if(!enginePromise) enginePromise=new Promise((resolve,reject)=>{const script=document.createElement('script'); script.src='/static/vendor/vexflow-5.0.0/vexflow-bravura.js'; script.onload=resolve; script.onerror=()=>{enginePromise=null; script.remove(); reject(new Error('The local notation engine could not load.'));}; document.head.append(script);});
  return enginePromise;
}
export class ScoreWorkspace {
  constructor(input,sound,onChange,getScale) {
    Object.assign(this,{input,sound,onChange,getScale}); this.cursor=new PlaybackCursor(); this.index=0; this.revision=0; this.active=false;
    $('study-start').addEventListener('click',()=>this.start()); $('study-stop').addEventListener('click',()=>this.rewind());
    $('study-rewind').addEventListener('click',()=>this.rewind(true));
    $('study-play').addEventListener('click',()=>void this.play()); $('study-audio-pause').addEventListener('click',()=>{this.pausePlayback(); this.onChange();});
    $('study-position').addEventListener('input',()=>{this.stop(); this.index=+$('study-position').value; this.show(); onChange();});
    $('study-loop').addEventListener('change',()=>{try {localStorage.setItem('saxophone-sight-reader-study-loop',String($('study-loop').checked));} catch {}});
    try {const saved=localStorage.getItem('saxophone-sight-reader-study-loop'); if(['true','false'].includes(saved)) $('study-loop').checked=saved==='true';} catch {}
    try {const tempo=localStorage.getItem('saxophone-sight-reader-study-tempo'); if(['score','steady'].includes(tempo)) $('study-tempo').value=tempo;} catch {}
    $('study-tempo').addEventListener('change',()=>{try {localStorage.setItem('saxophone-sight-reader-study-tempo',$('study-tempo').value);} catch {}});
    for(const id of ['study-tempo','study-speed','study-continuity','study-loop','study-entry','study-exit']) $(id).addEventListener('change',()=>this.stop());
    try {const bars=localStorage.getItem('saxophone-sight-reader-study-bars'); if(['auto','1','2','3','4'].includes(bars)) $('study-bars').value=bars;} catch {}
    $('study-bars').addEventListener('change',()=>{try {localStorage.setItem('saxophone-sight-reader-study-bars',$('study-bars').value);} catch {} this.draw(); this.onChange();});
    this.timer=setInterval(()=>{if(this.active && (this.gate && !['paused','ended','stopped'].includes(this.gate.state) || this.cursor.state==='playing')) this.onChange();},16);
    window.addEventListener('pagehide',()=>{clearInterval(this.timer); this.leave();});
  }
  cancelLoad() {this.loadRevision=(this.loadRevision??0)+1; this.revision++;}
  async setScore(score) {
    this.loadRevision=(this.loadRevision??0)+1;
    const revision=++this.revision; this.stopPlayback(false); this.gate=null;
    await loadEngine(); await document.fonts.ready;
    if(revision!==this.revision) return;
    this.score=score; this.index=0; this.sounds=new Map(score.sounds.map(sound=>[sound.id,sound])); this.segmentSound=new Map(score.sounds.flatMap(sound=>sound.segments.map(id=>[id,sound]))); this.visible=new Set();
    for(const id of ['study-entry','study-exit']) $(id).replaceChildren();
    score.moments.forEach((point,index)=>{const label=point.at[1]===1?String(point.at[0]):point.at.join('/'); if(index<score.moments.length-1) $('study-entry').add(new Option(label,index)); if(index) $('study-exit').add(new Option(label,index));});
    $('study-exit').value=score.moments.length-1; $('study-position').max=score.moments.length-1;
    if(this.active) {this.draw(); this.onChange();}
  }
  async loadExample(id,settings) {
    const revision=this.loadRevision=(this.loadRevision??0)+1;
    const example = id === 'turnaround' ? 'turnaround' : 'after-hours';
    const response = await fetch('/static/studies/' + example + '.json');
    if(!response.ok) throw new Error('The local study could not load.');
    const score=compileScore(await response.json()); if(revision===this.loadRevision) await this.setScore(settings?filterStudy(score,settings):score);
  }
  draw() {
    if(!this.active || !this.score || !globalThis.VexFlow) return;
    $('staff').replaceChildren(); const container=document.createElement('div'); container.id='authored-engraving'; container.className='engraving-output'; $('staff').append(container);
    const scale=this.getScale(); container.style.width=Math.max(1,($('staff').clientWidth-2)/scale)+'px';
    this.engraver=new ScoreEngraver(container); this.engraver.draw(this.score,{barsPerLine:$('study-bars').value});
    for(const svg of container.querySelectorAll('svg')) {svg.style.width=svg.getAttribute('width')*scale+'px'; svg.style.height=svg.getAttribute('height')*scale+'px';}
    container.style.width=''; this.visible=new Set();
    this.engraver.onSelect=note=>{this.stop(); this.index=this.score.moments.findIndex(point=>compareBeat(point.at,note.start)===0); this.show(); this.onChange();};
    this.shown=-1; this.show();
  }
  enter() {this.active=true; if(this.gate?.state==='paused') this.gate.resume(this.input,performance.now()/1000); this.draw();}
  leave() {this.active=false; this.gate?.pause(); this.stopPlayback();}
  start() {
    if(!this.score) return;
    try {this.stopPlayback(); this.gate=new ScorePractice(this.score,{speed:+$('study-speed').value,tempoMode:$('study-tempo').value,policy:$('study-continuity').value,loop:$('study-loop').checked,start:+$('study-entry').value,end:+$('study-exit').value}); this.gate.begin(this.input,performance.now()/1000); this.onChange();}
    catch(error) {$('feedback').textContent=error.message;}
  }
  rewind(keepPlaying=false) {const playing=this.cursor.state==='playing'; this.stop(); this.index=+$('study-entry').value||0; this.shown=-1; this.show(); this.onChange(); if(keepPlaying && playing) void this.play();}
  stop() {this.gate=null; this.stopPlayback(); this.onChange();}
  pause() {this.gate?.pause(); this.pausePlayback();}
  togglePause() {if(this.gate?.state==='paused') this.gate.resume(this.input,performance.now()/1000); else this.pause(); this.onChange();}
  beforeInput() {if(this.active) this.gate?.update(this.input,performance.now()/1000);}
  get target() {if(this.cursor.state==='ended' || this.gate && this.gate.index===this.gate.end) return []; const point=this.score?.moments[this.index]; return point?[...new Set([...point.attacks,...point.continuing].map(id=>this.sounds.get(id)))].map(note=>({...note,staff:note.staffId==='lower'?'bass':'treble'})):[];}
  show() {
    if(!this.engraver || !this.score) return;
    this.engraver.highlight(this.cursor.state==='ended' || this.gate && this.gate.index===this.gate.end?-1:this.index);
    $('study-position').value=this.index;
    const point=this.score.moments[this.index], measure=this.score.measures.find(measure=>compareBeat(point.at,measure.start)>=0 && compareBeat(point.at,measure.end)<0);
    $('practice-title').textContent=this.score.source.title;
    $('phrase-position').textContent=measure?'Bar '+(this.score.measures.indexOf(measure)+1):'End';
    $('exercise-summary').textContent=this.score.source.provenance?.kind==='midi-derived'?'Loaded MIDI passage · derived notation · 1/32 grid':'Written melody · practise pitch and note length';
    if(this.shown!==this.index) {
      const node=this.engraver.nodes.get(this.engraver.active.keys().next().value);
      if(node) {const pane=$('staff'), bounds=pane.getBoundingClientRect(), box=node.getBoundingClientRect(); if(box.top<bounds.top+15 || box.bottom>bounds.bottom-15) pane.scrollTop+=box.top-bounds.top-35; if(box.left<bounds.left || box.right>bounds.right) pane.scrollLeft+=box.left-bounds.left-25;}
      this.shown=this.index;
    }
  }
  update() {
    if(!this.score) {return {target:[],hints:[]};}
    const now=performance.now()/1000;
    this.gate?.update(this.input,now);
    if(this.gate) this.index=this.gate.index;
    if(this.cursor.state==='playing') {
      const audioNow=this.sound.engine.context.currentTime;
      this.cursor.pump(audioNow,note=>this.sound.engine.reference.noteOn(this.sound.pitch(note.pitch),note.time,note.duration,note.id,note.velocity/127));
      const at=this.cursor.at(audioNow); this.index=this.plan.moments.findLast(point=>point.time<=at)?.index??+$('study-entry').value;
      if(this.cursor.state==='ended') {clearInterval(this.audioTimer); this.sound.engine.reference.stop();}
    }
    if(this.shown!==this.index) this.show();
    const result=this.gate?.result, hints=match(this.target,this.input.held).hints;
    const active=new Set(this.engraver?.active.keys());
    for(const id of new Set([...this.visible,...active])) {
      const node=this.engraver.nodes.get(id), sound=this.segmentSound.get(id);
      const supported=this.input.held.has(sound.midi) || this.gate?.policy==='pedal' && this.input.sustained.has(sound.midi);
      node.dataset.practice=this.gate?.credits.has(sound.id) && supported && active.has(id)?'accepted':'';
      const direction=active.has(id)?hints.find(hint=>hint.target===sound.midi)?.direction:null;
      node.querySelector('[data-score-direction]').textContent=direction==='up'?'↑':direction==='down'?'↓':'';
    }
    this.visible=active;
    const names=ids=>[...new Set(ids.map(id=>noteName(this.gate.notes.get(id))))].join(', ');
    let feedback='';
    if(this.gate?.state==='ended') feedback='✓ Passage complete';
    else if(this.gate?.state==='paused') feedback='Paused';
    else if(result?.reset) feedback='Release the note';
    else if(result) feedback=[result.missing.length?'Play '+names(result.missing):'',result.early.length?'Hold again '+names(result.early):'',result.extra.length?'Release the extra note':''].filter(Boolean).join(' · ')||'✓ Hold';
    else if(this.cursor.state==='playing') feedback='Playing study';
    else if(this.cursor.state==='paused') feedback='Playback paused';
    else if(this.cursor.state==='ended') feedback='Playback complete';
    $('feedback').textContent=feedback;
    $('detail').textContent=this.gate?`Short holds ${this.gate.counts.earlyRelease} · Extra notes ${this.gate.counts.extra}`:'';
    $('pause-practice').disabled=!this.gate || this.gate.state==='ended'; $('pause-practice').textContent=this.gate?.state==='paused'?'Resume':'Pause';
    $('pause-practice').setAttribute('aria-label',this.gate?.state==='paused'?'Resume practice':'Pause practice');
    $('study-play').textContent=this.cursor.state==='paused'?'Resume study':'Play study';
    $('study-play').disabled=$('study-start').disabled || !$('reference-sound').checked;
    $('study-audio-pause').disabled=this.cursor.state!=='playing';
    return {target:this.target,hints};
  }
  async play() {
    if(!this.score || !this.active || !$('reference-sound').checked) return;
    const entry=+$('study-entry').value, exit=+$('study-exit').value;
    const ended=this.cursor.state==='ended';
    if(ended || this.index<entry || this.index>=exit) this.index=entry;
    this.gate=null; const revision=++this.revision, resume=this.cursor.state==='paused';
    if(!await this.sound.activate() || revision!==this.revision || !this.active) return;
    const position=resume?this.cursor.position:0;
    this.sound.onReferenceStop();
    try {
      this.plan=authoredPlan(this.score,{speed:+$('study-speed').value,tempoMode:$('study-tempo').value,start:this.score.moments[entry].at,end:this.score.moments[exit].at});
      this.cursor.play(this.plan,this.sound.engine.context.currentTime,resume?position:this.plan.moments.find(point=>point.index===this.index)?.time??0,{loop:$('study-loop').checked}); this.onChange();
    } catch(error) {$('feedback').textContent=error.message;}
  }
  pausePlayback() {this.revision++; if(this.sound.engine) this.cursor.pause(this.sound.engine.context.currentTime); this.sound.engine?.reference.stop();}
  stopPlayback(invalidate=true) {if(invalidate) this.revision++; this.cursor.stop(); this.sound.engine?.reference.stop();}
}
