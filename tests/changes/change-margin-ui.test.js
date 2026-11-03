import test from 'node:test';
import assert from 'node:assert/strict';
import { createChangeMarginUI } from '../../src/changes/change-margin-ui.js';

class Node {
  constructor(tag='div', doc=null){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.className='';this.textContent='';this.listeners={};this.parentNode=null;this.childNodes=this.children;}
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  setAttribute(k,v){this[k]=v;}
  remove(){ if(!this.parentNode)return; const i=this.parentNode.children.indexOf(this); if(i>=0)this.parentNode.children.splice(i,1); this.parentNode=null; }
  click(){this.listeners.click?.({stopPropagation(){}});}
  closest(sel){ if(sel!=='.docx-page') return null; let n=this; while(n){if(String(n.className).split(/\s+/).includes('docx-page'))return n;n=n.parentNode;} return null; }
  getBoundingClientRect(){return this._rect || {top:0,bottom:0,left:0,right:0,width:0,height:0};}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  querySelectorAll(sel){
    const out=[]; const visit=n=>{for(const c of n.children){if(match(c,sel))out.push(c);visit(c);}};visit(this);return out;
  }
}
function match(n,sel){
  if(sel===':scope > .docx-change-margin-overlay') return n.className==='docx-change-margin-overlay';
  if(sel==='.docx-change-popover') return n.className==='docx-change-popover';
  let m=sel.match(/^\[data-change-id="(.+)"\]$/); if(m)return n.dataset.changeId===m[1];
  return false;
}
class Doc { createElement(tag){return new Node(tag,this);} }

test('margin indicators are absolute overlays and do not mutate page geometry',()=>{
  const doc=new Doc(), root=new Node('div',doc), page=new Node('section',doc); page.className='docx-page'; page._rect={top:100,bottom:900,left:20,right:620,width:600,height:800}; root.appendChild(page);
  const span=new Node('span',doc); span.dataset.changeId='ins-2'; span._rect={top:180,bottom:196,left:120,right:160,width:40,height:16}; page.appendChild(span);
  const index={items:[{id:'ins-2',kind:'ins',text:'new',author:'B',date:'2026-10-08'}]};
  const ui=createChangeMarginUI(root,index,null,null,{});
  assert.ok(ui);
  const overlay=page.querySelector(':scope > .docx-change-margin-overlay');
  assert.equal(overlay.style.position,'absolute');
  assert.equal(overlay.style.pointerEvents,'none');
  const bar=overlay.children[0];
  assert.equal(bar.dataset.changeId,'ins-2');
  assert.equal(bar.style.top,'80px');
  assert.equal(bar.style.height,'16px');
  assert.equal(page.style.width,undefined);
  assert.equal(page.style.height,undefined);
});

test('clicking a margin bar synchronizes navigation/review and opens details popover',()=>{
  const doc=new Doc(), root=new Node('div',doc), page=new Node('section',doc); page.className='docx-page'; page._rect={top:0,bottom:800,left:0,right:600,width:600,height:800}; root.appendChild(page);
  const span=new Node('span',doc); span.dataset.changeId='del-1'; span._rect={top:40,bottom:56,left:100,right:140,width:40,height:16}; page.appendChild(span);
  const item={id:'del-1',kind:'del',text:'Delete me',author:'Alice',date:'2026-10-08'};
  const calls=[]; const nav={goTo(id,opts){calls.push(['nav',id,opts.scroll]);return item;}}; const review={selectedId:null,select(id,opts){calls.push(['review',id,opts.scroll]);return item;}};
  const ui=createChangeMarginUI(root,{items:[item]},nav,review,{});
  const overlay=page.querySelector(':scope > .docx-change-margin-overlay');
  overlay.children[0].click();
  assert.deepEqual(calls,[['nav','del-1',false],['review','del-1',false]]);
  const pop=overlay.querySelector('.docx-change-popover');
  assert.ok(pop);
  assert.equal(pop.children[0].children[0].textContent,'Deleted');
  assert.equal(pop.children[0].children[1].textContent,'Delete me');
  assert.match(pop.children[0].children[2].textContent,/Alice/);
});
