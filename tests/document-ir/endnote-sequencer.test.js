import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEndnoteLabels } from '../../src/document-ir/endnote-sequencer.js';

test('endnote labels reuse the shared note sequencer and preserve reference order', () => {
  const document={
    sections:[{properties:{endnotes:{start:3,format:'upperRoman'}},children:[
      {type:'paragraph',children:[{type:'run',children:[{type:'endnote-reference',id:9}]}]},
      {type:'paragraph',children:[{type:'run',children:[{type:'endnote-reference',id:2}]}]}
    ]}],
    endnotes:{
      2:{id:2,content:[{type:'paragraph',children:[{type:'run',children:[{type:'endnote-ref'}]}]}]},
      9:{id:9,content:[{type:'paragraph',children:[{type:'run',children:[{type:'endnote-ref'}]}]}]}
    }
  };
  const out=applyEndnoteLabels(document);
  assert.equal(out.endnotes[9].displayLabel,'III');
  assert.equal(out.endnotes[9].sequenceIndex,0);
  assert.equal(out.endnotes[2].displayLabel,'IV');
  assert.equal(out.endnotes[2].sequenceIndex,1);
  assert.equal(out.endnotes[9].content[0].children[0].children[0].displayLabel,'III');
});
