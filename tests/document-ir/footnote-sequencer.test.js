import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFootnoteLabels } from '../../src/document-ir/footnote-sequencer.js';

test('footnote labels follow body reference order rather than package ids', () => {
  const document = {
    sections:[{children:[
      {type:'paragraph',children:[{type:'run',children:[{type:'footnote-reference',id:8}]}]},
      {type:'paragraph',children:[{type:'run',children:[{type:'footnote-reference',id:3}]}]},
      {type:'paragraph',children:[{type:'run',children:[{type:'footnote-reference',id:8}]}]}
    ]}],
    footnotes:{
      3:{id:3,content:[{type:'paragraph',children:[{type:'run',children:[{type:'footnote-ref'}]}]}]},
      8:{id:8,content:[{type:'paragraph',children:[{type:'run',children:[{type:'footnote-ref'}]}]}]}
    }
  };
  const out=applyFootnoteLabels(document);
  assert.equal(out.sections[0].children[0].children[0].children[0].displayLabel,'1');
  assert.equal(out.sections[0].children[1].children[0].children[0].displayLabel,'2');
  assert.equal(out.sections[0].children[2].children[0].children[0].displayLabel,'1');
  assert.equal(out.footnotes[8].displayLabel,'1');
  assert.equal(out.footnotes[8].content[0].children[0].children[0].displayLabel,'1');
  assert.equal(out.footnotes[3].displayLabel,'2');
});

test('footnote labels honor lightweight section start/format and each-section restart', () => {
  const ref=id=>({type:'paragraph',children:[{type:'run',children:[{type:'footnote-reference',id}]}]});
  const document={
    sections:[
      {properties:{footnotes:{start:4,format:'upperLetter',restart:'eachSect'}},children:[ref(10),ref(11)]},
      {properties:{footnotes:{start:2,format:'lowerRoman',restart:'eachSect'}},children:[ref(12)]}
    ],
    footnotes:{10:{id:10,content:[]},11:{id:11,content:[]},12:{id:12,content:[]}}
  };
  const out=applyFootnoteLabels(document);
  assert.equal(out.footnotes[10].displayLabel,'D');
  assert.equal(out.footnotes[11].displayLabel,'E');
  assert.equal(out.footnotes[12].displayLabel,'ii');
});
