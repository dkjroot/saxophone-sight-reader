import {cadenceLabels} from './harmony.js';
import {AttemptTracker,cleanHistory,summary,exerciseIdentity,grouped,daily,dailyPlot,parseHistory,mergeHistory,readingPatterns,clearHistoryPeriod} from './metrics.js';
const $=id=>document.getElementById(id);
const STORE='saxophone-sight-reader-history-v1', PREF='saxophone-sight-reader-save-history';
const seconds=value=>value===null ? '—' : (value/1000).toFixed(2)+' s';
export class ProgressPanel {
  constructor() {
    this.tracker=new AttemptTracker(); this.records=[]; this.identity=''; this.saveTimer=null; this.maxSaveTimer=null; this.pauses=new Set(); this.importRevision=0;
    try {this.records=cleanHistory(JSON.parse(localStorage.getItem(STORE)||'[]')); $('save-history').checked=localStorage.getItem(PREF)==='true';} catch { $('history-status').textContent='Saved history is unavailable; session measurements still work.'; }
    $('save-history').addEventListener('change',()=>{try {localStorage.setItem(PREF,String($('save-history').checked));} catch {} this.scheduleSave();});
    $('import-history').addEventListener('click',()=>$('history-file').click());
    $('history-file').addEventListener('change',async()=>{
      const revision=++this.importRevision, file=$('history-file').files[0]; if(!file) return;
      try {
        if(file.size>16_000_000) throw new Error('History files must be no larger than 16 MB.');
        const text=await file.text(); if(revision!==this.importRevision) return;
        const records=parseHistory(text);
        this.records=mergeHistory(this.records,records); this.scheduleSave(); this.render();
        $('history-import-status').textContent=`History imported · ${this.records.length} attempts in total.`;
      } catch(error) {if(revision===this.importRevision) $('history-import-status').textContent='Import failed: '+error.message;}
      finally {if(revision===this.importRevision) $('history-file').value='';}
    });
    $('analysis-dimension').addEventListener('change',()=>this.render());
    for(const [id,period] of [['clear-history','all'],['clear-today','today'],['clear-hour','hour']]) $(id).addEventListener('click',()=>this.clear(period));
    $('export-history').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,records:this.records},null,2)],{type:'application/json'}));
      const link=document.createElement('a'); link.href=url; link.download='piano-progress-'+new Date().toISOString().slice(0,10)+'.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    window.addEventListener('pagehide',()=>this.flushSave());
    document.addEventListener('visibilitychange',()=>{if(document.hidden) this.flushSave();});
    this.render();
  }
  clear(period) {
    this.importRevision++; $('history-file').value=''; $('history-import-status').textContent=''; this.cancelSave();
    const before=this.records.length; this.records=clearHistoryPeriod(this.records,period);
    try {
      if(!this.records.length) localStorage.removeItem(STORE);
      else if($('save-history').checked || localStorage.getItem(STORE)!==null) localStorage.setItem(STORE,JSON.stringify(this.records));
      $('history-status').textContent=period==='all' ? '' : `${before-this.records.length} attempts cleared.`;
    } catch {$('history-status').textContent='Cleared for this visit; saved history could not be updated.';}
    this.render();
  }
  start(notes,settings,phrase) {
    this.identity=exerciseIdentity(notes,settings,phrase);
    const context={identity:this.identity,key:settings.key,hand:settings.hand,source:settings.source||'random',mode:settings.endAction,scoreTitle:settings.scoreTitle||null};
    this.tracker.start(notes,context); if (this.pauses.size || document.hidden || !document.hasFocus()) this.tracker.pause(); this.renderBest();
  }
  observe(held) {this.tracker.observe(held);}
  complete() {
    const record=this.tracker.finish(); if (!record) return;
    this.records.push(record); this.records=this.records.slice(-1000);
    this.scheduleSave(); setTimeout(()=>this.render(),0);
  }
  pause(reason='window') {this.pauses.add(reason); this.tracker.pause();}
  resume(reason='window') {this.pauses.delete(reason); if(!this.pauses.size && !document.hidden && document.hasFocus()) this.tracker.resume();}
  cancelSave() {
    clearTimeout(this.saveTimer); clearTimeout(this.maxSaveTimer); this.saveTimer=this.maxSaveTimer=null;
  }
  flushSave() {
    const dirty=this.saveTimer!==null || this.maxSaveTimer!==null;
    this.cancelSave();
    if(!dirty || !$('save-history').checked) return;
    try {localStorage.setItem(STORE,JSON.stringify(this.records)); $('history-status').textContent='';}
    catch {$('history-status').textContent='History could not be saved; export it to keep this session.';}
  }
  scheduleSave() {
    clearTimeout(this.saveTimer);
    if (!$('save-history').checked) {this.cancelSave(); return;}
    this.saveTimer=setTimeout(()=>this.flushSave(),200);
    if(this.maxSaveTimer===null) this.maxSaveTimer=setTimeout(()=>this.flushSave(),2000);
  }
  renderBest() {
    const best=this.records.filter(r=>r.context.identity===this.identity && r.firstAttemptCorrect).map(r=>r.responseMs);
    $('stats-best').textContent=seconds(best.length ? Math.min(...best) : null);
  }
  render() {
    const stats=summary(this.records);
    $('stats-count').textContent=stats.count;
    $('stats-mean').textContent=seconds(stats.mean);
    $('stats-median').textContent=seconds(stats.median);
    $('stats-tail').textContent=seconds(stats.p90);
    $('stats-accuracy').textContent=stats.accuracy===null ? '—' : Math.round(stats.accuracy*100)+'%';
    this.renderBest();
    const body=$('analysis-rows'); body.replaceChildren();
    for (const row of grouped(this.records,$('analysis-dimension').value).slice(0,40)) {
      const tr=document.createElement('tr');
      for (const value of [row.label,row.count,Math.round(row.accuracy*100)+'%',seconds(row.median)]) {const td=document.createElement('td'); td.textContent=value; tr.append(td);}
      body.append(tr);
    }
    const patterns=readingPatterns(this.records), patternBody=$('pattern-rows'); patternBody.replaceChildren();
    $('patterns-empty').hidden=!!patterns.length; $('patterns-table').hidden=!patterns.length;
    for(const pattern of patterns) {
      const row=document.createElement('tr'), context=pattern.context;
      const source=context.source==='midi' && context.scoreTitle ? context.scoreTitle : ({random:'Random',triads:'Diatonic',cadence:'Cadence',midi:'Local score'})[context.source]||'Practice';
      const mode=context.mode==='repeat' ? 'Repeat' : 'Continuous';
      const material=({white:'In key',sharps:'Chromatic ♯',flats:'Chromatic ♭'})[context.material]||'';
      const hand=({left:'Bass',right:'Treble',both:'Both staves'})[context.hand]||'';
      const passage=context.passage ? ` · attacks ${context.passage.start}–${context.passage.end}` : '';
      const harmony=context.harmonyKind==='sevenths' ? ' · Sevenths' : '';
      const cadenceIndex=['authentic','ii-v-i','turnaround'].indexOf(context.cadenceShape);
      const cadence=cadenceIndex<0 ? '' : cadenceLabels(context.harmonyScale==='minor',context.harmonyKind==='sevenths')[cadenceIndex];
      const scope=`${source}${harmony}${cadence ? ' · '+cadence : ''} · ${mode} · ${hand} · ${context.key||''} · ${material} · MIDI ${context.low}–${context.high}${passage}`;
      for(const value of [pattern.note,pattern.staff,scope,pattern.count,pattern.corrected,seconds(pattern.median),pattern.flags.join(' · ')]) {const cell=document.createElement('td'); cell.textContent=value; row.append(cell);}
      patternBody.append(row);
    }
    const days=daily(this.records);
    const dailyBody=$('daily-rows'); dailyBody.replaceChildren();
    for(const day of days) {const row=document.createElement('tr'); for(const value of [day.day,day.count,seconds(day.median),Math.round(day.accuracy*100)+'%']) {const cell=document.createElement('td'); cell.textContent=value; row.append(cell);} dailyBody.append(row);}
    const plot=dailyPlot(days), points=plot.map(day=>`${day.x},${day.y}`).join(' ');
    const labels=days.length===1 ? `<text x="320" y="135" text-anchor="middle">${days[0].day}</text>` : days.length ? `<text x="30" y="135">${days[0].day}</text><text x="610" y="135" text-anchor="end">${days.at(-1).day}</text>` : '';
    $('progress-chart').innerHTML=days.length ? `<svg viewBox="0 0 640 140" role="img" aria-label="Daily median response time across ${days.length} recorded UTC days"><path d="M30 10V110H620" class="chart-axis"/><polyline points="${points}" class="chart-line"/>${plot.map(day=>`<circle cx="${day.x}" cy="${day.y}" r="4" class="chart-point"><title>${day.day}: ${seconds(day.median)}, ${day.count} attempts</title></circle>`).join('')}${labels}</svg>` : '';
  }
}
