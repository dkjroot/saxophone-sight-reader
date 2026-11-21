// Presets name the display resolution; budget generously for browser/desktop chrome.
export function layoutPreset(selection,height,width=1280) {
  const migrated=selection==='compact' ? '1080' : selection==='comfortable' ? '1440' : selection;
  const preset=['720','1080','1440','2160'].includes(migrated) ? migrated : height<=540 ? '720' : height<=900 ? '1080' : height<=1260 ? '1440' : '2160';
  return {preset,density:+preset<=1080 ? 'compact' : 'comfortable',budget:Math.min(height,+preset-180),preferred:({720:200,1080:280,1440:380,2160:360})[preset],minimum:width<650 ? 170 : 180};
}
export function staffViewport(profile,chromeHeight) {
  return Math.max(profile.minimum,Math.min(profile.preferred,profile.budget-chromeHeight));
}

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function fitPanel(panel,available,minHeight=180,minWidth=280) {
  const width=clamp(panel.width,Math.min(minWidth,available),available);
  return {x:clamp(panel.x,0,Math.max(0,available-width)),y:clamp(panel.y,0,3000),width,
    height:clamp(panel.height,minHeight,2000)};
}

function stackSideBySide(panels,result,a,b) {
  const [first,second]=panels[a].x<=panels[b].x?[a,b]:[b,a];
  // A desktop side-by-side layout stacks on a narrow screen. Deliberate saved
  // overlaps remain under the user's control; fitting never overwrites the save.
  if(panels[first].x+panels[first].width<=panels[second].x && result[first].x+result[first].width>result[second].x) {
    result[second].y=Math.max(result[second].y,result[first].y+result[first].height+8);
  }
}

export function fitCustomPanels(panels,available) {
  const result={
    staff:fitPanel(panels.staff,available,Math.min(panels.staff.width,available)<650?320:240),
    keyboard:fitPanel(panels.keyboard,available,Math.min(panels.keyboard.width,available)<650?220:180),
  };
  if(panels.fingering) result.fingering=fitPanel(panels.fingering,available,240,200);
  stackSideBySide(panels,result,'staff','keyboard');
  if(panels.fingering) {
    stackSideBySide(panels,result,'staff','fingering');
    stackSideBySide(panels,result,'fingering','keyboard');
  }
  return result;
}

export function parseCustomLayout(text) {
  try {
    const value=JSON.parse(text);
    if(value?.version!==1 || !['compact','comfortable'].includes(value.density) || !Number.isFinite(value.scale) || value.scale<.4 || value.scale>1.6) return null;
    for(const name of ['staff','keyboard']) {
      const panel=value.panels?.[name];
      if(!panel || !['x','y','width','height'].every(key=>Number.isFinite(panel[key])) || panel.width<=0 || panel.height<=0) return null;
    }
    if(value.panels.fingering!==undefined) {
      const panel=value.panels.fingering;
      if(!panel || !['x','y','width','height'].every(key=>Number.isFinite(panel[key])) || panel.width<=0 || panel.height<=0) return null;
    }
    return value;
  } catch {return null;}
}
