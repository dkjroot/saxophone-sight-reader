import {LayoutEditor} from './layout_editor.js';
import {MidiPassageStream} from './midi_stream.js';
import {GeneratedStream} from './generated_stream.js';
import {FlowGate} from './flow.js';
import {KEYS, keyAlterations, spell, noteName, staffStep, match} from './core.js';
import {WindPerformance, makeSaxPhrase, describeSaxExercise, writtenPitch, soundingPitch, saxNote} from './saxophone.js';
import {readingWindow} from './notation.js';
import {ProgressPanel} from './progress.js';
import {SoundPanel} from './sound.js';
import {ScorePanel} from './score.js';
import {makeOutline} from './outline.js';
import {layoutPreset,staffViewport} from './layout.js';
import {SourcePlayer} from './playback.js';
import {ScoreWorkspace} from './score_workspace.js';
import {compileScore} from './score_model.js';
import {filterStudy} from './passage_filters.js';
import {midiStudy} from './midi_study.js';

const $ = id => document.getElementById(id);
const performance = new WindPerformance();
const flowGate=new FlowGate();
let importedStudy=null, importRevision=0;
let workspace='outline', authored=null, workspaceRevision=0, outlineSettingsDirty=false;
const progress = new ProgressPanel();
let activePiece=null;
const scorePanel = new ScorePanel((score,bounds,filename,keyInfo)=>{
  if(keyInfo?.keyId) $('key').value=keyInfo.keyId;
  drawKeyboard();
  activePiece={score,bounds,filename}; $('source-midi').disabled=false; $('source').value='midi';
  $('study-source').querySelector('[value="loaded"]').disabled=false;
  $('study-source').value='loaded';
  if(workspace==='study') {persist(); syncMode(); newTarget(); scorePanel.practiceStarted(); sourcePlayer.stop(); $('study-source').value='loaded'; void loadStudy(); return;}
  completed=0; $('count').textContent='0'; persist(); syncMode(); newTarget(); scorePanel.practiceStarted();
},()=>settings());
const controls = ['source','key','tonality','leap','length','progression','preview','scroll-mode','material','span','low','high','midi-offset','file-offset'];
const numericControls = ['length','preview','low','high','midi-offset','file-offset'];
const saxPassageControls = ['key','material','span'];
$('key').replaceChildren(...KEYS.map(key => new Option(key.label, key.id)));
let target = [], completed = 0, solved = false, access, selectedInput, learning;
let phrase = [], phraseIndex = 0, waitingForRelease = false;
let streamOffset = 0;
let waitingForGenerated=false;
const generatedStream=new GeneratedStream(()=>{
  if(workspace==='outline' && waitingForGenerated && generatedStream.queue.length && !practicePaused) {waitingForGenerated=false;advancePhrase();}
  else if(waitingForGenerated) update();
});
let inputRevision = 0;
let practicePaused=false, resumeRelease=false, passageEnded=false, waitingForMidi=false;
const midiStream=new MidiPassageStream(()=>{if(workspace==='outline' && waitingForMidi && !practicePaused) advancePhrase();});
const sound=new SoundPanel(() => workspace === 'study' ? authored?.target ?? [] : target,
  () => performance.held, () => performance.attacks, pitch => soundingPitch(pitch, +$('midi-offset').value));
const sourcePlayer=new SourcePlayer(sound,scorePanel);
const storageKey = 'saxophone-sight-reader-v1';
function setMapping(offset) {
  const select = $('midi-offset');
  if (![...select.options].some(option => +option.value === offset)) {
    select.querySelector('[data-calibrated]')?.remove();
    const option = new Option(`Calibrated · ${offset > 0 ? '+' : ''}${offset} semitones`, offset);
    option.dataset.calibrated = '';
    select.add(option);
  }
  select.value = offset;
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (Number.isInteger(saved['midi-offset']) && saved['midi-offset'] >= -60 && saved['midi-offset'] <= 67) setMapping(saved['midi-offset']);
  for (const id of controls) {
    if (saved[id] !== undefined && (['low', 'high'].includes(id) ? Number.isInteger(+saved[id]) && +saved[id] >= 0 && +saved[id] <= 127 : [...$(id).options].some(o => !o.disabled && o.value === String(saved[id])))) $(id).value = saved[id];
  }
  if (['repeat','new','stop'].includes(saved.endAction)) $(`end-${saved.endAction}`).checked = true;
} catch { /* Restricted storage or an old setting must not prevent practice. */ }
if (+$('low').value > +$('high').value) $('high').value = $('low').value;
function settings() {
  const values = Object.fromEntries(controls.map(id => [id, numericControls.includes(id) ? +$(id).value : $(id).value]));
  const imported = values.source === 'midi';
  return {...values, sax: true, hand: 'right', size: 1,
    endAction: document.querySelector('[name="end-action"]:checked').value,
    scoreId: imported ? activePiece?.score.sha256 : null, passage: imported ? activePiece?.bounds : null,
    scoreTitle: imported ? activePiece?.filename : null};
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(settings())); } catch { /* Session still works. */ }
}
function syncMode() {
  const source = $('source').value, continuous = settings().endAction === 'new';
  $('length').closest('label').hidden = continuous || source === 'midi';
  $('tonality').closest('label').hidden = source !== 'scale';
  $('leap').closest('label').hidden = source !== 'random';
  const melody = workspace === 'study' || source === 'midi';
  $('material').closest('label').hidden = !melody && source !== 'random';
  $('material-label').textContent = melody ? 'Accidental spelling' : 'Pitch material';
  $('material').options[0].textContent = melody ? 'Follow the key signature' : 'Notes in key';
  $('material').options[1].textContent = melody ? 'Prefer sharps' : 'Chromatic · prefer sharps';
  $('material').options[2].textContent = melody ? 'Prefer flats' : 'Chromatic · prefer flats';
  $('continuous-label').textContent = source === 'midi' ? 'Continue through piece' : 'Continuous';
  $('count-label').textContent = continuous ? 'notes completed' : 'passes completed';
}
syncMode();
function rangeLabels() {
  for (const id of ['low', 'high']) $(`${id}-label`).textContent = `${noteName(spell(+$(id).value, true))}`;
}

