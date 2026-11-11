import {candidates, spellChord, staffStep} from './core.js';

export const planningControls=['texture','left-density','right-density','left-leap','right-leap','ledger-limit','attack-pattern'];
const integer=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number(value)||fallback));
const pick=(items,random)=>items[Math.min(items.length-1,Math.floor(random()*items.length))];

// Symmetric nearest-voice distance: no added outer voice can evade a leap limit.
export function handDistance(a,b) {
  if(!a.length || !b.length) return 0;
  return Math.max(...a.map(n=>Math.min(...b.map(p=>Math.abs(n-p)))),...b.map(n=>Math.min(...a.map(p=>Math.abs(n-p)))));
}

export function attackHands(pattern,index) {
  const cycles={alternate:[[true,false],[false,true]],'2:1':[[true,true],[false,true]],'3:2':[[true,true],[false,true],[true,false],[false,true]]};
  return (cycles[pattern]||[[true,true]])[index%(cycles[pattern]?.length||1)];
}

// Bounded candidate windows, never a combinatorial search over the full keyboard.
function handOptions(pool,count,span,previous,leap,spellNotes,staff,ledger,random,unrestricted) {
  const result=[];
  const windows=Array.from({length:Math.max(0,pool.length-count+1)},(_,start)=>pool.slice(start,start+count));
  if(unrestricted && count>1) for(let trial=0;trial<48;trial++) {
    const available=[...pool], notes=[];
    while(notes.length<count && available.length) notes.push(available.splice(Math.floor(random()*available.length),1)[0]);
    windows.push(notes.sort((a,b)=>a-b));
  }
  for(const pitches of windows) {
    if(pitches.at(-1)-pitches[0]>span || handDistance(pitches,previous)>leap) continue;
    const notes=spellNotes(pitches);
    if(!notes || notes.length!==count) continue;
    const bottom=staff==='bass'?18:30, top=bottom+8;
    if(notes.some(n=>Math.floor(Math.max(0,bottom-staffStep(n),staffStep(n)-top)/2)>ledger)) continue;
    result.push(notes.map(n=>({...n,staff,hand:staff==='bass'?'left':'right'})));
  }
  return result;
}

