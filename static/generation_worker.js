import {makeSaxPhrase} from './saxophone.js';
import {makePracticePhrase} from './harmony.js';

self.onmessage=({data})=>{
  try {
    self.postMessage({revision:data.revision,targets:data.settings.sax ? makeSaxPhrase(data.settings) : makePracticePhrase(data.settings)});
  } catch {
    self.postMessage({revision:data.revision,error:'Continuous generation unavailable. Choose Repeat passage.'});
  }
};