let layout, layoutEditor;
function applyDensity() {
  layout=layoutPreset($('density').value,innerHeight,innerWidth);
  document.documentElement.dataset.density=$('density').value==='custom'?(layoutEditor?.state?.density||'compact'):layout.density;
  document.documentElement.dataset.layout=$('density').value==='custom'?'custom':layout.preset;
  if(layoutEditor && !layoutEditor.active && $('density').value!=='custom') layoutEditor.syncPresetScale(layout.preset);
}
function fitPlayingArea() {
  if(layoutEditor?.active) return;
  const staff=$('staff').getBoundingClientRect(), keyboard=document.querySelector('.keyboard-card').getBoundingClientRect();
  const chrome=keyboard.bottom+window.scrollY-staff.height+16;
  document.documentElement.style.setProperty('--staff-viewport',staffViewport(layout,chrome)+'px');
}
try {
  const density = localStorage.getItem('saxophone-sight-reader-density');
  const migrated=density==='compact' ? '1080' : density==='comfortable' ? '1440' : density;
  if (['auto','720','1080','1440','2160','custom'].includes(migrated)) $('density').value=migrated;
} catch { /* Storage is optional. */ }
applyDensity();
$('density').addEventListener('change', () => {
  applyDensity();
  try {localStorage.setItem('saxophone-sight-reader-density',$('density').value);} catch { /* Session still works. */ }
  drawStaff(); scrollToCurrent(); update();
});

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').textContent = dark ? 'Light mode' : 'Dark mode';
}
applyTheme(document.documentElement.dataset.theme === 'dark');
$('theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  applyTheme(dark);
  try { localStorage.setItem('saxophone-sight-reader-theme', dark ? 'dark' : 'light'); } catch { /* Session still works. */ }
});
function applyTargetVisibility(show) {
  $('show-targets').checked = show;
  $('keyboard').dataset.showTargets = String(show);
  $('target-legend').hidden = !show;
}
try { applyTargetVisibility(localStorage.getItem('saxophone-sight-reader-show-targets') === 'true'); } catch { applyTargetVisibility(false); }
$('show-targets').addEventListener('change', () => {
  const show = $('show-targets').checked;
  applyTargetVisibility(show);
  try { localStorage.setItem('saxophone-sight-reader-show-targets', String(show)); } catch { /* Session still works. */ }
});

