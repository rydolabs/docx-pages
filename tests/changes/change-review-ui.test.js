import test from 'node:test';
import assert from 'node:assert/strict';
import { createChangeReviewUI } from '../../src/changes/change-review-ui.js';

class Node {
  constructor(tag='div', doc=null){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.className='';this.textContent='';this.listeners={};}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(type,fn){this.listeners[type]=fn;}
  click(){this.listeners.click?.();}
}
class Doc { createElement(tag){return new Node(tag,this);} }

const index={
  counts:{total:4,insert:1,delete:1,moveFrom:1,moveTo:1},
  items:[
    {id:'del-1',kind:'del',text:'old',pageNumber:1,author:'A'},
    {id:'ins-2',kind:'ins',text:'new',pageNumber:1,author:'B'},
    {id:'moveFrom-3',kind:'moveFrom',text:'moved',pageNumber:2},
    {id:'moveTo-4',kind:'moveTo',text:'moved',pageNumber:3}
  ]
};

test('change review UI renders counts, list items, and filters without mutating index',()=>{
  const doc=new Doc(), target=new Node('aside',doc);
  const snapshot=JSON.stringify(index);
  const ui=createChangeReviewUI(target,index,{goTo(){return null;}},{style:'none'});
  assert.equal(ui.root.dataset.changeReview,'true');
  assert.equal(ui.root.children[0].children[0].textContent,'변경사항 4');
  assert.equal(ui.root.children[1].textContent,'추가 1 · 삭제 1 · 이동 2');
  assert.equal(ui.root.children[3].children.length,4);
  ui.setFilter('insert');
  assert.equal(ui.root.children[3].children.length,1);
  assert.equal(ui.root.children[3].children[0].dataset.changeId,'ins-2');
  assert.equal(JSON.stringify(index),snapshot);
});

test('change review UI delegates item selection and next/previous navigation',()=>{
  const doc=new Doc(), target=new Node('aside',doc), calls=[];
  const nav={
    goTo(id){calls.push(['goTo',id]);return index.items.find(x=>x.id===id)||null;},
    next(){calls.push(['next']);return index.items[1];},
    previous(){calls.push(['previous']);return index.items[0];}
  };
  const ui=createChangeReviewUI(target,index,nav,{style:'none'});
  ui.select('ins-2');
  assert.equal(ui.selectedId,'ins-2');
  ui.next();
  ui.previous();
  assert.deepEqual(calls,[['goTo','ins-2'],['next'],['previous']]);
  assert.equal(ui.selectedId,'del-1');
});

test('change review UI style none adds no visual root style while custom style stays isolated to UI',()=>{
  const doc=new Doc(), targetA=new Node('aside',doc), targetB=new Node('aside',doc);
  const plain=createChangeReviewUI(targetA,index,null,{style:'none'});
  assert.deepEqual(plain.root.style,{});
  const themed=createChangeReviewUI(targetB,index,null,{style:{background:'#123456'}});
  assert.equal(themed.root.style.background,'#123456');
  assert.deepEqual(index.counts,{total:4,insert:1,delete:1,moveFrom:1,moveTo:1});
});

test('navigation controls do not depend on unicode chevron glyphs',()=>{
  const doc=new Doc(), target=new Node('aside',doc);
  const ui=createChangeReviewUI(target,index,null,{style:'default'});
  const controls=ui.root.children[4];
  const previous=controls.children[0], next=controls.children[1];
  assert.equal(previous.textContent,'');
  assert.equal(next.textContent,'');
  assert.equal(previous.children[0].dataset.direction,'previous');
  assert.equal(next.children[0].dataset.direction,'next');
  assert.equal(previous.children[1].textContent,'이전 변경');
  assert.equal(next.children[1].textContent,'다음 변경');
  assert.match(previous.children[0].style.transform,/rotate\(45deg\)/);
  assert.match(next.children[0].style.transform,/rotate\(225deg\)/);
});

test('default review font stack includes Korean-capable families',()=>{
  const doc=new Doc(), target=new Node('aside',doc);
  const ui=createChangeReviewUI(target,index,null,{style:'default'});
  assert.match(ui.root.style.fontFamily,/Malgun Gothic/);
  assert.match(ui.root.style.fontFamily,/Noto Sans CJK KR/);
});
