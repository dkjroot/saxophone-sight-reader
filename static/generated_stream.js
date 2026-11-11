// One bounded 17-target refill, computed away from the input/rendering thread.
export class GeneratedStream {
  constructor(changed,createWorker=()=>new Worker(new URL('./generation_worker.js',import.meta.url),{type:'module'})) {
    this.changed=changed; this.revision=0; this.queue=[]; this.error='';
    try {
      this.worker=createWorker();
      this.worker.onmessage=({data})=>{
        if(data.revision!==this.revision) return;
        this.queue=data.targets||[];this.error=data.error||'';this.changed();
      };
      this.worker.onerror=()=>{this.error='Continuous generation unavailable. Choose Repeat passage.';this.changed();};
    } catch {this.error='Continuous generation unavailable. Choose Repeat passage.';}
  }
  reset() {this.revision++;this.queue=[];}
  prepare(settings,phrase,offset) {
    this.reset();
    if(!this.worker) return;
    const previousTarget=['bass','treble'].flatMap(staff=>[...phrase].reverse().find(chord=>chord.some(n=>n.staff===staff))?.filter(n=>n.staff===staff)||[]);
    this.worker.postMessage({revision:this.revision,settings:{...settings,length:17,sequenceOffset:offset,previousTarget,captureState:true,generationState:phrase.generationState}});
  }
  take(count) {
    if(this.queue.length<count) return null;
    const taken=this.queue.splice(0,count);
    taken.generationState=this.queue.generationState;
    return taken;
  }
}