function drawStaff() {
  if(workspace==='study') {authored?.draw(); fitPlayingArea(); return;}
  const current = settings();
  const scale = layoutEditor?.active ? layoutEditor.state.scale : 1;
  const width = Math.max(290, ($('staff').clientWidth || 760) / scale);
  const fifths = KEYS.find(key => key.id === current.key).fifths;
  const firstX = 100 + Math.abs(fifths) * 14;
  const stride = Math.max(63, Math.min(125, (width - firstX - 35) / (current.preview || 1)));
  const capacity = Math.max(1, Math.floor((width - firstX - 34) / stride) + 1);
  const indices = readingWindow({index: phraseIndex, length: phrase.length, capacity, preview: current.preview,
    mode: current['scroll-mode'], repeat: current.endAction === 'repeat', offset: streamOffset});
  const notes = indices.map(index => phrase[index % phrase.length][0]);
  const steps = notes.map(staffStep);
  const highest = Math.max(38, ...steps), lowest = Math.min(30, ...steps);
  const top = 63 + (highest - 38) * 5, bottom = top + 40;
  const height = bottom + (30 - lowest) * 5 + 45;
  const start = indices[0] ?? 0;
  const scaleStyle = layoutEditor?.active ? `width:${width * scale}px;height:${height * scale}px` : '';
  let svg = `<svg class="phrase-system" data-start="${start}" data-end="${indices.at(-1) ?? 0}" viewBox="0 0 ${width} ${height}" style="${scaleStyle}" role="img" aria-label="Phrase on treble staff">`;
  for (let line = 0; line < 5; line++) {
    const y = top + line * 10;
    svg += `<line class="staff-line" x1="22" x2="${width - 18}" y1="${y}" y2="${y}"/>`;
  }
  svg += `<text class="clef" x="32" y="${bottom - 1}">𝄞</text>`;
  const signatureSteps = fifths > 0 ? [38,35,39,36,33,37,34] : [34,37,33,36,32,35,31];
  for (let index = 0; index < Math.abs(fifths); index++) {
    svg += `<text class="key-signature" x="${70 + index * 14}" y="${bottom - (signatureSteps[index] - 30) * 5 + 6}">${fifths > 0 ? '♯' : '♭'}</text>`;
  }
  const alterations = keyAlterations(current.key);
  notes.forEach((note, local) => {
    const index = indices[local], x = firstX + local * stride, y = bottom - (steps[local] - 30) * 5;
    if (index === phraseIndex && !passageEnded) svg += `<path class="phrase-pointer" data-step="${index}" d="M${x - 6} 19h12l-6 8z"/>`;
    const bar = Math.min(width - 18, x + stride * .48);
    svg += `<line class="staff-line" x1="${bar}" x2="${bar}" y1="${top}" y2="${bottom}"/>`;
    if (current.endAction === 'repeat' && index % phrase.length === phrase.length - 1) {
      svg += `<path class="phrase-boundary" d="M${bar - 4} ${top}V${bottom}M${bar} ${top}V${bottom}"/>`;
    }
    for (let ledger = bottom + 10; ledger <= y; ledger += 10) svg += `<line class="ledger" x1="${x - 13}" x2="${x + 13}" y1="${ledger}" y2="${ledger}"/>`;
    for (let ledger = top - 10; ledger >= y; ledger -= 10) svg += `<line class="ledger" x1="${x - 13}" x2="${x + 13}" y1="${ledger}" y2="${ledger}"/>`;
    const stemUp = steps[local] < 34, stemX = x + (stemUp ? 7 : -7);
    svg += `<line class="stem" x1="${stemX}" x2="${stemX}" y1="${y}" y2="${y + (stemUp ? -31 : 31)}"/>`;
    const data = `data-step="${index}" data-midi="${note.midi}"`;
    const accidental = {'-2':'𝄫','-1':'♭',0:'♮',1:'♯',2:'𝄪'}[note.accidental];
    if (note.accidental !== alterations[note.letter]) svg += `<text ${data} class="accidental" x="${x - 14}" y="${y + 7}" text-anchor="end">${accidental}</text>`;
    svg += `<ellipse ${data} class="note" cx="${x}" cy="${y}" rx="7.5" ry="4.5" transform="rotate(-16 ${x} ${y})"/>`;
    svg += `<text data-step="${index}" data-target="${note.midi}" class="note-direction" x="${x + 20}" y="${y + 5}" aria-hidden="true"></text>`;
    svg += `<text data-step="${index}" data-target="${note.midi}" class="note-check" x="${x + 20}" y="${y + 5}" aria-hidden="true"></text>`;
  });
  $('staff').innerHTML = svg + '</svg>';
  $('phrase-position').textContent = !phrase.length ? '—' : settings().endAction === 'new' ? String(streamOffset+phraseIndex+1) : `${phraseIndex+1} / ${phrase.length}`;
  $('note-names').textContent = target.map(noteName).join(' · ');
  fitPlayingArea();
}

function scrollToCurrent() {
  const system = [...$('staff').querySelectorAll('.phrase-system')].find(el => +el.dataset.start <= phraseIndex && +el.dataset.end >= phraseIndex);
  if (!system) return;
  const outer = $('staff').getBoundingClientRect();
  const notes=[...system.querySelectorAll(`[data-step="${phraseIndex}"][data-midi]`)].map(note=>note.getBoundingClientRect());
  if(!notes.length) return;
  const top=Math.min(...notes.map(note=>note.top))-30, bottom=Math.max(...notes.map(note=>note.bottom))+30;
  if(top<outer.top) $('staff').scrollTop+=top-outer.top;
  else if(bottom>outer.bottom) $('staff').scrollTop+=Math.min(bottom-outer.bottom,top-outer.top);
}

