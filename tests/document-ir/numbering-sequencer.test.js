import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNumberingLabels, createNumberingSequencer } from '../../src/document-ir/numbering-sequencer.js';

test('numbering sequencer increments decimal labels and resets deeper levels', () => {
  const seq = createNumberingSequencer();
  const levels = {
    0:{start:1,format:'decimal',text:'%1.',suffix:'space'},
    1:{start:1,format:'decimal',text:'%1.%2.',suffix:'tab'}
  };
  const n0={numId:7,level:0,...levels[0],levels};
  const n1={numId:7,level:1,...levels[1],levels};
  assert.equal(seq.next(n0).text,'1.');
  assert.equal(seq.next(n1).text,'1.1.');
  assert.equal(seq.next(n1).text,'1.2.');
  assert.equal(seq.next(n0).text,'2.');
  assert.equal(seq.next(n1).text,'2.1.');
});

test('numbering sequencer supports bullet and common alphabetic/roman formats without renderer logic', () => {
  const seq=createNumberingSequencer();
  assert.equal(seq.next({numId:1,level:0,start:1,format:'bullet',text:'•',suffix:'tab'}).text,'•');
  assert.equal(seq.next({numId:2,level:0,start:1,format:'upperLetter',text:'%1)',suffix:'space'}).text,'A)');
  assert.equal(seq.next({numId:3,level:0,start:4,format:'lowerRoman',text:'%1.',suffix:'nothing'}).text,'iv.');
});

test('IR numbering annotation traverses paragraphs inside table cells in document order', () => {
  const numbering={numId:3,level:0,start:1,format:'decimal',text:'%1.',suffix:'space',levels:{0:{start:1,format:'decimal',text:'%1.',suffix:'space'}}};
  const document={sections:[{children:[
    {type:'paragraph',numbering,children:[]},
    {type:'table',rows:[{type:'row',cells:[{type:'cell',children:[{type:'paragraph',numbering,children:[]}]}]}]},
    {type:'paragraph',numbering,children:[]}
  ]}]};
  const out=applyNumberingLabels(document);
  assert.equal(out.sections[0].children[0].numberingLabel.text,'1.');
  assert.equal(out.sections[0].children[1].rows[0].cells[0].children[0].numberingLabel.text,'2.');
  assert.equal(out.sections[0].children[2].numberingLabel.text,'3.');
});

test('header/footer numbering uses independent story counters from the document body', () => {
  const numbering={numId:4,level:0,start:1,format:'decimal',text:'%1.',suffix:'space',levels:{0:{start:1,format:'decimal',text:'%1.',suffix:'space'}}};
  const document={
    sections:[{children:[{type:'paragraph',numbering,children:[]}]}],
    headers:{h1:{content:[{type:'paragraph',numbering,children:[]}]}},
    footers:{f1:{content:[{type:'paragraph',numbering,children:[]}]}}
  };
  const out=applyNumberingLabels(document);
  assert.equal(out.sections[0].children[0].numberingLabel.text,'1.');
  assert.equal(out.headers.h1.content[0].numberingLabel.text,'1.');
  assert.equal(out.footers.f1.content[0].numberingLabel.text,'1.');
});

test('legacy Symbol and Wingdings private-use bullets normalize to portable Unicode glyphs', () => {
  const seq=createNumberingSequencer();
  assert.equal(seq.next({numId:11,level:0,format:'bullet',text:'\uf0b7',runProperties:{fonts:{ascii:'Symbol'}}}).text,'•');
  assert.equal(seq.next({numId:12,level:0,format:'bullet',text:'\uf06c',runProperties:{fonts:{ascii:'Wingdings'}}}).text,'●');
  assert.equal(seq.next({numId:13,level:0,format:'bullet',text:'\uf075',runProperties:{fonts:{ascii:'Wingdings'}}}).text,'◆');
  assert.equal(seq.next({numId:14,level:0,format:'bullet',text:'\uf06e',runProperties:{fonts:{ascii:'Wingdings'}}}).text,'■');
  assert.equal(seq.next({numId:15,level:0,format:'bullet',text:'\uf0fc',runProperties:{fonts:{ascii:'Wingdings'}}}).text,'✔');
});

test('normalized legacy bullet keeps source symbol family for portable fallback resolution', () => {
  const seq=createNumberingSequencer();
  const label=seq.next({numId:21,level:0,format:'bullet',text:'\uf0e8',runProperties:{fonts:{ascii:'Wingdings',hAnsi:'Wingdings'}}});
  assert.equal(label.text,'➔');
  assert.equal(label.style.fonts.ascii,'Wingdings');
});
