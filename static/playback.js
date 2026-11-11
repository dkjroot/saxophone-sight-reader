import {sourceBeats,BeatCursor} from './beats.js';
import {PlaybackCursor,referencePlan} from './transport.js';
const $=id=>document.getElementById(id);
export class SourcePlayer {
  constructor(sound,scorePanel) {
    this.sound=sound; this.panel=scorePanel; this.cursor=new PlaybackCursor(); this.timer=null; this.revision=0; this.lastPaint=-1; this.beatPlan=null; this.beats=new BeatCursor();
    scorePanel.onPassageChange=()=>{this.stop(); this.refresh();};
    sound.onReferenceStop=()=>this.stop(); sound.onConfigure=()=>this.refresh();
    $('play-source').addEventListener('click',()=>void this.play());
    $('pause-source').addEventListener('click',()=>{this.revision++; this.cursor.pause(sound.engine.context.currentTime); this.silence(); $('source-playback-status').textContent=`Paused · ${this.cursor.position.toFixed(1)} / ${this.cursor.plan.duration.toFixed(1)} s`; this.refresh();});
    $('stop-source').addEventListener('click',()=>this.stop());
    for(const id of ['source-speed','source-clicks','source-countin']) $(id).addEventListener('change',()=>this.stop());
    $('metronome').addEventListener('change',()=>{if($('metronome').checked && this.beatPlan?.beats.length) this.stop();});
    this.refresh();
  }
  refresh() {
    const tracks=new Set(this.panel.rules().filter(rule=>rule.enabled).map(rule=>rule.track));
    const playable=this.panel.score?.duration_ticks>0 && this.panel.score.notes.some(note=>note.channel!==9 && tracks.has(note.track));
    $('play-source').disabled=!playable || !$('reference-sound').checked || this.cursor.state==='playing';
    $('play-source').textContent=this.cursor.state==='paused' ? 'Resume passage' : 'Play source passage';
    $('pause-source').disabled=this.cursor.state!=='playing';
    $('stop-source').disabled=['stopped','ended'].includes(this.cursor.state);
  }
  async play() {
    const revision=++this.revision;
    try {
      const resuming=this.cursor.state==='paused';
      const plan=resuming ? this.cursor.plan : referencePlan(this.panel.score,{start:+$('passage-start').value,end:+$('passage-end').value,tracks:this.panel.rules()},+$('source-speed').value);
      const beatPlan=resuming ? this.beatPlan : $('source-clicks').checked ? sourceBeats(this.panel.score,plan,+$('source-speed').value,+$('source-countin').value) : {beats:[],leadIn:0};
      if(!plan.notes.length || !plan.duration) throw new Error('No playable note durations in this source passage.');
      if(!await this.sound.activate() || revision!==this.revision) return;
      this.sound.engine.reference.stop();
      this.beatPlan=beatPlan;
      if(beatPlan.beats.length) this.sound.stopClock();
      this.cursor.play(plan,this.sound.engine.context.currentTime+(resuming ? 0 : beatPlan.leadIn),resuming ? this.cursor.position : 0);
      this.beats.start(beatPlan.beats,this.cursor.origin,resuming ? this.cursor.position : -Infinity);
      this.lastPaint=-1; this.pump(); this.timer=setInterval(()=>this.pump(),25); this.refresh();
    } catch(error) {$('source-playback-status').textContent='Playback failed: '+error.message;}
  }
  pump() {
    const now=this.sound.engine.context.currentTime;
    this.cursor.pump(now,note=>this.sound.engine.reference.noteOn(note.pitch,note.time,note.duration,note.id,note.velocity/127));
    if(this.cursor.state==='playing') this.beats.pump(now,beat=>this.sound.engine.click(beat));
    if(now-this.lastPaint>.2 || this.cursor.state==='ended') {
      $('source-playback-status').textContent=now<this.cursor.origin && this.beatPlan.leadIn ? `Count-in · ${(this.cursor.origin-now).toFixed(1)} s` : `${this.cursor.state==='ended' ? 'Finished' : 'Playing'} · ${this.cursor.at(now).toFixed(1)} / ${this.cursor.plan.duration.toFixed(1)} s`;
      this.lastPaint=now;
    }
    if(this.cursor.state==='ended') {this.silence(); this.refresh();}
  }
  silence() {clearInterval(this.timer); this.timer=null; this.sound.engine?.reference.stop(); if(this.beatPlan?.beats.length) this.sound.engine?.stopClicks();}
  stop() {this.revision++; this.cursor.stop(); this.silence(); this.beatPlan=null; $('source-playback-status').textContent=''; this.refresh();}
}