export function planPhrase(settings,random,recipeFor) {
  const length=integer(settings.length,4,1,32), max=integer(settings.size,1,1,10), min=integer(settings['min-size'],1,1,max);
  const texture=settings.texture||'block', harmonic=settings.source!=='random';
  const all=candidates({...settings,material:harmonic?'sharps':settings.material});
  const span=integer(settings['hand-span'],12,1,24), ledger=settings['ledger-limit']==='any'||settings['ledger-limit']===undefined ? Infinity : Number(settings['ledger-limit']);
  const previous={left:[],right:[]};
  const arpeggios=structuredClone(settings.generationState?.arpeggios||{left:[],right:[]});
  for(const n of settings.previousTarget||[]) previous[n.staff==='bass'?'left':'right'].push(n.midi);
  const result=[];
  let recipeIndex=-1, cachedRecipe;
  for(let step=0;step<length;step++) {
    const absolute=step+(settings.sequenceOffset||0);
    const index=['broken','alberti'].includes(texture)?Math.floor(absolute/4):absolute;
    if(harmonic && recipeIndex!==index) {
      cachedRecipe=settings.source==='triads' && settings.generationState?.recipeIndex===index?{pcs:settings.generationState.pcs}:recipeFor(index);
      recipeIndex=index;
    }
    const recipe=harmonic?cachedRecipe:null;
    const pool=recipe?all.filter(n=>recipe.pcs.includes(n%12)):all;
    const spellNotes=recipe?.spell || (pitches=>spellChord(pitches,settings.material==='flats',settings.key));
    let requested=min+Math.floor(random()*(max-min+1));
    if(texture!=='block' && settings.hand!=='both') requested=1;
    const active=attackHands(settings['attack-pattern'],absolute);
    const sides=settings.hand==='both'?['left','right']:[settings.hand];
    let options=[];
    // Reduce density only; never relax the physical, spelling or leap constraints.
    for(let count=requested;count>=1 && !options.length;count--) {
      for(let leftCount=0;leftCount<=count;leftCount++) {
        const counts={left:leftCount,right:count-leftCount};
        const moving=texture==='bass'||texture==='alberti'?'left':'right';
        if(texture!=='block' && counts[moving]>1) continue;
        if(settings.hand==='both' && texture!=='block' && count===1 && counts[moving]!==1 && active[moving==='left'?0:1]) continue;
        if(sides.length===1 && counts[sides[0]]!==count) continue;
        if(sides.length===2 && count>1 && (!leftCount || leftCount===count) && active.every(Boolean)) continue;
        const choices={left:[[]],right:[[]]};
        let valid=true;
        for(const [i,hand] of ['left','right'].entries()) {
          const n=counts[hand];
          if(n && (!sides.includes(hand) || (sides.length===2 && !active[i]))) {valid=false;break;}
          if(!n) continue;
          const cap=integer(settings[`${hand}-density`],5,1,5);
          if(n>cap) {valid=false;break;}
          const handPool=pool.filter(n=>settings.hand!=='both'||(hand==='left'?n<60:n>=60));
          const leap=settings[`${hand}-leap`]==='any'||settings[`${hand}-leap`]===undefined?Infinity:Number(settings[`${hand}-leap`]);
          choices[hand]=handOptions(handPool,n,span,previous[hand],leap,spellNotes,hand==='left'?'bass':'treble',ledger,random,!harmonic);
          if(['broken','alberti'].includes(texture) && (hand===moving || settings.hand!=='both')) {
            if(absolute%4===0 || !arpeggios[hand].length) {
              const anchor=previous[hand][0] ?? handPool[Math.floor(handPool.length/2)];
              const groups=Array.from({length:Math.max(0,handPool.length-2)},(_,i)=>handPool.slice(i,i+3)).filter(g=>g[2]-g[0]<=span);
              groups.sort((a,b)=>Math.abs(a[1]-anchor)-Math.abs(b[1]-anchor));
              arpeggios[hand]=groups[0]||handPool.slice(0,3);
            }
            const pattern=texture==='alberti'?[0,2,1,2]:[0,1,2,1];
            const desired=arpeggios[hand][Math.min(arpeggios[hand].length-1,pattern[absolute%4])];
            const best=Math.min(...choices[hand].map(notes=>Math.abs(notes[0].midi-desired)));
            choices[hand]=choices[hand].filter(notes=>Math.abs(notes[0].midi-desired)===best);
          }
          if(!choices[hand].length) {valid=false;break;}
        }
        if(!valid) continue;
        for(const left of choices.left) for(const right of choices.right) {
          const notes=[...left,...right];
          if(new Set(notes.map(staffStep)).size!==notes.length) continue;
          if(settings.endAction==='repeat' && step===length-1 && result[0]?.length) {
            if(['left','right'].some(hand=>{
              const leap=settings[`${hand}-leap`];
              const opening=result.find(chord=>chord.some(n=>n.hand===hand))?.filter(n=>n.hand===hand).map(n=>n.midi)||[];
              const ending=notes.filter(n=>n.hand===hand).map(n=>n.midi);
              return leap && leap!=='any' && handDistance(ending.length?ending:previous[hand],opening)>Number(leap);
            })) continue;
          }
          options.push(notes);
        }
      }
    }
    if(!options.length) {result.push([]);continue;}
    // Prefer complete harmony before doublings; then nearby voices. Random stays
    // unrestricted unless the player selects a texture or explicit leap bound.
    const coverage=notes=>new Set(notes.map(n=>n.midi%12)).size;
    if(harmonic) {const best=Math.max(...options.map(coverage));options=options.filter(n=>coverage(n)===best);}
    if(texture!=='block'||harmonic) {
      const cost=notes=>['left','right'].reduce((sum,hand)=>{
        const ns=notes.filter(n=>n.hand===hand).map(n=>n.midi), ps=previous[hand];
        if(!ns.length||!ps.length) return sum;
        if(['melody','bass'].includes(texture) && ns.length===1) {
          const direction=absolute%8<4?1:-1;
          return sum+Math.abs(ns[0]-(ps[0]+direction*2));
        }
        return sum+handDistance(ns,ps);
      },0);
      const best=Math.min(...options.map(cost));options=options.filter(n=>cost(n)<=best+2);
    }
    const chosen=pick(options,random);
    for(const hand of sides) {
      const pitches=chosen.filter(n=>n.hand===hand).map(n=>n.midi);
      if(pitches.length) previous[hand]=pitches;
    }
    result.push(chosen);
  }
  if(settings.captureState) result.generationState={arpeggios,recipeIndex,pcs:cachedRecipe?.pcs};
  return result;
}