function fitKeyboard() {
  const selected = $('key-size').value, count = $('keyboard').children.length;
  const width = ($('keyboard-scroll').clientWidth - 6 - 4 * (count - 1)) / Math.max(1, count);
  $('keyboard').style.setProperty('--pitch-size', (selected === 'auto' ? Math.max(30, Math.min(44, Math.floor(width))) : Number(selected)) + 'px');
}
try {const size=localStorage.getItem('saxophone-sight-reader-key-size'); if(['auto','32','38','46'].includes(size)) $('key-size').value=size;} catch {}
$('key-size').addEventListener('change',()=>{try {localStorage.setItem('saxophone-sight-reader-key-size',$('key-size').value);} catch {} fitKeyboard(); fitPlayingArea(); scrollToCurrent();});
function drawKeyboard() {
  const current = settings();
  const {low, high} = current;
  $('keyboard').replaceChildren();
  for (let pitch = low; pitch <= high; pitch++) {
    const note = saxNote(pitch, current);
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key pitch-key';
    key.dataset.pitch = pitch;
    key.setAttribute('aria-label', `Play ${noteName(note)}`);
    const label = document.createElement('span');
    label.textContent = noteName(note);
    key.append(label);
    const direction = document.createElement('span');
    direction.className = 'key-direction'; direction.setAttribute('aria-hidden', 'true');
    key.append(direction);
    const stateMark = document.createElement('span');
    stateMark.className = 'key-state'; stateMark.setAttribute('aria-hidden', 'true');
    key.append(stateMark);
    key.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') return;
      event.preventDefault(); key.setPointerCapture(event.pointerId);
      authored?.beforeInput();
      progress.resume('midi'); performance.noteOn(`pointer:${event.pointerId}`, pitch); update();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) key.addEventListener(type, event => {
      authored?.beforeInput();
      if (type === 'pointerup' && event.pointerType === 'touch') {
        progress.resume('midi');
        performance.noteOn(`pointer:${event.pointerId}`, pitch);
        update();
      }
      performance.clear(`pointer:${event.pointerId}`); update();
    });
    // Keyboard navigation can audition one key at a time.
    key.addEventListener('keydown', event => {
      if ([' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        if(event.repeat || performance.sources.get('computer')?.held.has(pitch)) return;
        authored?.beforeInput();
        progress.resume('midi'); performance.noteOn('computer', pitch); update();
      }
    });
    key.addEventListener('keyup', event => {
      if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); performance.clear('computer'); update(); }
    });
    key.addEventListener('blur', () => { performance.clear('computer'); update(); });
    $('keyboard').append(key);
  }
  fitKeyboard();
  paintKeys();
}
function paintKeys(hints = [],expected=target) {
  const held = performance.held;
  const pitches = new Set(expected.map(n => n.midi));
  const retiring=workspace==='outline' && $('progression').value==='flow' ? flowGate.retiring||new Map() : new Map();
  const directions = new Map(hints.map(hint => [hint.played, hint.direction]));
  for (const key of $('keyboard').children) {
    const n = +key.dataset.pitch;
    key.classList.toggle('target', pitches.has(n));
    key.classList.toggle('correct', held.has(n) && (pitches.has(n)||retiring.has(n)));
    key.classList.toggle('wrong', held.has(n) && !pitches.has(n) && !retiring.has(n));
    key.setAttribute('aria-pressed', String(held.has(n)));
    key.querySelector('.key-direction').textContent = directions.has(n) ? (directions.get(n) === 'up' ? '↑' : '↓') : '';
    key.querySelector('.key-state').textContent = held.has(n) ? (pitches.has(n)||retiring.has(n) ? '✓' : '×') : '';
  }
  const played = [...held].map(pitch => pitch >= 0 && pitch <= 127 ? noteName(saxNote(pitch, settings())) : 'Outside range');
  $('played-note').textContent = played.join(' · ') || '—';
  $('played-mark').textContent = !held.size ? '' : [...held].every(pitch => pitches.has(pitch) || retiring.has(pitch)) ? '✓' : '×';
  $('played-mark').dataset.state = $('played-mark').textContent === '✓' ? 'correct' : 'wrong';
}
function newTarget() {
  outlineSettingsDirty=false; passageEnded=false; progress.resume('ended'); $('restart-pitch').hidden=true; $('pause-practice').disabled=false;
  waitingForGenerated=false;generatedStream.reset(); waitingForMidi=false; midiStream.reset();
  const description=describeSaxExercise(settings(),activePiece);
  $('practice-title').textContent=description.title; $('exercise-summary').textContent=description.description;
  phrase = settings().source==='midi' ? makeOutline(activePiece?.score,settings(),activePiece?.bounds).targets : makeSaxPhrase({...settings(),length:settings().endAction === 'new' ? 32 : settings().length});
  $('score-playing').textContent=settings().source==='midi' && activePiece ? `Practising ${activePiece.filename} · source attacks ${activePiece.bounds.start}–${activePiece.bounds.end}` : '';
  scorePanel.refresh();
  streamOffset = 0;
  if(settings().endAction==='new') {if(settings().source==='midi' && activePiece) midiStream.prepare(activePiece.score,settings(),activePiece.bounds); else generatedStream.prepare(settings(),phrase,phrase.length);}
  restartPhrase();
}
function restartPhrase() {
  passageEnded=false; $('restart-pitch').hidden=true;
  phraseIndex = 0; solved = false; resumeRelease=false; progress.resume('resume');
  waitingForRelease = performance.held.size > 0;
  target = phrase[0] || []; flowGate.start(target,[],performance.held,performance.attacks);
  $('staff').scrollTop = 0; drawStaff(); scrollToCurrent();
  progress.start(waitingForRelease ? [] : target,settings(),phrase);
  update();
}
function advancePhrase() {
  const flow=$('progression').value==='flow', previous=target;
  if (!flow && performance.held.size) return;
  if(settings().source==='midi' && settings().endAction==='new' && phraseIndex===phrase.length-1) {
    const next=midiStream.take();
    if(!next) {if(midiStream.ended) {finishPassage(); return;} waitingForMidi=true; solved=true; update(); return;}
    waitingForMidi=false; streamOffset+=phrase.length; activePiece.bounds=next.bounds; phrase=next.targets; phraseIndex=-1;
    const description=describeSaxExercise(settings(),activePiece); $('exercise-summary').textContent=description.description;
    $('score-playing').textContent=`Practising ${activePiece.filename} · source attacks ${next.bounds.start}–${next.bounds.end}`;
    setTimeout(()=>{if(activePiece?.bounds===next.bounds && scorePanel.score?.sha256===activePiece.score.sha256) { $('passage-start').value=next.bounds.start; $('passage-end').value=next.bounds.end; $('passage-name').value=`Attacks ${next.bounds.start}–${next.bounds.end}`; $('suggested-passages').value=''; $('saved-passages').value=''; $('delete-passage').disabled=true; scorePanel.refresh(); scorePanel.onPassageChange(); }},0);
  }
  if(settings().source!=='midi' && settings().endAction==='new' && phraseIndex===phrase.length-1 && !generatedStream.queue.length) {
    waitingForGenerated=true;solved=true;update();return;
  }
  if (phraseIndex === phrase.length-1 && settings().endAction!=='new') {
    if (settings().endAction === 'repeat') {if(flow) phraseIndex=-1; else {restartPhrase(); return;}}
    else {finishPassage(); return;}
  }
  phraseIndex++; target = phrase[phraseIndex]; solved = false;
  if (settings().source!=='midi' && settings().endAction === 'new' && phraseIndex >= 24) {
    const prune=17, refill=generatedStream.take(prune);
    if(refill) {
      streamOffset += prune;
      phrase=phrase.slice(prune).concat(refill);
      phrase.generationState=refill.generationState;
      phraseIndex -= prune;target=phrase[phraseIndex];
      generatedStream.prepare(settings(),phrase,streamOffset+phrase.length);
    }
  }
  flowGate.start(target,previous,performance.held,performance.attacks);
  drawStaff(); scrollToCurrent();
  progress.start(target,settings(),phrase);
  update();
}
function finishPassage() {passageEnded=true; waitingForMidi=false; target=[]; solved=true; drawStaff(); progress.pause('ended'); $('restart-pitch').hidden=false; $('pause-practice').disabled=true; update();}
$('restart-pitch').addEventListener('click',()=>{progress.resume('ended'); $('pause-practice').disabled=false; restartPhrase();});
$('pause-practice').addEventListener('click',()=>{
  if(workspace==='study') {authored?.togglePause(); return;}
  practicePaused=!practicePaused;
  $('pause-practice').textContent=practicePaused ? 'Resume' : 'Pause';
  $('pause-practice').setAttribute('aria-pressed',String(practicePaused));
  $('pause-practice').setAttribute('aria-label',practicePaused ? 'Resume practice' : 'Pause practice');
  if(practicePaused) progress.pause('practice');
  else {
    flowGate.start(target,target,performance.held,performance.attacks);
    resumeRelease=$('progression').value==='release' && !solved && performance.held.size>0;
    progress.resume('resume');
    if(resumeRelease) progress.pause('resume');
    progress.resume('practice');
    if(waitingForMidi) {advancePhrase();return;}
    if(waitingForGenerated && generatedStream.queue.length) {waitingForGenerated=false;advancePhrase();return;}
  }
  update();
});
function update() {
  sound.sync();
  if(workspace==='study') {const result=authored?.update(); paintKeys(result?.hints??[],result?.target??[]); $('note-names').textContent=(result?.target??[]).map(noteName).join(' · '); return;}
  const held = performance.held, flow=$('progression').value==='flow';
  const result = flow ? flowGate.evaluate(held,performance.attacks) : match(target, held);
  const accepted=flow ? result.accepted : held;
  const hints = solved || waitingForRelease ? [] : result.hints;
  const directions = new Map(hints.map(hint => [hint.target, hint.direction]));
  paintKeys(hints);
  for (const head of $('staff').querySelectorAll('[data-midi]')) head.classList.toggle('hit', +head.dataset.step === phraseIndex && accepted.has(+head.dataset.midi));
  for (const check of $('staff').querySelectorAll('.note-check')) check.textContent = +check.dataset.step === phraseIndex && accepted.has(+check.dataset.target) ? '✓' : '';
  for (const hint of $('staff').querySelectorAll('.note-direction')) hint.textContent = +hint.dataset.step === phraseIndex && directions.has(+hint.dataset.target) ? (directions.get(+hint.dataset.target) === 'up' ? '↑' : '↓') : '';
  if(practicePaused) {$('feedback').textContent='Paused'; $('detail').textContent=''; return;}
  if(waitingForGenerated) {$('feedback').textContent=generatedStream.error||'Preparing next targets…';$('detail').textContent='';return;}
  if(resumeRelease) {
    if(held.size) {$('feedback').textContent='Release the note'; $('detail').textContent=''; return;}
    resumeRelease=false; progress.resume('resume');
  }
  if (waitingForRelease) {
    if (held.size) { $('feedback').textContent = 'Release the note'; $('detail').textContent = ''; return; }
    waitingForRelease = false;
    progress.start(target,settings(),phrase);
  }
  if(passageEnded) {$('feedback').textContent='✓ Passage complete'; $('detail').textContent=''; return;}
  if(waitingForMidi) {$('feedback').textContent='Preparing next passage…'; $('detail').textContent=''; return;}
  if (!target.length) {
    $('feedback').textContent = settings().source==='midi' ? 'No notes in this range' : 'No playable notes';
    $('detail').textContent = settings().source==='midi' ? 'Select another track or widen the written range.' : 'Try a wider reading register or choose a different key.';
    return;
  }
  if (!solved && (!flow || !result.complete || result.ready)) progress.observe(flow ? result.effective : held);
  if(flow && !solved && result.ready) {
    progress.complete();
    if(settings().endAction==='new' || phraseIndex===phrase.length-1) {completed++; $('count').textContent=completed;}
    advancePhrase(); return;
  }
  if (solved) {
    $('feedback').textContent = '✓ Release the note';
    $('detail').textContent = '';
    if (!held.size) advancePhrase();
    return;
  }
  if (flow && result.complete) {
    $('feedback').textContent='Play again'; $('detail').textContent=''; return;
  }
  if (result.complete) {
    solved = true;
    progress.complete();
    if (settings().endAction === 'new' || phraseIndex === phrase.length - 1) $('count').textContent = ++completed;
    update();
  } else {
    $('feedback').textContent = hints.length ? (hints[0].direction === 'up' ? 'Play higher' : 'Play lower') : held.size ? 'Play one note' : '';
    $('detail').textContent = '';
  }
}

