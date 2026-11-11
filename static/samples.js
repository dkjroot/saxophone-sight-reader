// Local, attributed acoustic recordings; decode once per audio context.
export function nearestSample(buffers,pitch) {
  let best=null;
  for(const [root,buffer] of buffers) if(best===null || Math.abs(root-pitch)<Math.abs(best.root-pitch)) best={root,buffer};
  return best;
}
export class AcousticSamples {
  constructor(context,fetcher=(...args)=>globalThis.fetch(...args)) {this.context=context; this.fetcher=fetcher; this.buffers=new Map(); this.pending=null; this.ready=false;}
  async load() {
    if(this.ready) return;
    if(this.pending) return this.pending;
    this.pending=this.read();
    try {await this.pending;} finally {this.pending=null;}
  }
  async read() {
    const base='/static/audio/salamander/', response=await this.fetcher(base+'manifest.json');
    if(!response.ok) throw new Error('Acoustic sample manifest unavailable.');
    const manifest=await response.json();
    if(manifest.version!==1 || !Array.isArray(manifest.samples) || !manifest.samples.length || manifest.samples.length>40 || manifest.samples.some(sample=>!Number.isInteger(sample.pitch) || sample.pitch<0 || sample.pitch>127 || !/^[A-G]s?\d\.mp3$/.test(sample.file))) throw new Error('Invalid acoustic sample manifest.');
    const buffers=new Map(); let index=0;
    const worker=async()=>{
      while(index<manifest.samples.length) {
        const sample=manifest.samples[index++], result=await this.fetcher(base+sample.file);
        if(!result.ok) throw new Error('Acoustic piano sample unavailable: '+sample.file);
        const buffer=await this.context.decodeAudioData(await result.arrayBuffer()); buffers.set(sample.pitch,buffer);
      }
    };
    await Promise.all(Array.from({length:Math.min(4,manifest.samples.length)},worker));
    this.buffers=new Map([...buffers].sort(([a],[b])=>a-b)); this.ready=true;
  }
  select(pitch) {return nearestSample(this.buffers,pitch);}
}
