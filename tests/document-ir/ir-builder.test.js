import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentIR } from '../../src/document-ir/ir-builder.js';

test('builds renderer-independent IR', () => {
  const resolved={type:'resolved-document',body:[{type:'paragraph',computedStyle:{alignment:'left'},children:[{type:'run',computedStyle:{size:18},children:[{type:'text',value:'hello'}]}]}],resources:{},settings:{}};
  const ir=buildDocumentIR(resolved);
  assert.equal(ir.type,'document');
  assert.equal(ir.sections[0].children[0].type,'paragraph');
  assert.equal(ir.sections[0].children[0].children[0].children[0].value,'hello');
  assert.equal(JSON.stringify(ir).includes('className'),false);
  assert.equal(JSON.stringify(ir).includes('cssStyle'),false);
});

test('comment stories and inline markers survive into renderer-independent IR', () => {
  const resolved = {
    type: 'resolved-document', body: [{
      type: 'paragraph', computedStyle: {}, children: [
        { type:'comment-range-start', id:3 },
        { type:'run', computedStyle:{}, children:[{type:'text', value:'reviewed'}] },
        { type:'comment-range-end', id:3 },
        { type:'run', computedStyle:{}, children:[{type:'comment-reference', id:3}] }
      ]
    }], finalSection:{}, resources:{}, settings:{}, headers:{}, footers:{}, footnotes:{}, endnotes:{},
    comments: { 3:{ id:3, author:'Reviewer', content:[{ type:'paragraph', computedStyle:{}, children:[{type:'run', computedStyle:{}, children:[{type:'text',value:'Comment text'}]}] }] } }
  };
  const ir = buildDocumentIR(resolved);
  assert.equal(ir.comments[3].author, 'Reviewer');
  assert.equal(ir.comments[3].content[0].children[0].children[0].value, 'Comment text');
  assert.equal(ir.sections[0].children[0].children[0].type, 'comment-range-start');
  assert.equal(ir.sections[0].children[0].children[3].children[0].type, 'comment-reference');
});

test('inherits missing header/footer reference types from the previous section', () => {
  const resolved={
    type:'resolved-document', body:[
      {type:'paragraph',properties:{section:{headerReferences:[{type:'default',relationshipId:'h1'},{type:'even',relationshipId:'he1'}],footerReferences:[{type:'default',relationshipId:'f1'}]}},computedStyle:{},children:[]},
      {type:'paragraph',properties:{section:{headerReferences:[],footerReferences:[]}},computedStyle:{},children:[]},
      {type:'paragraph',properties:{},computedStyle:{},children:[]}
    ], finalSection:{headerReferences:[{type:'default',relationshipId:'h3'}],footerReferences:[]}, resources:{}, settings:{}, headers:{}, footers:{}, footnotes:{}, endnotes:{}, comments:{}
  };
  const ir=buildDocumentIR(resolved);
  assert.deepEqual(ir.sections[1].headerRefs.map(r=>[r.type,r.relationshipId]), [['default','h1'],['even','he1']]);
  assert.deepEqual(ir.sections[1].footerRefs.map(r=>[r.type,r.relationshipId]), [['default','f1']]);
  assert.deepEqual(ir.sections[2].headerRefs.map(r=>[r.type,r.relationshipId]), [['default','h3'],['even','he1']]);
  assert.deepEqual(ir.sections[2].footerRefs.map(r=>[r.type,r.relationshipId]), [['default','f1']]);
});

test('nested table keeps its resolved table style when converted to IR', () => {
  const nested={type:'table',computedStyle:{borders:{top:{value:'single'}}},properties:{styleId:'Grid'},grid:[1000],rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{},children:[{type:'paragraph',computedStyle:{},children:[]}]}]}]};
  const outer={type:'table',computedStyle:{},properties:{},grid:[2000],rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{},children:[nested]}]}]};
  const resolved={type:'resolved-document',body:[outer],finalSection:{},resources:{},settings:{},headers:{},footers:{},footnotes:{},endnotes:{},comments:{}};
  const ir=buildDocumentIR(resolved);
  const child=ir.sections[0].children[0].rows[0].cells[0].children[0];
  assert.equal(child.type,'table');
  assert.equal(child.style.borders.top.value,'single');
});
