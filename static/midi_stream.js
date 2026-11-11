import {attackGroups,makeOutline} from './outline.js';

// Prepare one following source window off the MIDI event path. Empty filtered
// windows yield between batches; switching sources cancels outstanding work.
export class MidiPassageStream {
  constructor(onReady=()=>{}) {this.onReady=onReady; this.reset();}
  reset() {clearTimeout(this.timer); this.revision=(this.revision??0)+1; this.next=null; this.ended=false;}
  prepare(score,settings,bounds) {
    this.reset(); this.score=score; this.settings=structuredClone(settings);
    this.bounds=structuredClone(bounds); this.total=attackGroups(score).length;
    this.length=Math.max(1,Math.min(512,bounds.end-bounds.start+1)); this.schedule(bounds.end+1);
  }
  schedule(start) {
    const revision=this.revision;
    if(start>this.total) {this.ended=true; queueMicrotask(()=>{if(revision===this.revision) this.onReady();}); return;}
    this.timer=setTimeout(()=>{
      if(revision!==this.revision) return;
      const bounds={...this.bounds,start,end:Math.min(this.total,start+this.length-1)};
      const outline=makeOutline(this.score,this.settings,bounds);
      if(!outline.targets.length) {this.schedule(bounds.end+1); return;}
      this.next={bounds,targets:outline.targets}; this.onReady();
    },0);
  }
  take() {
    const next=this.next;
    if(next) {this.next=null; this.schedule(next.bounds.end+1);}
    return next;
  }
}
