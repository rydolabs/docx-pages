import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocument } from '../../src/renderer/renderer.js';
import { renderTable } from '../../src/renderer/table-renderer.js';
import { renderMedia } from '../../src/renderer/media-renderer.js';

class FakeNode {
  constructor(tag='node'){ this.tag=tag; this.children=[]; this.style={}; this.dataset={}; this.className=''; this.textContent=''; this.title=''; }
  appendChild(n){ if(n.tag==='fragment') this.children.push(...n.children); else this.children.push(n); return n; }
  replaceChildren(){ this.children=[]; }
}
class FakeDocument {
  createElement(tag){ return new FakeNode(tag); }
  createDocumentFragment(){ return new FakeNode('fragment'); }
}

test('renderer only paints precomputed layout', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:200,columns:[{blocks:[{type:'paragraph',x:1,y:2,widthPt:90,heightPt:12,lines:[{text:'hello',heightPt:12}]}]}]}]};
  const result=renderDocument(layout,target,{document:doc});
  assert.equal(result.pages,1);
  assert.equal(target.children.length,1);
  const line=target.children[0].children[0].children[0];
  assert.equal(line.textContent,'hello');
  assert.equal(line.style.lineHeight,'12pt');
});

test('table renderer paints precomputed Word borders without resolving styles', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'table',x:0,y:0,widthPt:90,heightPt:20,properties:{borders:{top:{value:'single',size:8,color:'FF0000'},bottom:{value:'single',size:8,color:'FF0000'},left:{value:'single',size:8,color:'FF0000'},right:{value:'single',size:8,color:'FF0000'}}},rows:[{x:0,y:0,heightPt:20,cells:[{x:0,y:0,widthPt:90,heightPt:20,properties:{},blocks:[]}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const cell=target.children[0].children[0].children[0];
  assert.equal(cell.style.borderTopWidth,'1pt');
  assert.equal(cell.style.borderTopColor,'#FF0000');
});

test('renderer paints binary image resources for media blocks', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={resources:{'word/document.xml#rId9':{contentType:'image/png',data:new Uint8Array([137,80,78,71])}},pages:[{widthPt:100,heightPt:100,floats:[{type:'image',x:0,y:0,widthPt:20,heightPt:10,resourceKey:'word/document.xml#rId9',source:{type:'image',resourceKey:'word/document.xml#rId9'}}],columns:[]}]};
  renderDocument(layout,target,{document:doc});
  const media=target.children[0].children[0];
  assert.equal(media.children[0].tag,'img');
  assert.match(media.children[0].src,/^data:image\/png;base64,/);
});

test('renderer paints horizontal text scaling, baseline shift, and paragraph text alignment from layout data', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{
    type:'paragraph',x:0,y:0,widthPt:90,heightPt:12,style:{textAlignment:'center'},lines:[{x:0,y:0,heightPt:12,availableWidthPt:90,fragments:[
      {type:'text',text:'A',widthPt:8,glyphWidthPt:8,style:{fontSizePt:10,textScale:0.8}},
      {type:'text',text:'2',widthPt:5,glyphWidthPt:5,style:{fontSizePt:8,baselineShiftPt:3}}
    ]}]
  }]}]}]};
  renderDocument(layout,target,{document:doc});
  const line=target.children[0].children[0].children[0];
  const scaled=line.children[0];
  const raised=line.children[1];
  assert.equal(scaled.style.transform,'scaleX(0.8)');
  assert.equal(scaled.style.transformOrigin,'left center');
  assert.equal(raised.style.top,'-3pt');
});

test('renderer emits MathML for structured math fragments', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  doc.createElementNS=(ns,tag)=>new FakeNode(tag);
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'math',math:{ast:{type:'fraction',numerator:{type:'row',children:[{type:'text',value:'1'}]},denominator:{type:'row',children:[{type:'text',value:'2'}]}}},style:{fontSizePt:9}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const math=target.children[0].children[0].children[0].children[0];
  assert.equal(math.tag,'math');
  assert.equal(math.children[0].tag,'mfrac');
});

