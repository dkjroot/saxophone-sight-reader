import {LIBRARY_FIELDS,libraryFacets,filterLibrary,randomLibraryPiece,parseRecentLibrary,rememberLibraryPiece,recentLibraryPieces} from './library.js';
import {suggestPassages} from './sections.js';
import {parsePassages,savePassage,passageKey} from './passages.js';
import {attackGroups,makeOutline} from './outline.js';
import {KEYS} from './core.js';
import {filePitchOffset} from './saxophone.js';
import {scoreKeyForPassage,writtenKey} from './score_key.js';
// Local file inspection is separate from the live MIDI event path.
const $=id=>document.getElementById(id);
const PASSAGES='saxophone-sight-reader-passages-v1';
const RECENT='saxophone-sight-reader-recent-pieces-v1';
export class ScorePanel {
  constructor(onPractice=()=>{},getSettings=()=>({low:48,high:84,hand:'right',material:'white',span:'near',size:1,key:'C'})) {
    this.getSettings=getSettings; this.onPractice=onPractice;
    this.score=null; this.revision=0; this.trackControls=[]; this.onPassageChange=()=>{}; this.savedPassages=[]; this.practiceUsesSourceKey=false;
    try {this.savedPassages=parsePassages(localStorage.getItem(PASSAGES)||'[]');} catch {$('passage-status').textContent='Saved passages are unavailable; this visit still works.';}
    $('score-file').addEventListener('change',()=>{const file=$('score-file').files[0]; if(file) void this.readFile(file);});
    this.library=[]; this.sections=[];
    this.recent=[]; this.recentInvalid=false;
    try {this.recent=parseRecentLibrary(localStorage.getItem(RECENT)||'{"version":1,"pieces":[]}');}
    catch {this.recentInvalid=true; $('recent-status').textContent='Recent pieces could not be read; this visit still works.';}
    $('recent-piece').addEventListener('change',()=>{
      const id=$('recent-piece').value;
      if(!recentLibraryPieces(this.library,this.recent).some(piece=>piece.id===id)) return;
      for(const field of LIBRARY_FIELDS) $('library-'+field).value='';
      $('library-search').value=''; this.renderLibrary(); $('library-piece').value=id;
      $('load-piece').disabled=false; void this.loadPiece();
    });
    $('clear-recent').addEventListener('click',()=>{
      this.recent=[]; this.recentInvalid=false; const saved=this.persistRecent(); this.renderRecent();
      $('recent-status').textContent=saved ? 'Recent pieces cleared.' : 'Cleared for this visit; browser storage could not update.';
    });
    window.addEventListener('storage',event=>{
      if(event.key!==RECENT && event.key!==null) return;
      try {this.recent=parseRecentLibrary(event.newValue||'{"version":1,"pieces":[]}'); this.recentInvalid=false; $('recent-status').textContent='';}
      catch {this.recentInvalid=true; $('recent-status').textContent='Recent pieces could not be read.';}
      this.renderRecent();
    });

    $('library-search').addEventListener('input',()=>this.renderLibrary());
    for(const field of LIBRARY_FIELDS) $('library-'+field).addEventListener('change',()=>this.renderLibrary());
    $('library-piece').addEventListener('change',()=>{$('load-piece').disabled=!$('library-piece').value;});
    $('load-piece').addEventListener('click',()=>void this.loadPiece());
    $('random-piece').addEventListener('click',()=>{const piece=randomLibraryPiece(this.library,this.libraryFilters(),$('library-piece').value); if(piece) {$('library-piece').value=piece.id; void this.loadPiece();}});
    $('suggested-passages').addEventListener('change',()=>{
      const section=this.sections[+$('suggested-passages').value]; if(!section || $('suggested-passages').value==='') return;
      $('passage-start').value=section.start; $('passage-end').value=section.end; $('passage-name').value=section.label;
      $('saved-passages').value=''; $('delete-passage').disabled=true;
      this.refresh(); this.onPassageChange(); this.activatePassage(); $('passage-status').textContent=section.reason+' · suggested section; adjust the endpoints as needed.';
    });
    void this.loadCatalogue();
    for(const id of ['passage-start','passage-end']) $(id).addEventListener('change',()=>this.editPassage());
    $('practice-score').addEventListener('click',()=>this.activatePassage());
    $('save-passage').addEventListener('click',()=>{
      const outline=this.refresh(); if(!outline?.totalOnsets) return;
      try {
        const entry={version:1,hash:this.score.sha256,label:$('passage-name').value.trim()||`Attacks ${outline.start}–${outline.end}`,filename:this.filename,start:outline.start,end:outline.end,tracks:this.rules(),updatedAt:new Date().toISOString()};
        this.savedPassages=savePassage(this.savedPassages,entry); const saved=this.persistPassages(); this.renderPassages(); $('saved-passages').value=passageKey(entry); $('delete-passage').disabled=false;
        $('passage-status').textContent=saved ? 'Passage saved locally.' : 'Saved for this visit; browser storage is unavailable.';
      } catch(error) {$('passage-status').textContent=error.message;}
    });
    $('saved-passages').addEventListener('change',()=>this.usePassage());
    $('delete-passage').addEventListener('click',()=>{
      const key=$('saved-passages').value; if(!key) return;
      this.savedPassages=this.savedPassages.filter(entry=>passageKey(entry)!==key); const saved=this.persistPassages(); this.renderPassages();
      $('passage-status').textContent=saved ? 'Passage deleted.' : 'Deleted for this visit; browser storage could not update.';
    });
    window.addEventListener('storage',event=>{
      if(event.key!==PASSAGES && event.key!==null) return;
      try {this.savedPassages=parsePassages(event.newValue||'[]'); this.renderPassages();} catch {$('passage-status').textContent='Saved passages could not be read.';}
    });
    this.renderPassages();
    $('export-score').addEventListener('click',()=>{
      if(!this.score) return;
      const blob=new Blob([JSON.stringify(this.score,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), link=document.createElement('a');
      link.href=url; link.download='midi-inspection.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
  async loadCatalogue() {
    try {
      const response=await fetch('/static/library/catalogue.json'); if(!response.ok) throw new Error('Library catalogue unavailable.');
      const catalogue=await response.json(); if(catalogue.version!==1 || !Array.isArray(catalogue.pieces)) throw new Error('Unsupported library catalogue.');
      this.library=catalogue.pieces.slice(0,500).filter(piece=>/^[a-z0-9-]+\.json$/.test(piece.inspection));
      for(const field of LIBRARY_FIELDS) {
        const select=$('library-'+field);
        select.replaceChildren(new Option('All',''),...libraryFacets(this.library,field).map(value=>new Option(value,value)));
        select.disabled=!this.library.length;
      }
      $('library-search').disabled=!this.library.length; this.renderRecent();
      this.renderLibrary();
    } catch(error) {$('library-status').textContent=error.message;}
  }
  libraryFilters() {return {...Object.fromEntries(LIBRARY_FIELDS.map(field=>[field,$('library-'+field).value])),query:$('library-search').value};}
  renderLibrary() {
    const select=$('library-piece'), selected=select.value;
    const pieces=filterLibrary(this.library,this.libraryFilters());
    select.replaceChildren(new Option(pieces.length ? 'Choose a piece' : 'No matching pieces',''),...pieces.map(piece=>new Option(`${piece.composer} · ${piece.title}`,piece.id)));
    if(pieces.some(piece=>piece.id===selected)) select.value=selected;
    select.disabled=!pieces.length; $('load-piece').disabled=!select.value; $('random-piece').disabled=!pieces.length;
    $('library-status').textContent=`${pieces.length} of ${this.library.length} pieces`;
  }
  async loadPiece() {
    const piece=this.library.find(entry=>entry.id===$('library-piece').value); if(!piece) return;
    const revision=++this.revision; $('score-status').textContent='Loading piece…'; this.onPassageChange();
    try {
      const response=await fetch('/static/library/'+piece.inspection); if(!response.ok) throw new Error('The bundled piece could not be loaded.');
      const score=await response.json(); if(revision!==this.revision) return;
      if(score.version!==1 || score.sha256!==piece.sha256 || !Array.isArray(score.notes)) throw new Error('Library inspection does not match its catalogue.');
      $('score-file').value=''; this.useScore(score,piece.title);
      $('library-credit').textContent=`${piece.composer} · ${piece.style} · ${piece.licence}. ${piece.reading_focus}`;
      $('library-source').href=piece.source_page; $('library-source').hidden=false;
      this.recent=rememberLibraryPiece(this.recent,piece); this.recentInvalid=false;
      $('recent-status').textContent=this.persistRecent() ? '' : 'Recent pieces are available for this visit only.';
      this.renderRecent();
    } catch(error) {if(revision===this.revision) $('score-status').textContent='Load failed: '+error.message;}
  }
  updateKeyStatus() {
    const info=this.keyInfo, selected=KEYS.find(key=>key.id===this.getSettings().key);
    if(!info || !this.score) { $('score-key-status').textContent=''; return; }
    let text;
    if(info.keyId) {
      text = info.originalLabel
        ? `Written key after transposition: ${info.label} (source: ${info.originalLabel}).`
        : info.source === 'midi' ? `Key signature in MIDI: ${info.label}.` : `Estimated from MIDI pitches: ${info.label}.`;
      text+=this.practiceUsesSourceKey ? ` Practice signature: ${selected?.label||'C major / A minor'}.` : ` Starting this passage will select ${KEYS.find(key=>key.id===info.keyId)?.label||info.label}.`;
    } else {
      text=info.ambiguous ? 'Conflicting opening key signatures in the MIDI.' : 'No reliable opening key signature found in the MIDI.';
      text+=` Practice will keep ${selected?.label||'C major / A minor'} from Practice setup.`;
    }
    if(info.changes.length) text+=` ${info.changes.length} later key change${info.changes.length===1?'':'s'} are recorded; this untimed attack outline uses one key throughout.`;
    $('score-key-status').textContent=text;
  }
  practiceStarted() {this.practiceUsesSourceKey=true; this.updateKeyStatus();}
  persistRecent() {
    try {
      if(this.recent.length) localStorage.setItem(RECENT,JSON.stringify({version:1,pieces:this.recent}));
      else localStorage.removeItem(RECENT);
      return true;
    } catch {return false;}
  }
  renderRecent() {
    const pieces=recentLibraryPieces(this.library,this.recent);
    $('recent-piece').replaceChildren(new Option(pieces.length ? 'Choose a recent piece' : 'No recent pieces',''),...pieces.map(piece=>new Option(`${piece.composer} · ${piece.title}`,piece.id)));
    $('recent-piece').disabled=!pieces.length; $('clear-recent').disabled=!this.recent.length && !this.recentInvalid;
  }
  async readFile(file) {
    const revision=++this.revision; $('score-status').textContent='Reading MIDI…'; this.onPassageChange();
    try {
      if(file.size>256000) throw new Error('Choose a MIDI file no larger than 256 KB.');
      const response=await fetch('/api/inspect-midi',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
      const result=await response.json(); if(revision!==this.revision) return;
      if(!response.ok) throw new Error(result.error||'MIDI could not be read.');
      $('library-piece').value=''; $('load-piece').disabled=true; $('library-credit').textContent=''; $('library-source').hidden=true;
      this.useScore(result,file.name);
    } catch(error) {if(revision===this.revision) $('score-status').textContent='Import failed: '+error.message;}
  }
  useScore(score,filename) {
    this.score=score; this.filename=filename; this.practiceUsesSourceKey=false;
    $('file-offset').closest('label').hidden = score.provenance?.written_for === 'saxophone';
    $('score-status').textContent=`${filename} · ${score.notes.length} attacks · ${score.tracks.length} tracks · ${score.duration_seconds.toFixed(1)} s${score.warning_count ? ' · '+score.warning_count+' warnings' : ''}`;
    $('score-details').textContent=score.tracks.map(track=>track.name).join(' · '); $('score-warnings').textContent=score.warnings.join(' ');
    $('export-score').disabled=false; this.drawTracks();
    const count=attackGroups(score).length;
    for(const id of ['passage-start','passage-end']) {$(id).disabled=!count; $(id).max=Math.max(1,count);}
    $('passage-start').value=1; $('passage-end').value=Math.min(512,count)||1; $('passage-name').value='';
    this.sections=suggestPassages(score);
    $('suggested-passages').replaceChildren(new Option('Choose a suggested section',''),...this.sections.map((section,i)=>new Option(`${section.label} · attacks ${section.start}–${section.end} · ${section.reason}`,String(i))));
    $('suggested-passages').disabled=!this.sections.length;
    this.refresh(); this.renderPassages(); this.onPassageChange(); $('passage-status').textContent='';
  }
  persistPassages() {try {localStorage.setItem(PASSAGES,JSON.stringify(this.savedPassages)); return true;} catch {return false;}}
  renderPassages() {
    const select=$('saved-passages'), selected=select.value;
    const entries=this.score ? this.savedPassages.filter(entry=>entry.hash===this.score.sha256).reverse() : [];
    select.replaceChildren(new Option('Choose a saved passage',''),...entries.map(entry=>new Option(`${entry.label} · ${entry.start}–${entry.end}`,passageKey(entry))));
    if([...select.options].some(option=>option.value===selected)) select.value=selected;
    select.disabled=!entries.length; $('delete-passage').disabled=!select.value;
  }
  activatePassage() {const outline=this.refresh(); if (!outline?.targets.length) return false; this.onPractice(this.score,{start:outline.start,end:outline.end,tracks:this.rules()},this.filename,this.keyInfo); return true;}
  editPassage() {$('suggested-passages').value=''; $('saved-passages').value=''; $('delete-passage').disabled=true; this.refresh(); this.onPassageChange(); this.activatePassage();}
  usePassage() {
    const entry=this.savedPassages.find(item=>passageKey(item)===$('saved-passages').value);
    $('delete-passage').disabled=!entry;
    if(!entry || entry.hash!==this.score?.sha256) return;
    if(entry.end>attackGroups(this.score).length || entry.tracks.some(rule=>!this.score.tracks.some(track=>track.index===rule.track))) {$('passage-status').textContent='Saved range or tracks do not match this file.'; return;}
    $('suggested-passages').value=''; $('passage-start').value=entry.start; $('passage-end').value=entry.end; $('passage-name').value=entry.label;
    for(const control of this.trackControls) {const rule=entry.tracks.find(rule=>rule.track===control.track); control.include.checked=!!rule?.enabled && !control.include.disabled; }
    this.refresh(); this.onPassageChange(); this.activatePassage(); $('passage-status').textContent='Saved passage selected.';
  }
  rules() {return this.trackControls.map(control=>({track:control.track,enabled:control.include.checked,staff:'auto'}));}
  drawTracks() {
    const counts=new Map(); for(const note of this.score.notes) if(note.channel!==9) counts.set(note.track,(counts.get(note.track)||0)+1);
    const container=$('score-tracks'); container.replaceChildren(); this.trackControls=[];
    for(const track of this.score.tracks) {
      const count=counts.get(track.index)||0, row=document.createElement('div'), label=document.createElement('label'), include=document.createElement('input'), name=document.createElement('span');
      row.className='score-track'; label.className='check'; include.type='checkbox'; include.id='score-track-'+track.index; include.checked=!!count; include.disabled=!count;
      name.textContent = `${track.name} · ${count} pitched attacks`;
      label.append(include, name);
      include.addEventListener('change', () => this.editPassage());
      row.append(label);
      container.append(row);
      this.trackControls.push({track:track.index, include});
    }
  }
  refresh() {
    if(!this.score) return null;
    const outline=makeOutline(this.score,this.getSettings(),{start:+$('passage-start').value,end:+$('passage-end').value,tracks:this.rules()});
    const groups=attackGroups(this.score);
    this.keyInfo=scoreKeyForPassage(this.score,{startTick:groups[outline.start-1]?.tick??0,endTick:groups[outline.end-1]?.tick??Infinity});
    const offset = filePitchOffset(this.score, this.getSettings());
    if (offset && this.keyInfo.keyId) {
      this.keyInfo.originalLabel = this.keyInfo.label;
      this.keyInfo.keyId = writtenKey(this.keyInfo.keyId, offset);
      this.keyInfo.label = KEYS.find(key => key.id === this.keyInfo.keyId).label;
    }
    this.updateKeyStatus();
    $('passage-start').value=outline.start; $('passage-end').value=outline.end;
    $('practice-score').disabled=!outline.targets.length;
    $('save-passage').disabled=!outline.totalOnsets || !this.rules().some(rule=>rule.enabled);
    $('outline-status').textContent=outline.targets.length ? `${outline.targets.length} targets · ${outline.retainedNotes} source notes retained · ${outline.omittedNotes} omitted` : 'No eligible attacks. Widen the range or change the MIDI pitch mapping.';
    return outline;
  }
}
