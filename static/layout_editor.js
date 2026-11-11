import {fitCustomPanels,parseCustomLayout} from './layout.js';

const storageKey='saxophone-sight-reader-custom-layout-v1';

export class LayoutEditor {
  constructor({workspace,panels,selection,scaleInput,onChange}) {
    Object.assign(this,{workspace,panels,selection,scaleInput,onChange});
    try {this.state=parseCustomLayout(localStorage.getItem(storageKey));} catch {this.state=null;}
    this.active=false;this.frame=0;
    for(const [name,panel] of Object.entries(panels)) {
      const toolbar=panel.querySelector('.layout-toolbar'), resize=panel.querySelector('.layout-resize');
      toolbar.addEventListener('pointerdown',event=>{
        if(event.target.closest('input,select,label,button') && !event.target.closest('.layout-move')) return;
        this.begin(event,name,false);
      });
      resize.addEventListener('pointerdown',event=>this.begin(event,name,true));
      for(const [control,resizing] of [[panel.querySelector('.layout-move'),false],[resize,true]]) {
        control.addEventListener('keydown',event=>{
          const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
          if(!direction) return;
          event.preventDefault();this.activate();
          const box=this.state.panels[name], step=event.shiftKey?40:10;
          box[resizing?'width':'x']+=direction[0]*step;box[resizing?'height':'y']+=direction[1]*step;
          this.state.panels[name]=fitCustomPanels(this.state.panels,this.workspace.clientWidth)[name];
          this.apply();this.save();
        });
      }
    }
    scaleInput.addEventListener('input',()=>{
      this.activate();this.state.scale=Number(scaleInput.value)/100;this.apply();
    });
    scaleInput.addEventListener('change',()=>this.save());
    selection.addEventListener('change',()=>{
      if(selection.value==='custom') {this.activate(true);this.apply();this.save();}
      else this.presets();
    });
    this.observer=new ResizeObserver(()=>{
      if(this.active && !this.drag) this.schedule();
    });
    this.observer.observe(workspace);
  }
  restore() {
    if(this.selection.value==='custom') {this.activate(true);this.apply();}
    else this.syncPresetScale(document.documentElement.dataset.layout);
  }
  syncPresetScale(preset) {
    this.scaleInput.value=preset==='720'?75:100;
    document.getElementById('staff-scale-value').textContent=this.scaleInput.value+'%';
  }
  activate(restore=false) {
    if(this.active) return;
    let origin;
    if(!restore || !this.state) {
      origin=this.workspace.getBoundingClientRect();
      this.state={version:1,density:document.documentElement.dataset.density||'compact',scale:document.documentElement.dataset.layout==='720' ? .75 : 1,panels:{}};
      for(const [name,panel] of Object.entries(this.panels)) {
        const box=panel.getBoundingClientRect();
        this.state.panels[name]={x:box.x-origin.x,y:box.y-origin.y,width:box.width,height:box.height};
      }
    }
    this.active=true;this.selection.value='custom';this.workspace.classList.add('custom-layout');
    document.documentElement.dataset.layout='custom';
    if(origin) {
      const current=this.workspace.getBoundingClientRect();
      for(const box of Object.values(this.state.panels)) {box.x+=origin.x-current.x;box.y+=origin.y-current.y;}
    }
    try {localStorage.setItem('saxophone-sight-reader-density','custom');} catch { /* Storage is optional. */ }
  }
  apply() {
    if(!this.active) return;
    const width=this.workspace.clientWidth, fitted=fitCustomPanels(this.state.panels,width);
    let bottom=0;
    for(const [name,panel] of Object.entries(this.panels)) {
      // Fit to today's viewport without overwriting the saved desktop geometry.
      const box=fitted[name];
      Object.assign(panel.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});
      bottom=Math.max(bottom,box.y+box.height);
    }
    this.workspace.style.height=bottom+12+'px';
    this.scaleInput.value=Math.round(this.state.scale*100);
    document.getElementById('staff-scale-value').textContent=this.scaleInput.value+'%';
    this.onChange();
  }
  presets() {
    this.active=false;this.workspace.classList.remove('custom-layout');this.workspace.style.height='';
    for(const panel of Object.values(this.panels)) for(const property of ['left','top','width','height','z-index']) panel.style.removeProperty(property);
    this.scaleInput.value=100;document.getElementById('staff-scale-value').textContent='100%';
    this.onChange();
  }
  save() {
    if(!this.state) return;
    try {localStorage.setItem(storageKey,JSON.stringify(this.state));} catch { /* Session still works. */ }
  }
  schedule() {
    if(!this.frame) this.frame=requestAnimationFrame(()=>{this.frame=0;this.apply();});
  }
  begin(event,name,resizing) {
    if(event.button!==0 || this.drag) return;
    event.preventDefault();this.activate();this.apply();
    const handle=event.currentTarget;
    const box=fitCustomPanels(this.state.panels,this.workspace.clientWidth)[name];
    this.state.panels[name]={...box};
    const start={x:event.pageX,y:event.pageY};
    this.drag=true;handle.setPointerCapture(event.pointerId);
    const move=next=>{
      if(next.pointerId!==event.pointerId) return;
      const dx=next.pageX-start.x,dy=next.pageY-start.y;
      this.state.panels[name]=fitCustomPanels({...this.state.panels,[name]:{...box,...(resizing?{width:box.width+dx,height:box.height+dy}:{x:box.x+dx,y:box.y+dy})}},this.workspace.clientWidth)[name];
      this.schedule();
    };
    const finish=next=>{
      if(next.pointerId!==event.pointerId) return;
      this.drag=false;
      handle.removeEventListener('pointermove',move);
      for(const type of ['pointerup','pointercancel','lostpointercapture']) handle.removeEventListener(type,finish);
      if(handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if(this.frame) {cancelAnimationFrame(this.frame);this.frame=0;}
      this.apply();this.save();
    };
    handle.addEventListener('pointermove',move);
    for(const type of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(type,finish);
  }
}
