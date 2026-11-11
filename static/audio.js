import {AcousticSamples} from './samples.js';
// Local synthesis and bundled acoustic recordings; no MIDI output.
export class SynthPath {
  constructor(context, destination, samples=null) {
    this.context=context; this.samples=samples; this.voices=new Map(); this.sounding=new Set(); this.instrument='piano'; this.volume=.25;
    this.gain=context.createGain(); this.gain.gain.value=.25; this.gain.connect(destination);
  }
  configure(instrument,volume) {
    const selected=['organ','acoustic','reed'].includes(instrument) ? instrument : 'piano';
    if (this.instrument!==selected) this.stop();
    this.instrument=selected;
    this.volume=Math.max(0,Math.min(1,volume));
    this.gain.gain.setTargetAtTime(this.volume,this.context.currentTime,.015);
  }
  noteOn(pitch,time=this.context.currentTime,duration=null,key=pitch,velocity=1) {
    if (!Number.isInteger(pitch) || pitch<0 || pitch>127) return;
    if(this.instrument==='acoustic' && !this.samples?.ready) return;
    this.noteOff(key,time);
    const envelope=this.context.createGain(), oscillators=[];
    envelope.connect(this.gain);
    const organ=this.instrument==='organ', reed=this.instrument==='reed', acoustic=this.instrument==='acoustic', level=(acoustic ? .7 : organ || reed ? .12 : .22)*Math.max(.01,Math.min(1,velocity));
    envelope.gain.setValueAtTime(0,time);
    envelope.gain.linearRampToValueAtTime(level,time+(reed ? .018 : .008));
    if (!organ && !acoustic && !reed) envelope.gain.exponentialRampToValueAtTime(Math.max(.000001,level*.009),time+5);
    if(acoustic) {
      const sample=this.samples.select(pitch), source=this.context.createBufferSource();
      source.buffer=sample.buffer; source.playbackRate.value=2**((pitch-sample.root)/12); source.connect(envelope);
      source.onended=()=>source.disconnect(); source.start(time); oscillators.push(source);
    }
    else for (const [multiple,weight] of reed ? [[1,1],[2,.21],[3,.35],[5,.16],[7,.055]] : organ ? [[1,1],[2,.4],[3,.2],[4,.12]] : [[1,1],[2,.35],[3,.13]]) {
      const oscillator=this.context.createOscillator(), partial=this.context.createGain();
      oscillator.type='sine'; oscillator.frequency.value=440*2**((pitch-69)/12)*multiple;
      partial.gain.value=weight; oscillator.connect(partial); partial.connect(envelope);
      oscillator.onended=()=>{oscillator.disconnect(); partial.disconnect();};
      oscillator.start(time); oscillators.push(oscillator);
    }
    const voice={envelope,oscillators,start:time,ended:false,released:false}; this.voices.set(key,voice); this.sounding.add(voice);
    const last=oscillators.at(-1), cleanup=last.onended;
    last.onended=()=>{cleanup(); envelope.disconnect(); voice.ended=true; this.sounding.delete(voice); if(this.voices.get(key)===voice && (!acoustic || voice.released)) this.voices.delete(key);};
    if (duration!==null) this.release(key,voice,time+duration);
  }
  release(pitch,voice,time) {
    voice.released=true; if(voice.ended) return;
    const gain=voice.envelope.gain;
    if(time<voice.start) {gain.cancelScheduledValues(time); gain.setValueAtTime(0,time); for(const oscillator of voice.oscillators) oscillator.stop(time); return;}
    const end=Math.max(time,voice.start+.019);
    // Hold the current envelope before fading; cancelAndHold avoids a release jump.
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(end);
    else {gain.cancelScheduledValues(end); gain.setValueAtTime(gain.value,end);}
    gain.linearRampToValueAtTime(0,end+.06);
    for (const oscillator of voice.oscillators) oscillator.stop(end+.07);
  }
  noteOff(pitch,time=this.context.currentTime) {const voice=this.voices.get(pitch); if(voice) {this.voices.delete(pitch); this.release(pitch,voice,time);}}
  sync(pitches,attacks=new Map()) {
    const wanted=new Set(pitches);
    for (const pitch of this.voices.keys()) if(!wanted.has(pitch)) this.noteOff(pitch);
    for (const pitch of wanted) {
      const attack=attacks.get(pitch), serial=attack?.serial||0;
      if(!this.voices.has(pitch) || serial>(this.voices.get(pitch).attack||0)) {this.noteOn(pitch,this.context.currentTime,null,pitch,attack ? attack.velocity/127 : 1); if(this.voices.has(pitch)) this.voices.get(pitch).attack=serial;}
    }
  }
  stop() {this.voices.clear(); for(const voice of this.sounding) this.release(null,voice,this.context.currentTime);}
}
export class MetronomeClock {
  constructor() {this.running=false;}
  start(now,bpm=80,beats=4) {
    this.interval=60/Math.max(30,Math.min(240,Number(bpm)||80));
    this.beats=Math.max(1,Math.min(12,Math.trunc(beats)||4));
    this.next=now+.03; this.index=0; this.running=true;
  }
  stop() {this.running=false;}
  pump(now,emit) {
    if (!this.running) return;
    // A stalled/background scheduler must never emit a burst of overdue clicks.
    if(this.next<now) {this.next=now+.03; this.index=0;}
    while(this.next<now+.1) {emit({time:this.next,beat:this.index%this.beats,bar:Math.floor(this.index/this.beats)}); this.next+=this.interval; this.index++;}
  }
}
export class LocalAudio {
  constructor(context) {
    this.context=context; this.samples=new AcousticSamples(context);
    this.master=context.createGain(); this.master.gain.value=.65;
    this.limiter=context.createDynamicsCompressor(); this.master.connect(this.limiter); this.limiter.connect(context.destination);
    this.live=new SynthPath(context,this.master,this.samples); this.reference=new SynthPath(context,this.master,this.samples);
    this.livePreview=new SynthPath(context,this.master,this.samples);
    this.clickGain=context.createGain(); this.clickGain.gain.value=.2; this.clickGain.connect(this.master); this.clicks=new Set();
  }
  click({time,beat}) {
    const oscillator=this.context.createOscillator(), gain=this.context.createGain();
    oscillator.frequency.value=beat===0 ? 1400 : 900;
    gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(.4,time+.002); gain.gain.exponentialRampToValueAtTime(.001,time+.045);
    oscillator.connect(gain); gain.connect(this.clickGain); this.clicks.add(oscillator);
    oscillator.onended=()=>{this.clicks.delete(oscillator); oscillator.disconnect(); gain.disconnect();};
    oscillator.start(time); oscillator.stop(time+.05);
  }
  audition(pitches,path='reference') {
    const instrument=path==='live' ? this.livePreview : this.reference;
    if(path==='live') instrument.configure(this.live.instrument,this.live.volume);
    instrument.stop(); for(const pitch of pitches) instrument.noteOn(pitch,this.context.currentTime,.8);
  }
  stopClicks() {for(const click of this.clicks) click.stop(); this.clicks.clear();}
  panic() {this.live.stop(); this.reference.stop(); this.livePreview.stop(); this.stopClicks();}
}