test('renderer emits bounded MathML for roots, n-ary operators, matrices and delimiters', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  doc.createElementNS=(ns,tag)=>new FakeNode(tag);
  const ast={type:'row',children:[
    {type:'radical',body:{type:'text',value:'x'},degree:{type:'text',value:'3'}},
    {type:'nary',operator:'∑',subscript:{type:'text',value:'i=1'},superscript:{type:'text',value:'n'},body:{type:'text',value:'x'}},
    {type:'delimiter',begin:'(',end:')',items:[{type:'matrix',rows:[[{type:'text',value:'1'},{type:'text',value:'2'}],[{type:'text',value:'3'},{type:'text',value:'4'}]]}]}
  ]};
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'math',math:{ast},style:{fontSizePt:9}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const math=target.children[0].children[0].children[0].children[0];
  const row=math.children[0];
  assert.equal(row.children[0].tag,'mroot');
  assert.equal(row.children[1].children[0].tag,'munderover');
  assert.equal(row.children[2].tag,'mrow');
  assert.equal(row.children[2].children[1].tag,'mtable');
});


test('renderer paints resolved DrawingML shape fill and line when no image resource exists', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'media',widthPt:30,heightPt:15,media:{type:'image',visual:{fill:'F2F2F2',line:{widthEmu:1270,color:'F2F2F2'}}}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const media=target.children[0].children[0].children[0].children[0];
  assert.equal(media.style.backgroundColor,'#F2F2F2');
  assert.equal(media.style.border,'0.1pt solid #F2F2F2');
});

test('renderer paints line geometry as one stroke instead of a doubled zero-height box', () => {
  const doc=new FakeDocument();
  const el=renderMedia({
    type:'image',x:0,y:0,widthPt:100,heightPt:0,
    source:{type:'image',visual:{geometry:'line',line:{widthEmu:6350,color:'000000'}}}
  },doc,{});
  assert.equal(el.style.borderTop,'0.5pt solid #000000');
  assert.equal(el.style.border,undefined);
});

test('renderer paints Word text decorations and shading from resolved layout styles', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{
    type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,style:{shading:{resolvedFill:'FFF2CC'}},lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
      {type:'text',text:'decorated',widthPt:40,glyphWidthPt:40,style:{fontSizePt:9,underline:'double',strike:true,shading:{resolvedFill:'DDEBF7'}}}
    ]}]
  }]}]}]};
  renderDocument(layout,target,{document:doc});
  const paragraph=target.children[0].children[0];
  const span=paragraph.children[0].children[0];
  assert.equal(paragraph.style.backgroundColor,'#FFF2CC');
  assert.equal(span.style.backgroundColor,'#DDEBF7');
  assert.match(span.style.textDecorationLine,/underline/);
  assert.match(span.style.textDecorationLine,/line-through/);
  assert.equal(span.style.textDecorationStyle,'double');
});

test('MathML inherits the pre-resolved font family used by layout measurement', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  doc.createElementNS=(ns,tag)=>new FakeNode(tag);
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'math',math:{ast:{type:'text',value:'x'}},style:{fontSizePt:9,fontFamily:'Cambria Math, STIX Two Math, serif'}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const math=target.children[0].children[0].children[0].children[0];
  assert.equal(math.style.fontFamily,'Cambria Math, STIX Two Math, serif');
});

