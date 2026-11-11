import {LocalAudio,MetronomeClock} from './audio.js';
const $=id=>document.getElementById(id);
const ids=['live-instrument','live-volume','reference-instrument','reference-volume','reference-sound','click-volume','tempo','beats','source-speed','source-clicks','source-countin'];
export class SoundPanel {
  constructor(getTarget,getPitches,getAttacks=()=>new Map(),pitch=pitch=>pitch) {
    this.pitch=pitch; this.getTarget=getTarget; this.getPitches=getPitches; this.getAttacks=getAttacks; this.clock=new MetronomeClock(); this.engine=null; this.timer=null; this.revision=0; this.auditionRevision=0; this.onReferenceStop=()=>{}; this.onConfigure=()=>{};
    try {const saved=JSON.parse(localStorage.getItem('saxophone-sight-reader-sound')||'{}');
      for(const id of ids) if(saved[id]!==undefined) {
        const element=$(id);
        if(element.type==='checkbox') element.checked=saved[id]===true;
        else if(element.tagName==='SELECT') {if([...element.options].some(o=>o.value===String(saved[id]))) element.value=saved[id];}
        else if(Number.isFinite(+saved[id])) element.value=Math.max(+element.min,Math.min(+element.max,+saved[id]));
      }
    } catch { /* Sound settings are optional. */ }
    for(const id of ids) $(id).addEventListener('change',()=>{if(['reference-instrument','reference-sound','live-instrument'].includes(id)) {this.auditionRevision++; if(id==='live-instrument') this.engine?.livePreview.stop(); else this.onReferenceStop();} this.configure(); this.persist(); if(this.clock.running && ['tempo','beats'].includes(id)) {this.engine.stopClicks(); this.clock.start(this.engine.context.currentTime,+$('tempo').value,+$('beats').value);}});
    $('live-sound').addEventListener('change',()=>this.setLive($('live-sound').checked));
    $('hear-live').addEventListener('click',()=>void this.audition('live'));
    $('hear-target').addEventListener('click',()=>void this.audition('reference'));
    $('metronome').addEventListener('change',async()=>{
      const revision=++this.revision, enabled=$('metronome').checked;
      this.clock.stop(); clearInterval(this.timer); this.engine?.stopClicks();
      if(enabled && await this.activate('click') && revision===this.revision && $('metronome').checked) {
        this.clock.start(this.engine.context.currentTime,+$('tempo').value,+$('beats').value);
        this.pump(); this.timer=setInterval(()=>this.pump(),25);
      } else if(revision===this.revision) this.stopClock();
    });
    $('sound-panic').addEventListener('click',()=>this.panic());
    this.configure(); this.sync();
  }
  async audition(path) {
    const revision=++this.auditionRevision;
    if(path==='reference' && !$('reference-sound').checked) return;
    const pitches=this.getTarget().map(note=>this.pitch(note.midi));
    if(!await this.activate(path) || revision!==this.auditionRevision) return;
    if(path==='reference') {if(!$('reference-sound').checked) return; this.onReferenceStop();}
    this.engine.audition(pitches.length ? pitches : [this.pitch(60)],path);
  }
  async setLive(enabled) {
    $('live-sound').checked=enabled; this.sync();
    if(enabled && !await this.activate('live')) $('live-sound').checked=false;
    this.sync();
  }
  persist() {try {localStorage.setItem('saxophone-sight-reader-sound',JSON.stringify(Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox' ? $(id).checked : $(id).value]))));} catch { /* Session still works. */ }}
  async loadSamples() {
    if(this.engine.samples.ready) return true;
    $('sound-status').textContent='Loading acoustic piano…';
    try {
      await this.engine.samples.load();
      if($('sound-status').textContent==='Loading acoustic piano…') $('sound-status').textContent='';
      this.sync(); return true;
    } catch(error) {$('sound-status').textContent='Acoustic piano could not load: '+error.message; return false;}
  }
  async activate(path='reference') {
    try {
      if(!this.engine) {const Context=window.AudioContext||window.webkitAudioContext; if(!Context) throw new Error('Web Audio is unavailable'); this.engine=new LocalAudio(new Context({latencyHint:'interactive'})); this.configure();}
      if(this.engine.context.state!=='running') await this.engine.context.resume();
      if(this.engine.context.state!=='running') throw new Error('Browser audio is suspended');
      if(path!=='click' && $(path==='live' ? 'live-instrument' : 'reference-instrument').value==='acoustic' && !await this.loadSamples()) return false;
      if($('sound-status').textContent!=='Loading acoustic piano…') $('sound-status').textContent=''; return true;
    } catch(error) {$('sound-status').textContent='Sound could not start: '+error.message; $('live-sound').checked=false; $('metronome').checked=false; this.sync(); return false;}
  }
  configure() {
    $('hear-target').disabled=!$('reference-sound').checked;
    if(!this.engine) return;
    this.engine.live.configure($('live-instrument').value,+$('live-volume').value/100);
    this.engine.livePreview.configure($('live-instrument').value,+$('live-volume').value/100);
    this.engine.reference.configure($('reference-instrument').value,+$('reference-volume').value/100);
    this.engine.clickGain.gain.setTargetAtTime(+$('click-volume').value/100,this.engine.context.currentTime,.015);
    if(!$('reference-sound').checked) this.engine.reference.stop();
    this.sync(); this.onConfigure();
    if(!this.engine.samples.ready && [$('live-instrument').value,$('reference-instrument').value].includes('acoustic')) void this.loadSamples();
  }
  sync() {
    if (!this.engine) return;
    const pitches = $('live-sound').checked ? [...this.getPitches()].map(this.pitch) : [];
    const attacks = pitches.length ? new Map([...this.getAttacks()].map(([pitch, attack]) => [this.pitch(pitch), attack])) : new Map();
    this.engine.live.sync(pitches, attacks);
  }
  pump() {this.clock.pump(this.engine.context.currentTime,event=>this.engine.click(event));}
  stopClock() {this.revision++; this.clock.stop(); this.engine?.stopClicks(); clearInterval(this.timer); this.timer=null; $('metronome').checked=false;}
  panic() {this.auditionRevision++; this.onReferenceStop(); this.stopClock(); if(this.engine) this.engine.panic(); $('live-sound').checked=false; this.sync();}
}