for (const id of controls) $(id).addEventListener('change', () => {
  if (id === 'file-offset') {
    persist();
    if ($('source').value === 'midi' && activePiece && activePiece.score.provenance?.written_for !== 'saxophone') {
      if (scorePanel.score === activePiece.score && scorePanel.activatePassage()) return;
      if (workspace === 'study') {outlineSettingsDirty = true; void loadStudy();}
      else newTarget();
    }
    scorePanel.refresh();
    return;
  }
  if (id === 'midi-offset') {
    $('mapping-status').textContent = '';
    performance.clear();
    sound.engine?.live.stop();
    authored?.pause();
    sourcePlayer.stop();
    persist();
    update();
    return;
  }
  if (['preview','scroll-mode'].includes(id)) {persist(); drawStaff(); update(); return;}
  if (+$('low').value > +$('high').value) $(id === 'low' ? 'high' : 'low').value = $(id).value;
  syncMode(); rangeLabels(); persist(); drawKeyboard();
  if (workspace === 'study') {outlineSettingsDirty = true; void loadStudy();}
  else newTarget();
});
for (const id of ['low', 'high']) $(id).addEventListener('input', rangeLabels);
for (const input of document.querySelectorAll('[name="end-action"]')) input.addEventListener('change', () => {persist(); syncMode(); completed=0; $('count').textContent='0'; newTarget();});
$('reveal').addEventListener('change', () => { $('note-names').hidden = !$('reveal').checked; });
$('reset').addEventListener('click', () => { performance.clear(); update(); });
for (const [button, mode, prompt] of [
  ['learn-low', 'low', 'Play your lowest note.'],
  ['learn-high', 'high', 'Play your highest note.'],
  ['calibrate', 'mapping', 'Play written middle C (C4) on your instrument.'],
]) {
  $(button).addEventListener('click', () => {
    learning = learning === mode ? null : mode;
    $('range-status').textContent = '';
    $('mapping-status').textContent = '';
    $(mode === 'mapping' ? 'mapping-status' : 'range-status').textContent = learning ? prompt : 'Cancelled.';
    if (learning) progress.pause('learning');
    else progress.resume('learning');
  });
}
function onMidi(event, inputId) {
  const offset = +$('midi-offset').value;
  if (document.hidden || !document.hasFocus()) {
    if (workspace === 'study') performance.midi(inputId, event.data, offset);
    return;
  }
  const [status, note, velocity] = event.data;
  const kind = status & 0xf0;
  if (kind !== 0x90 && kind !== 0x80 && !(kind === 0xb0 && [120,123].includes(note))) return;
  if (kind === 0x90 && velocity > 0) {
    const written = writtenPitch(note, offset);
    $('midi-activity').textContent = `MIDI ${note} · channel ${(status & 15) + 1}`;
    if (learning) {
      const mode = learning;
      learning = null;
      progress.resume('learning');
      if (mode === 'mapping') {
        setMapping(note - 60);
        $('midi-offset').dispatchEvent(new Event('change'));
        $('mapping-status').textContent = `Written C4 mapped to MIDI ${note}.`;
      } else if (written >= 0 && written <= 127) {
        $(mode).value = written;
        $(mode).dispatchEvent(new Event('change'));
        $('range-status').textContent = `Learned ${noteName(spell(written, true))} (MIDI ${note}).`;
      } else {
        $('range-status').textContent = 'This note falls outside the written MIDI range. Check MIDI pitch mapping.';
      }
      return;
    }
  }
  authored?.beforeInput();
  if (performance.midi(inputId, event.data, offset)) update();
  else if (kind === 0x90 && velocity > 0) sound.sync();
}
async function selectInput(id, reopen = false) {
  if(workspace==='study') authored?.pause();
  const revision = ++inputRevision;
  progress.pause('midi');
  const previous = selectedInput;
  const input = access ? [...access.inputs.values()].find(port => port.id === id && port.state === 'connected') : null;
  if (previous) previous.onmidimessage = null;
  // Assign before opening: native open/close operations emit statechange events.
  selectedInput = input;
  performance.clear(); sound.engine?.live.stop();
  $('midi-activity').textContent = '';
  $('midi-status').textContent = input ? `Opening · ${input.name || 'MIDI instrument'}…` : 'No MIDI input connected.';
  update();
  try {
    if (previous && (previous !== input || reopen)) await previous.close();
    if (revision !== inputRevision || !input) return;
    await input.open();
    if (revision !== inputRevision || selectedInput !== input) return;
    input.onmidimessage = event => {
      if (revision === inputRevision && selectedInput === input) onMidi(event, input.id);
    };
    $('midi-status').textContent = `Connected · ${input.name || 'MIDI instrument'}`;
    progress.resume('midi'); fitPlayingArea();
  } catch (error) {
    if (revision !== inputRevision) return;
    if (input) input.onmidimessage = null;
    $('midi-status').textContent = `MIDI input could not open (${error.name}). Close other MIDI tabs/apps, then click Refresh MIDI.`;
  }
}
async function refreshInputs(reopen = false) {
  const devices = [...access.inputs.values()].filter(input => input.state === 'connected');
  const previous = selectedInput?.id;
  $('inputs').replaceChildren(...devices.map(input => new Option(input.name || 'MIDI instrument', input.id)));
  if (!devices.length) $('inputs').add(new Option('No MIDI input connected', ''));
  $('inputs').disabled = !devices.length;
  const chosen = devices.find(input => input.id === previous) || devices[0];
  $('inputs').value = chosen?.id || '';
  // Compare the actual port object: a reconnect can replace it while keeping ID.
  if (reopen || selectedInput !== chosen) await selectInput(chosen?.id, reopen);
}
$('inputs').addEventListener('change', () => { void selectInput($('inputs').value); });
$('connect').addEventListener('click', async () => {
  if (!navigator.requestMIDIAccess) {
    $('midi-status').textContent = 'Web MIDI is unavailable. Try Chrome or Edge. You can also use the pitch buttons.';
    return;
  }
  $('connect').disabled = true;
  try {
    if (!access) { access = await navigator.requestMIDIAccess({sysex: false}); access.onstatechange = () => { void refreshInputs(); }; }
    await refreshInputs(true); $('connect').textContent = 'Refresh MIDI';
  } catch (error) {
    $('midi-status').textContent = error.name === 'NotAllowedError' ? 'MIDI permission was denied. Allow MIDI in your browser’s site settings, then reconnect.' : `MIDI could not start (${error.name}). Reconnect your instrument and try again.`;
  } finally { $('connect').disabled = false; }
});
function backgroundPractice() {
  sound.panic(); progress.pause(); authored?.pause();
  if(workspace==='study') {for(const id of [...performance.sources.keys()]) if(id==='computer' || id.startsWith('pointer:')) performance.clear(id);}
  else performance.clear();
  update();
}
window.addEventListener('blur', backgroundPractice);
window.addEventListener('focus', () => {progress.resume(); update();});
document.addEventListener('visibilitychange', () => {if (document.hidden) backgroundPractice(); else if (document.hasFocus()) {progress.resume(); update();}});
window.addEventListener('resize', () => {applyDensity(); fitKeyboard(); drawStaff(); scrollToCurrent(); update();});
rangeLabels(); drawKeyboard(); newTarget();

