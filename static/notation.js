import {staffStep} from './core.js';

// Place accidentals in the nearest free column to the left of the entire chord.
// Only symbols whose vertical extents conflict need separate columns.
export function accidentalLayout(notes, positions, yFor) {
  const columns = [], result = new Map();
  const right = Math.min(...positions.values()) - 17;
  for (const note of [...notes].sort((a,b) => yFor(a)-yFor(b))) {
    const y = yFor(note);
    let column = columns.findIndex(ys => ys.every(other => Math.abs(other-y) >= 28));
    if (column === -1) { column = columns.length; columns.push([]); }
    columns[column].push(y);
    result.set(note, right-column*18);
  }
  return result;
}

// Reserve space around each written pitch, including stems and directional hints.
// The entire SVG grows instead of squeezing distant ledger notes into a fixed box.
export function staffLayout(target, {compact = false} = {}) {
  const treble = target.filter(n => n.staff === 'treble');
  const bass = target.filter(n => n.staff === 'bass');
  const margin = 80, gap = compact ? 55 : 100, bottomMargin = compact ? 24 : 80;
  const trebleBottom = Math.max(margin + 40, ...treble.map(n => margin + (staffStep(n) - 30) * 5));
  const trebleY = n => trebleBottom - (staffStep(n) - 30) * 5;
  const trebleExtent = Math.max(trebleBottom, ...treble.map(trebleY));
  const bassBottom = Math.max(trebleExtent + gap + 40, ...bass.map(n => trebleExtent + gap + (staffStep(n) - 18) * 5));
  const bassY = n => bassBottom - (staffStep(n) - 18) * 5;
  const height = Math.max(bassBottom + bottomMargin, ...bass.map(n => bassY(n) + bottomMargin));
  return {trebleBottom, bassBottom, height, yFor: n => n.staff === 'bass' ? bassY(n) : trebleY(n)};
}

// Pure viewport policy: changing display never changes the musical sequence.
export function readingWindow({index, length, capacity, preview, mode = 'note', repeat = true, offset = 0}) {
  if (!length) return [];
  const count = Math.max(1, Math.min(capacity, preview+1));
  const start = mode === 'page' ? Math.max(0,index-((offset+index)%count)) : index;
  const end = mode === 'note' && repeat ? start+count : Math.min(length,start+count);
  return Array.from({length:Math.max(0,end-start)}, (_,i) => start+i);
}