test('table renderer paints resolved table and cell shading without style resolution', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'table',x:0,y:0,widthPt:90,heightPt:20,properties:{shading:{resolvedFill:'FFF2CC'}},rows:[{x:0,y:0,heightPt:20,cells:[{x:0,y:0,widthPt:90,heightPt:20,properties:{shading:{resolvedFill:'DDEBF7'}},blocks:[]}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const table=target.children[0].children[0];
  const cell=table.children[0];
  assert.equal(table.style.backgroundColor,'#FFF2CC');
  assert.equal(cell.style.backgroundColor,'#DDEBF7');
});

test('table renderer paints shared inside borders once instead of duplicating both cell edges', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const b={value:'single',size:4,color:'000000'};
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'table',x:0,y:0,widthPt:80,heightPt:20,properties:{borders:{top:b,bottom:b,left:b,right:b,insideH:b,insideV:b}},rows:[{x:0,y:0,heightPt:10,cells:[{x:0,y:0,widthPt:40,heightPt:10,properties:{},blocks:[]},{x:40,y:0,widthPt:40,heightPt:10,properties:{},blocks:[]}]},{x:0,y:10,heightPt:10,cells:[{x:0,y:10,widthPt:40,heightPt:10,properties:{},blocks:[]},{x:40,y:10,widthPt:40,heightPt:10,properties:{},blocks:[]}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const table=target.children[0].children[0];
  const [a,bCell,c] = table.children;
  assert.equal(a.style.borderRightWidth,'0.5pt');
  assert.equal(bCell.style.borderLeftWidth,undefined);
  assert.equal(a.style.borderBottomWidth,'0.5pt');
  assert.equal(c.style.borderTopWidth,undefined);
});

test('renderer prefers region columns and does not duplicate the flattened page.columns compatibility alias', () => {
  const doc = new FakeDocument(), target = new FakeNode('root');
  const first = { type:'paragraph', x:0, y:0, widthPt:90, heightPt:12, lines:[{ text:'region-1', heightPt:12 }] };
  const second = { type:'paragraph', x:0, y:20, widthPt:90, heightPt:12, lines:[{ text:'region-2', heightPt:12 }] };
  const col1 = { blocks:[first] }, col2 = { blocks:[second] };
  const layout = { pages:[{ widthPt:100, heightPt:100, regions:[{columns:[col1]},{columns:[col2]}], columns:[col1,col2] }] };
  renderDocument(layout, target, { document:doc });
  assert.equal(target.children[0].children.length, 2);
  assert.equal(target.children[0].children[0].children[0].textContent, 'region-1');
  assert.equal(target.children[0].children[1].children[0].textContent, 'region-2');
});

test('renderer paints precomputed page footnotes and separator without footnote semantics', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:120,columns:[],footnotes:{x:10,y:80,widthPt:80,heightPt:25,separatorY:80,blocks:[
    {type:'paragraph',x:10,y:86,widthPt:80,heightPt:12,lines:[{x:10,y:86,heightPt:12,availableWidthPt:80,fragments:[{type:'text',text:'1 note',widthPt:20,style:{fontSizePt:8}}]}]}
  ]}}]};
  renderDocument(layout,target,{document:doc});
  const page=target.children[0];
  const footnotes=page.children.find(child=>child.className==='docx-footnotes');
  assert.ok(footnotes);
  assert.equal(footnotes.children[0].className,'docx-footnote-separator');
  assert.equal(footnotes.children[0].style.top,'80pt');
  assert.equal(footnotes.children[1].className,'docx-paragraph');
});

test('renderer paints external and bookmark hyperlinks plus bookmark targets from layout metadata', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'bookmark',bookmarkName:'Target',text:'',widthPt:0,style:{}},
    {type:'text',text:'OpenAI',widthPt:30,glyphWidthPt:30,style:{fontSizePt:9},link:{target:'https://openai.com/',targetMode:'External'}},
    {type:'text',text:'Back',widthPt:20,glyphWidthPt:20,style:{fontSizePt:9},link:{anchor:'Target'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const line=target.children[0].children[0].children[0];
  assert.equal(line.children[0].id,'Target');
  assert.equal(line.children[1].tag,'a');
  assert.equal(line.children[1].href,'https://openai.com/');
  assert.equal(line.children[1].rel,'noopener noreferrer');
  assert.equal(line.children[2].href,'#Target');
});

