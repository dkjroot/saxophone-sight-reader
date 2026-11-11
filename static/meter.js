// Groups count denominator units: 6/8 normally has two groups of three,
// while an authored 5/8 can explicitly choose 2+3 or 3+2. MIDI supplies no
// such irregular grouping; retain denominator pulses rather than invent it.
export function defaultBeatGroups(numerator) {
  if(!Number.isInteger(numerator) || numerator<1 || numerator>255) throw new Error('Invalid meter numerator.');
  return Array(numerator>=6 && numerator%3===0?numerator/3:numerator).fill(numerator>=6 && numerator%3===0?3:1);
}

export function meterDefinition(meter,groups) {
  if(!Array.isArray(meter) || meter.length!==2 || !Number.isInteger(meter[0]) || meter[0]<1 || meter[0]>32 || ![1,2,4,8,16,32].includes(meter[1])) throw new Error('Invalid time signature.');
  const [numerator]=meter;
  const compound=numerator>=6 && numerator%3===0;
  const explicit=groups!==undefined;
  if(groups===undefined) groups=defaultBeatGroups(numerator);
  if(!Array.isArray(groups) || !groups.length || groups.some(group=>!Number.isInteger(group) || group<1) || groups.reduce((sum,group)=>sum+group,0)!==numerator) throw new Error('Beat groups must be positive denominator units filling the time signature.');
  return {kind:compound?'compound':[1,2,3,4].includes(numerator)?'simple':'irregular',groups:[...groups],explicit};
}

export function beatGroupAt(at,measure) {
  const offset=measure.beatOffset??[0,1], groups=measure.beatGroups??meterDefinition(measure.meter).groups;
  const numerator=BigInt(at[0])*BigInt(offset[1])+BigInt(offset[0])*BigInt(at[1]);
  const denominator=BigInt(at[1])*BigInt(offset[1]);
  let end=0;
  for(let index=0;index<groups.length;index++) {
    end+=groups[index]*4;
    if(numerator*BigInt(measure.meter[1])<BigInt(end)*denominator) return index;
  }
  return groups.length-1;
}
