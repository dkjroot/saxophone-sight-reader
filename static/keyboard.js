import {WHITE} from './core.js';
export function keyboardGeometry(low,high) {
  low=Math.max(0,Math.min(127,Math.trunc(low)||0)); high=Math.max(low,Math.min(127,Math.trunc(high)||0));
  const keys=[]; let units=0;
  for(let pitch=low;pitch<=high;pitch++) {
    const white=WHITE.includes(pitch%12);
    if(pitch===low && !white) units+=.5;
    keys.push({pitch,white,left:white ? units : units-11/36});
    if(white) units++; else if(pitch===high) units+=.5;
  }
  return {keys,units:Math.max(1,units)};
}
export function keyboardKeyWidth(selection,available,units,coarse=false) {
  if(['20','28','36'].includes(String(selection))) return +selection;
  return Math.max(coarse ? 28 : 16,Math.min(36,Math.floor((available-8)/Math.max(1,units))));
}