test('field hyperlinks stay visually neutral unless run styling explicitly decorates them', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'Field link',widthPt:30,glyphWidthPt:30,style:{fontSizePt:9},link:{target:'https://example.com',targetMode:'External',field:true}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const anchor=target.children[0].children[0].children[0].children[0];
  assert.equal(anchor.tag,'a');
  assert.equal(anchor.style.color,'inherit');
  assert.equal(anchor.style.textDecoration,'none');
});

test('table renderer recursively paints nested table layout blocks', () => {
  const doc=new FakeDocument();
  const nested={type:'table',x:5,y:8,widthPt:40,heightPt:12,properties:{},style:{},rows:[{
    cells:[{type:'cell',x:5,y:8,widthPt:40,heightPt:12,properties:{},blocks:[]}]
  }]};
  const outer={type:'table',x:0,y:0,widthPt:100,heightPt:30,properties:{},style:{},rows:[{
    cells:[{type:'cell',x:0,y:0,widthPt:100,heightPt:30,properties:{},blocks:[nested]}]
  }]};
  const el=renderTable(outer,doc);
  const outerCell=el.children[0];
  assert.equal(outerCell.children.length,1);
  assert.equal(outerCell.children[0].className,'docx-table');
  assert.equal(outerCell.children[0].style.left,'5pt');
  assert.equal(outerCell.children[0].style.top,'8pt');
});


test('media renderer paints precomputed textbox blocks inside the shape', () => {
  const doc=new FakeDocument();
  const block={type:'image',x:0,y:0,widthPt:100,heightPt:50,source:{type:'image',visual:{}},textBox:{x:5,y:4,widthPt:90,heightPt:42,blocks:[
    {type:'paragraph',x:5,y:4,widthPt:90,heightPt:12,lines:[{text:'inside',x:5,y:4,heightPt:12,fragments:[{type:'text',text:'inside',widthPt:20,glyphWidthPt:20,style:{fontSizePt:9}}]}]}
  ]}};
  const el=renderMedia(block,doc,{});
  assert.equal(el.children.length,1);
  assert.equal(el.children[0].className,'docx-paragraph');
  assert.equal(el.children[0].style.left,'0pt');
  assert.equal(el.children[0].style.top,'0pt');
});

test('renderer paints Word run highlight as a bounded text background', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'marked',widthPt:30,glyphWidthPt:30,style:{fontSizePt:9,highlight:'yellow'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.style.backgroundColor,'#FFFF00');
});

test('renderer paints document page background from precomputed layout metadata', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,background:{resolvedColor:'FFF2CC'},columns:[]}]};
  renderDocument(layout,target,{document:doc});
  assert.equal(target.children[0].style.backgroundColor,'#FFF2CC');
});

test('renderer paints bounded basic paragraph borders from layout style', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,style:{borders:{top:{value:'single',size:8,resolvedColor:'FF0000'},bottom:{value:'dashed',size:4,resolvedColor:'00FF00'}}},lines:[]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const paragraph=target.children[0].children[0];
  assert.equal(paragraph.style.borderTopStyle,'solid');
  assert.equal(paragraph.style.borderTopWidth,'1pt');
  assert.equal(paragraph.style.borderTopColor,'#FF0000');
  assert.equal(paragraph.style.borderBottomStyle,'dashed');
});

test('renderer paints East Asian emphasis marks without changing layout geometry', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'text',text:'강조',style:{fontSizePt:9,emphasis:'dot'}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.style.textEmphasisStyle,'dot');
  assert.equal(span.style.textEmphasisPosition,'over right');
});

