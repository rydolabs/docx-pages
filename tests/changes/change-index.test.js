import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChangeIndex } from '../../src/changes/change-index.js';
import { createChangeNavigator } from '../../src/changes/change-navigation.js';

test('change index groups layout fragments by revision and preserves document order', () => {
  const layout={pages:[
    {columns:[{blocks:[{type:'paragraph',lines:[{fragments:[
      {type:'text',text:'old',revision:{kind:'del',id:'7',author:'A',date:'2026-10-07'}},
      {type:'text',text:'new',revision:{kind:'ins',id:'8',author:'A',date:'2026-10-07'}}
    ]}]}]}]},
    {columns:[{blocks:[{type:'paragraph',lines:[{fragments:[
      {type:'text',text:' value',revision:{kind:'ins',id:'8',author:'A',date:'2026-10-07'}}
    ]}]}]}]}
  ]};
  const index=buildChangeIndex(layout);
  assert.equal(index.counts.total,2);
  assert.equal(index.counts.delete,1);
  assert.equal(index.counts.insert,1);
  assert.deepEqual(index.items.map(item=>item.id),['del-7','ins-8']);
  assert.equal(index.items[0].text,'old');
  assert.equal(index.items[1].text,'new value');
  assert.deepEqual(index.items[1].pages,[1,2]);
  assert.equal(index.items[1].pageNumber,1);
});

test('change index walks header footer tables and footnotes without altering layout', () => {
  const rev={kind:'ins',id:'3'};
  const paragraph=text=>({type:'paragraph',lines:[{fragments:[{type:'text',text,revision:rev}]}]});
  const layout={pages:[{
    header:{blocks:[paragraph('H')]},
    footer:{blocks:[paragraph('F')]},
    columns:[{blocks:[{type:'table',rows:[{cells:[{blocks:[paragraph('T')]}]}]}]}],
    footnotes:{blocks:[paragraph('N')]}
  }]};
  const snapshot=JSON.stringify(layout);
  const index=buildChangeIndex(layout);
  assert.equal(index.items.length,1);
  assert.equal(index.items[0].text,'HFTN');
  assert.equal(JSON.stringify(layout),snapshot);
});

test('change navigator moves by index/id and wraps next/previous', () => {
  const make=(id)=>({dataset:{changeId:id},children:[],calls:0,scrollIntoView(){this.calls++;}});
  const a=make('ins-1'), b=make('del-2');
  const root={dataset:{},children:[a,b]};
  const nav=createChangeNavigator(root,{items:[{id:'ins-1'},{id:'del-2'}]});
  assert.equal(nav.count,2);
  assert.equal(nav.next().id,'ins-1');
  assert.equal(a.calls,1);
  assert.equal(nav.next().id,'del-2');
  assert.equal(b.dataset.changeCurrent,'true');
  assert.equal(nav.next().id,'ins-1');
  assert.equal(nav.previous().id,'del-2');
  assert.equal(nav.goTo('ins-1').id,'ins-1');
  assert.equal(nav.goTo('missing'),null);
});