layoutEditor=new LayoutEditor({workspace:$('playing-layout'),panels:{staff:$('staff-panel'),keyboard:$('keyboard-panel')},selection:$('density'),scaleInput:$('staff-scale'),onChange:()=>{
  applyDensity();fitKeyboard();drawStaff();scrollToCurrent();
}});
layoutEditor.restore();

authored=new ScoreWorkspace(performance,sound,update,()=>layoutEditor?.active?layoutEditor.state.scale:layout.preset==='720'?.75:1);
const stopReference=sound.onReferenceStop, configureReference=sound.onConfigure;
sound.onReferenceStop=()=>{stopReference(); authored.stopPlayback(); if(workspace==='study') update();};
sound.onConfigure=()=>{configureReference(); if(workspace==='study') update();};
async function loadStudy() {
  const revision=++workspaceRevision; authored.cancelLoad(); authored.stop(); $('study-source-status').textContent='Loading study…';
  $('study-start').disabled=true; $('study-play').disabled=true; $('study-position').disabled=true;
  try {
    const source=$('study-source').value;
    if(source==='loaded') {
      if(!activePiece) throw new Error('Load a MIDI passage in MIDI files & library, then choose Start practising this passage.');
      const score=midiStudy(activePiece.score,settings(),activePiece.bounds,activePiece.filename);
      if(revision===workspaceRevision) await authored.setScore(score);
    } else if(source==='imported') {
      if(!importedStudy) throw new Error('Choose a MusicXML file first.');
      await authored.setScore(filterStudy(importedStudy,settings()));
    } else await authored.loadExample(source,settings());
    if(revision!==workspaceRevision) return;
    authored.sourceKey=studyKey();
    $('study-start').disabled=false; $('study-position').disabled=false;
    $('study-source-status').textContent = source === 'loaded'
      ? 'Derived from the selected MIDI passage on a 1/32-note grid.'
      : source === 'imported' ? importedStudy.source.provenance.warnings.join(' ') : '';
    if(workspace==='study') {drawStaff(); update();}
  } catch(error) {if(revision===workspaceRevision) {authored.score=null; authored.engraver=null; $('staff').replaceChildren(); $('pause-practice').disabled=true; $('study-source-status').textContent=error.message; $('feedback').textContent=error.message; update();}}
}
function studyKey() {return $('study-source').value==='loaded'?'loaded:'+activePiece?.score.sha256+JSON.stringify([activePiece?.bounds,...['low','high','file-offset',...saxPassageControls].map(id=>$(id).value)]):($('study-source').value==='imported'?'imported:'+importedStudy?.source.provenance.sha256:$('study-source').value)+JSON.stringify(['low','high',...saxPassageControls].map(id=>$(id).value));}
async function switchWorkspace(mode) {
  if(workspace===mode) return;
  workspace=mode; sourcePlayer.stop(); sound.stopClock();
  document.documentElement.dataset.workspace=mode;
  $('mode-outline').setAttribute('aria-pressed',String(mode==='outline')); $('mode-study').setAttribute('aria-pressed',String(mode==='study'));
  $('outline-settings').hidden=mode!=='outline'; $('study-settings').hidden=mode!=='study'; $('outline-count').hidden=mode!=='outline';
  $('study-transport').hidden=mode!=='study'; $('study-bars-control').hidden=mode!=='study';
  syncSettingsTree();
  document.querySelector('.progress-panel').hidden=mode!=='outline';
  $('staff').scrollTop=0; $('staff').scrollLeft=0;
  if(mode==='study') {
    progress.pause('workspace'); authored.enter();
    if(!authored.score || authored.sourceKey!==studyKey()) {
      await loadStudy();
    } else {drawStaff(); update();}
  } else {
    authored.leave(); progress.resume('workspace'); flowGate.start(target,target,performance.held,performance.attacks);
    resumeRelease=$('progression').value==='release' && !solved && performance.held.size>0;
    $('pause-practice').disabled=passageEnded; $('pause-practice').textContent=practicePaused?'Resume':'Pause'; $('pause-practice').setAttribute('aria-label',practicePaused?'Resume practice':'Pause practice');
    const description=describeSaxExercise(settings(),activePiece); $('practice-title').textContent=description.title; $('exercise-summary').textContent=description.description;
    if(outlineSettingsDirty) newTarget();
    else if(waitingForMidi && !practicePaused) advancePhrase();
    else if(waitingForGenerated && generatedStream.queue.length && !practicePaused) advancePhrase();
    else {drawStaff(); update();}
  }
  fitPlayingArea();
}
$('mode-outline').addEventListener('click',()=>void switchWorkspace('outline'));
$('mode-study').addEventListener('click',()=>void switchWorkspace('study'));
$('study-file').addEventListener('change',async()=>{
  const file=$('study-file').files[0]; if(!file) return;
  const revision=++importRevision, sourceRevision=workspaceRevision; $('study-import-status').textContent='Reading MusicXML…';
  try {
    if(file.size>262144) throw new Error('Choose an uncompressed MusicXML file no larger than 256 KB.');
    const response=await fetch('/api/import-musicxml',{method:'POST',headers:{'Content-Type':'application/xml'},body:await file.arrayBuffer()});
    const data=await response.json(); if(!response.ok) throw new Error(data.error||'MusicXML import failed.');
    const score=compileScore(data); filterStudy(score,settings());
    if(revision!==importRevision || sourceRevision!==workspaceRevision) return;
    importedStudy=score; $('study-source').querySelector('[value="imported"]').disabled=false;
    $('study-source').value='imported'; $('study-import-status').textContent=file.name+' · '+score.notes.length+' notes';
    syncSettingsTree(); await loadStudy();
  } catch(error) {if(revision===importRevision) $('study-import-status').textContent=error.message;}
});
$('study-source').addEventListener('change',()=>{importRevision++; if($('study-import-status').textContent==='Reading MusicXML…') $('study-import-status').textContent='';syncSettingsTree(); void loadStudy();});
function syncSettingsTree() {
  const filters=$('pitch-filters');
  $(workspace==='study'?'study-filter-slot':'outline-filter-slot').append(filters);
  filters.hidden=workspace === 'study' && $('study-source').value !== 'loaded';
  syncMode();
  // Source playback remains available while studying notation, using the same
  // sound engine. Starting either preview stops the other scheduler.
  $('source-preview-controls').hidden=false;
}
$('play-source').addEventListener('click',()=>{authored.pause(); if(workspace==='study') update();});
const filters=document.createElement('div'); filters.id='pitch-filters';
for(const id of saxPassageControls) filters.append($(id).closest('label'));
$('outline-filter-slot').append(filters);
syncSettingsTree();
const view=new URLSearchParams(location.search);
if(view.get('view')==='study') {if(['after-hours','turnaround'].includes(view.get('study'))) $('study-source').value=view.get('study'); void switchWorkspace('study');}