test('renderer applies DrawingML crop and image accessibility metadata without changing media box', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={resources:{'word/document.xml#rId5':{contentType:'image/png',data:new Uint8Array([137,80,78,71])}},pages:[{widthPt:100,heightPt:100,floats:[{type:'image',x:0,y:0,widthPt:40,heightPt:20,resourceKey:'word/document.xml#rId5',source:{type:'image',resourceKey:'word/document.xml#rId5',docProperties:{description:'A sample image',title:'Sample title'},visual:{crop:{left:10000,top:20000,right:30000,bottom:10000}}}}],columns:[]}]};
  renderDocument(layout,target,{document:doc});
  const media=target.children[0].children[0];
  const img=media.children[0];
  assert.equal(media.style.overflow,'hidden');
  assert.equal(img.alt,'A sample image');
  assert.equal(img.title,'Sample title');
  assert.equal(img.style.position,'absolute');
  assert.notEqual(img.style.width,'100%');
  assert.equal(media.style.width,'40pt');
  assert.equal(media.style.height,'20pt');
});

test('renderer applies bounded paragraph and run RTL metadata', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,style:{bidi:true},lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'text',text:'abc',style:{fontSizePt:9,rtl:true}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const line=target.children[0].children[0].children[0];
  const span=line.children[0];
  assert.equal(line.style.direction,'rtl');
  assert.equal(line.style.unicodeBidi,'plaintext');
  assert.equal(span.style.direction,'rtl');
  assert.equal(span.style.unicodeBidi,'isolate');
});

test('renderer preserves hyperlink tooltip and target frame metadata', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:20,lines:[{x:0,y:0,heightPt:20,availableWidthPt:90,fragments:[{type:'text',text:'link',style:{fontSizePt:9},link:{target:'https://example.com',targetMode:'External',tooltip:'Open site',targetFrame:'_blank'}}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const link=target.children[0].children[0].children[0].children[0];
  assert.equal(link.href,'https://example.com');
  assert.equal(link.title,'Open site');
  assert.equal(link.target,'_blank');
  assert.equal(link.rel,'noopener noreferrer');
});

test('renderer paints only precomputed section column separator geometry', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:120,regions:[{columnSeparators:[{x:50,y:10,heightPt:90,widthPt:0.5}],columns:[{blocks:[]},{blocks:[]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const page=target.children[0];
  const separator=page.children.find(child=>child.className==='docx-column-separator');
  assert.ok(separator);
  assert.equal(separator.style.left,'50pt');
  assert.equal(separator.style.top,'10pt');
  assert.equal(separator.style.height,'90pt');
  assert.equal(separator.style.borderLeft,'0.5pt solid currentColor');
});

test('renderer paints bounded character border and explicit underline color from resolved run style', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'decorated',widthPt:40,glyphWidthPt:40,style:{fontSizePt:9,underline:'single',resolvedUnderlineColor:'00AA00',border:{value:'single',size:8,resolvedColor:'FF0000'}}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.style.borderStyle,'solid');
  assert.equal(span.style.borderWidth,'1pt');
  assert.equal(span.style.borderColor,'#FF0000');
  assert.equal(span.style.textDecorationColor,'#00AA00');
});

test('page renderer respects behindDoc and relativeHeight floating stacking without renderer-side Word layout', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const floating=(fill,behindDoc,relativeHeight)=>({type:'image',x:0,y:0,widthPt:20,heightPt:20,positioning:{behindDoc,relativeHeight},source:{type:'image',visual:{fill}}});
  const body={type:'paragraph',x:0,y:0,widthPt:80,heightPt:12,lines:[{x:0,y:0,heightPt:12,availableWidthPt:80,fragments:[{type:'text',text:'body',widthPt:20,style:{fontSizePt:9}}]}]};
  const layout={pages:[{widthPt:100,heightPt:100,floats:[
    floating('333333','0',30), floating('111111','1',20), floating('222222','0',10)
  ],columns:[{blocks:[body]}]}]};
  renderDocument(layout,target,{document:doc});
  const children=target.children[0].children;
  assert.equal(children[0].style.backgroundColor,'#111111');
  assert.equal(children[1].className,'docx-paragraph');
  assert.equal(children[2].style.backgroundColor,'#222222');
  assert.equal(children[3].style.backgroundColor,'#333333');
});

test('table renderer prefers pre-resolved theme border colors', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const border={value:'single',size:8,color:'auto',themeColor:'accent1',resolvedColor:'4472C4'};
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'table',x:0,y:0,widthPt:90,heightPt:20,properties:{borders:{top:border,left:border,right:border,bottom:border}},rows:[{x:0,y:0,heightPt:20,cells:[{x:0,y:0,widthPt:90,heightPt:20,properties:{},blocks:[]}]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const cell=target.children[0].children[0].children[0];
  assert.equal(cell.style.borderTopColor,'#4472C4');
});

test('table renderer does not paint outer borders on cells that are not on sparse-grid edges', () => {
  const doc=new FakeDocument();
  const outer={value:'single',size:8,color:'000000'};
  const inside={value:'single',size:4,color:'999999'};
  const table={type:'table',x:0,y:0,widthPt:90,heightPt:20,columnWidths:[30,30,30],properties:{borders:{left:outer,right:outer,insideV:inside}},rows:[{
    x:0,y:0,heightPt:20,cells:[{type:'cell',x:30,y:0,widthPt:30,heightPt:20,gridStart:1,gridSpan:1,properties:{},blocks:[]}]
  }]};
  const el=renderTable(table,doc);
  const cell=el.children[0];
  assert.equal(cell.style.borderLeftWidth,'0.5pt');
  assert.equal(cell.style.borderLeftColor,'#999999');
  assert.equal(cell.style.borderRightWidth,'0.5pt');
  assert.equal(cell.style.borderRightColor,'#999999');
});

test('media renderer paints bounded DrawingML dashed lines without a shape engine', () => {
  const doc=new FakeDocument();
  const el=renderMedia({type:'image',x:0,y:0,widthPt:100,heightPt:0,source:{type:'image',visual:{geometry:'line',line:{widthEmu:12700,color:'112233',dash:'dash'}}}},doc,{});
  assert.equal(el.style.borderTop,'1pt dashed #112233');
});

test('renderer preserves dot-dash and dot-dot-dash underline patterns with bounded SVG decoration', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:12,lines:[{x:0,y:0,heightPt:12,availableWidthPt:90,fragments:[
    {type:'text',text:'dot-dash',widthPt:40,glyphWidthPt:40,style:{fontSizePt:9,underline:'dotDash',resolvedUnderlineColor:'336699'}},
    {type:'text',text:'dot-dot-dash',widthPt:50,glyphWidthPt:50,style:{fontSizePt:9,underline:'dotDotDash'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const line=target.children[0].children[0].children[0];
  assert.match(line.children[0].style.backgroundImage, /data:image\/svg\+xml/);
  assert.match(line.children[1].style.backgroundImage, /data:image\/svg\+xml/);
  assert.equal(line.children[0].style.textDecorationLine || '', '');
  assert.equal(line.children[1].style.textDecorationLine || '', '');
});

test('renderer uses a bounded double-wave pattern for wavyDouble underline', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:12,lines:[{x:0,y:0,heightPt:12,availableWidthPt:90,fragments:[
    {type:'text',text:'double wave',widthPt:50,glyphWidthPt:50,style:{fontSizePt:9,underline:'wavyDouble'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const span=target.children[0].children[0].children[0].children[0];
  assert.match(span.style.backgroundImage, /data:image\/svg\+xml/);
  assert.equal(span.style.backgroundRepeat, 'repeat-x');
  assert.equal(span.style.textDecorationLine || '', '');
});


test('renderer decorates revision fragments only when revision metadata is present', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'old',widthPt:15,glyphWidthPt:15,style:{fontSizePt:9},revision:{kind:'del',id:'1',author:'Alice'}},
    {type:'text',text:'new',widthPt:15,glyphWidthPt:15,style:{fontSizePt:9},revision:{kind:'ins',id:'2',author:'Bob'}},
    {type:'text',text:'plain',widthPt:20,glyphWidthPt:20,style:{fontSizePt:9}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc});
  const [deleted,inserted,plain]=target.children[0].children[0].children[0].children;
  assert.equal(deleted.dataset.revisionKind,'del');
  assert.equal(deleted.style.backgroundColor,'#FCEBEB');
  assert.match(deleted.style.textDecorationLine,/line-through/);
  assert.equal(inserted.dataset.revisionKind,'ins');
  assert.equal(inserted.style.backgroundColor,'#EAF3DE');
  assert.equal(plain.dataset.revisionKind,undefined);
  assert.equal(plain.style.backgroundColor,undefined);
});

test('revision style none preserves metadata without visual decoration', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'old',widthPt:15,glyphWidthPt:15,style:{fontSizePt:9},revision:{kind:'del',id:'7',author:'Alice',date:'2026-10-07T10:00:00Z'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc,changes:{style:'none'}});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.dataset.revisionKind,'del');
  assert.equal(span.dataset.revisionId,'7');
  assert.equal(span.dataset.revisionAuthor,'Alice');
  assert.equal(span.style.backgroundColor,undefined);
  assert.equal(span.style.color,undefined);
  assert.equal(span.style.textDecorationLine,undefined);
});

test('revision custom style overrides presentation without changing revision metadata', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'new',widthPt:15,glyphWidthPt:15,style:{fontSizePt:9},revision:{kind:'ins',id:'8',author:'Bob'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc,changes:{style:{preset:'none',insert:{backgroundColor:'#112233',color:'#445566',fontWeight:'700'}}}});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.dataset.revisionKind,'ins');
  assert.equal(span.dataset.revisionAuthor,'Bob');
  assert.equal(span.style.backgroundColor,'#112233');
  assert.equal(span.style.color,'#445566');
  assert.equal(span.style.fontWeight,'700');
});

test('revision style option does not affect fragments without revision metadata', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'plain',widthPt:20,glyphWidthPt:20,style:{fontSizePt:9,color:'000000'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc,changes:{style:{preset:'none',insert:{backgroundColor:'#FF00FF'}}}});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.dataset.revisionKind,undefined);
  assert.equal(span.style.backgroundColor,undefined);
});

test('word revision preset is opt-in and does not use review backgrounds', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
    {type:'text',text:'new',widthPt:15,glyphWidthPt:15,style:{fontSizePt:9},revision:{kind:'ins'}}
  ]}]}]}]}]};
  renderDocument(layout,target,{document:doc,changes:{style:'word'}});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.style.backgroundColor,undefined);
  assert.equal(span.style.color,'#0000FF');
  assert.match(span.style.textDecorationLine,/underline/);
});

test('revision renderer exposes stable change anchors without visual geometry styles', () => {
  const doc=new FakeDocument(), target=new FakeNode('root');
  const layout={pages:[{widthPt:100,heightPt:100,columns:[{blocks:[{
    type:'paragraph',x:0,y:0,widthPt:90,heightPt:14,lines:[{x:0,y:0,heightPt:14,availableWidthPt:90,fragments:[
      {type:'text',text:'changed',widthPt:35,glyphWidthPt:35,style:{fontSizePt:10},revision:{kind:'ins',id:'42',author:'Kim'}}
    ]}]
  }]}]}]};
  renderDocument(layout,target,{document:doc,changes:{style:'none'}});
  const span=target.children[0].children[0].children[0].children[0];
  assert.equal(span.dataset.changeId,'ins-42');
  assert.equal(span.dataset.revisionKind,'ins');
  assert.equal(span.dataset.revisionAuthor,'Kim');
  assert.equal(span.style.backgroundColor,undefined);
  assert.equal(span.style.color,undefined);
});
