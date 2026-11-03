import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStyles } from '../../src/style-resolver/style-resolver.js';

test('resolves basedOn chain and direct paragraph properties', () => {
  const raw = {
    body:[{type:'paragraph',properties:{styleId:'Body',alignment:'center'},children:[]}],
    styles:{defaults:{paragraph:{spacing:{after:100}},run:{}},styles:{Base:{id:'Base',paragraphProperties:{indentation:{left:200}}},Body:{id:'Body',basedOn:'Base',paragraphProperties:{spacing:{line:260,lineRule:'atLeast'}}}}},
    numbering:{abstractNumbers:{},numbers:{}}, settings:{}, resources:{}, theme:{}, fonts:{}, diagnostics:[]
  };
  const out = resolveStyles(raw);
  const style = out.body[0].computedStyle;
  assert.equal(style.alignment, 'center');
  assert.equal(style.indentation.left, 200);
  assert.equal(style.spacing.after, 100);
  assert.equal(style.spacing.line, 260);
});

test('inherits paragraph style run properties and resolves theme fonts', () => {
  const raw = {
    body:[{type:'paragraph',properties:{styleId:'Body'},children:[{type:'run',properties:{fonts:{eastAsiaTheme:'minorEastAsia'}},children:[{type:'text',value:'가나다'}]}]}],
    styles:{
      defaults:{paragraph:{},run:{size:18}},
      styles:{
        Base:{id:'Base',runProperties:{bold:true,fonts:{ascii:'Batang'}}},
        Body:{id:'Body',basedOn:'Base',paragraphProperties:{spacing:{line:260,lineRule:'atLeast'}},runProperties:{italic:true}}
      }
    },
    numbering:{abstractNumbers:{},numbers:{}}, settings:{}, resources:{},
    theme:{fonts:{minor:{latin:'Arial',eastAsia:'Malgun Gothic'}}},
    fonts:{'Malgun Gothic':{name:'Malgun Gothic'}}, headers:{}, footers:{}, diagnostics:[]
  };
  const out = resolveStyles(raw);
  const runStyle = out.body[0].children[0].computedStyle;
  assert.equal(runStyle.bold, true);
  assert.equal(runStyle.italic, true);
  assert.equal(runStyle.size, 18);
  assert.equal(runStyle.fonts.eastAsia, 'Malgun Gothic');
});

test('applies numbering level paragraph properties before direct paragraph formatting', () => {
  const raw = {
    body:[{type:'paragraph',properties:{numbering:{numId:5,level:0},indentation:{left:400}},children:[]}],
    styles:{defaults:{paragraph:{spacing:{after:100}},run:{}},styles:{}},
    numbering:{
      abstractNumbers:{1:{levels:{0:{start:1,format:'decimal',text:'%1.',paragraphProperties:{indentation:{left:200,hanging:100}},runProperties:{bold:true}}}}},
      numbers:{5:{abstractNumId:1,overrides:{}}}
    },
    settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const out = resolveStyles(raw);
  const p = out.body[0];
  assert.equal(p.computedStyle.indentation.left, 400);
  assert.equal(p.computedStyle.indentation.hanging, 100);
  assert.equal(p.computedStyle.runProperties.bold, undefined);
  assert.equal(p.numbering.runProperties.bold, true);
  assert.equal(p.numbering.start, 1);
});

test('paragraph Asian typography flags inherit through styles and allow direct override', () => {
  const raw = {
    body:[{type:'paragraph',properties:{styleId:'Body',autoSpaceDE:false},children:[]}],
    styles:{defaults:{paragraph:{autoSpaceDE:true,autoSpaceDN:true},run:{}},styles:{Body:{id:'Body',paragraphProperties:{autoSpaceDN:false}}}},
    numbering:{abstractNumbers:{},numbers:{}},settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const out=resolveStyles(raw);
  assert.equal(out.body[0].computedStyle.autoSpaceDE,false);
  assert.equal(out.body[0].computedStyle.autoSpaceDN,false);
});

test('resolves DrawingML theme colors with luminance modifiers before rendering', () => {
  const raw={
    type:'raw-document', body:[{type:'image',visual:{fill:{themeColor:'lt1',lumMod:95000,lumOff:0},line:{widthEmu:1270,color:{themeColor:'lt1',lumMod:95000}}}}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}}, numbering:{}, settings:{}, resources:{}, theme:{colors:{lt1:'FFFFFF'}}, fonts:{}, headers:{}, footers:{}, diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].visual.fill,'F2F2F2');
  assert.equal(resolved.body[0].visual.line.color,'F2F2F2');
});

test('resolves theme-backed text shading without coupling renderer to theme data', () => {
  const raw={
    body:[{type:'paragraph',properties:{shading:{themeFill:'accent1'}},children:[{type:'run',properties:{shading:{fill:'ABCDEF'}},children:[{type:'text',value:'x'}]}]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},numbering:{},settings:{},resources:{},theme:{colors:{accent1:'4472C4'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].computedStyle.shading.resolvedFill,'4472C4');
  assert.equal(resolved.body[0].children[0].computedStyle.shading.resolvedFill,'ABCDEF');
});

test('resolves theme-backed table and cell shading before renderer', () => {
  const raw={
    body:[{type:'table',properties:{shading:{themeFill:'accent1'}},rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{shading:{fill:'ABCDEF'}},children:[]}]}]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},numbering:{},settings:{},resources:{},theme:{colors:{accent1:'4472C4'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].properties.shading.resolvedFill,'4472C4');
  assert.equal(resolved.body[0].rows[0].cells[0].properties.shading.resolvedFill,'ABCDEF');
});

test('paragraph without pStyle uses the default paragraph style instead of only docDefaults', () => {
  const raw={
    body:[{type:'paragraph',properties:{},children:[]}],
    styles:{defaults:{paragraph:{spacing:{after:100}},run:{size:18}},styles:{Normal:{id:'Normal',type:'paragraph',isDefault:true,paragraphProperties:{widowControl:false,alignment:'both'},runProperties:{fonts:{ascii:'Batang'}}}}},
    numbering:{},settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].computedStyle.widowControl,false);
  assert.equal(resolved.body[0].computedStyle.alignment,'both');
  assert.equal(resolved.body[0].computedStyle.spacing.after,100);
  assert.equal(resolved.body[0].computedStyle.runProperties.fonts.ascii,'Batang');
});

test('resolved numbering carries normalized level definitions for IR sequencing', () => {
  const raw={
    body:[{type:'paragraph',properties:{numbering:{numId:9,level:1}},children:[]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},
    numbering:{
      abstractNumbers:{2:{levels:{
        0:{start:1,format:'decimal',text:'%1.',suffix:'space',paragraphProperties:{},runProperties:{}},
        1:{start:1,format:'lowerLetter',text:'%1.%2)',suffix:'tab',paragraphProperties:{},runProperties:{italic:true}}
      }}},
      numbers:{9:{abstractNumId:2,overrides:{}}}
    },
    settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].numbering.levels[0].format,'decimal');
  assert.equal(resolved.body[0].numbering.levels[1].format,'lowerLetter');
  assert.equal(resolved.body[0].numbering.suffix,'tab');
});

test('resolves theme-backed table and cell border colors before rendering', () => {
  const raw={
    body:[{type:'table',properties:{borders:{top:{value:'single',themeColor:'accent1'}}},rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{borders:{bottom:{value:'single',themeColor:'accent2'}}},children:[]}]}]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},numbering:{},settings:{},resources:{},theme:{colors:{accent1:'4472C4',accent2:'ED7D31'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].properties.borders.top.resolvedColor,'4472C4');
  assert.equal(resolved.body[0].rows[0].cells[0].properties.borders.bottom.resolvedColor,'ED7D31');
});

test('theme border colors resolve from themeColor instead of border style tokens', () => {
  const raw={
    body:[{type:'paragraph',properties:{borders:{bottom:{value:'single',themeColor:'accent1'}}},children:[{type:'run',properties:{border:{value:'double',themeColor:'accent2'}},children:[{type:'text',value:'x'}]}]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},numbering:{},settings:{},resources:{},theme:{colors:{accent1:'4472C4',accent2:'ED7D31'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].computedStyle.borders.bottom.resolvedColor,'4472C4');
  assert.equal(resolved.body[0].children[0].computedStyle.border.resolvedColor,'ED7D31');
});

test('applies bounded conditional table styles from tblLook to cells and text', () => {
  const makeCell = (text, properties = {}) => ({
    type:'cell', properties, children:[{type:'paragraph',properties:{},children:[{type:'run',properties:{},children:[{type:'text',value:text}]}]}]
  });
  const raw={
    body:[{type:'table',properties:{styleId:'AccentTable',look:{firstRow:true,lastRow:false,firstColumn:false,lastColumn:true,noHBand:false,noVBand:true}},grid:[2000,2000],rows:[
      {type:'row',properties:{},cells:[makeCell('H1'),makeCell('H2')]},
      {type:'row',properties:{},cells:[makeCell('A1'),makeCell('A2',{shading:{fill:'00FF00'}})]},
      {type:'row',properties:{},cells:[makeCell('B1'),makeCell('B2')]}
    ]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{AccentTable:{id:'AccentTable',type:'table',conditionalTableStyles:{
      firstRow:{cellProperties:{shading:{themeFill:'accent1'}},runProperties:{bold:true}},
      band1Horz:{cellProperties:{shading:{fill:'EEEEEE'}}},
      band2Horz:{cellProperties:{shading:{fill:'DDDDDD'}}},
      lastCol:{runProperties:{italic:true}}
    }}}},
    numbering:{},settings:{},resources:{},theme:{colors:{accent1:'4472C4'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  const rows=resolved.body[0].rows;
  assert.equal(rows[0].cells[0].properties.shading.resolvedFill,'4472C4');
  assert.equal(rows[0].cells[0].children[0].children[0].computedStyle.bold,true);
  assert.equal(rows[0].cells[1].children[0].children[0].computedStyle.italic,true);
  assert.equal(rows[1].cells[0].properties.shading.resolvedFill,'EEEEEE');
  assert.equal(rows[1].cells[1].properties.shading.resolvedFill,'00FF00');
  assert.equal(rows[2].cells[0].properties.shading.resolvedFill,'DDDDDD');
});

test('Word theme tint/shade modifiers are resolved for text, shading, and borders', () => {
  const raw={
    body:[{type:'paragraph',properties:{shading:{themeFill:'accent1',themeFillTint:'80'},borders:{bottom:{value:'single',themeColor:'accent2',themeShade:'80'}}},children:[
      {type:'run',properties:{color:{themeColor:'accent1',themeTint:'80'},border:{value:'single',themeColor:'accent2',themeShade:'80'}},children:[{type:'text',value:'x'}]}
    ]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},numbering:{},settings:{},resources:{},theme:{colors:{accent1:'4472C4',accent2:'ED7D31'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  const paragraph=resolved.body[0];
  const run=paragraph.children[0];
  assert.equal(paragraph.computedStyle.shading.resolvedFill,'A2B9E2');
  assert.equal(paragraph.computedStyle.borders.bottom.resolvedColor,'773F19');
  assert.equal(run.computedStyle.resolvedColor,'A2B9E2');
  assert.equal(run.computedStyle.border.resolvedColor,'773F19');
});

test('conditional table styles honor configured row and column band sizes', () => {
  const makeCell = text => ({type:'cell',properties:{},children:[{type:'paragraph',properties:{},children:[{type:'run',properties:{},children:[{type:'text',value:text}]}]}]});
  const rows=Array.from({length:4},(_,r)=>({type:'row',properties:{},cells:Array.from({length:4},(_,c)=>makeCell(`${r}:${c}`))}));
  const raw={
    body:[{type:'table',properties:{styleId:'BandTable',look:{firstRow:false,lastRow:false,firstColumn:false,lastColumn:false,noHBand:false,noVBand:false}},grid:[1000,1000,1000,1000],rows}],
    styles:{defaults:{paragraph:{},run:{}},styles:{BandTable:{id:'BandTable',type:'table',tableProperties:{rowBandSize:2,columnBandSize:2},conditionalTableStyles:{
      band1Horz:{cellProperties:{shading:{fill:'EEEEEE'}}},band2Horz:{cellProperties:{shading:{fill:'CCCCCC'}}},
      band1Vert:{runProperties:{bold:true}},band2Vert:{runProperties:{italic:true}}
    }}}},numbering:{},settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw).body[0];
  assert.equal(resolved.rows[0].cells[0].properties.shading.resolvedFill,'EEEEEE');
  assert.equal(resolved.rows[1].cells[0].properties.shading.resolvedFill,'EEEEEE');
  assert.equal(resolved.rows[2].cells[0].properties.shading.resolvedFill,'CCCCCC');
  assert.equal(resolved.rows[0].cells[0].children[0].children[0].computedStyle.bold,true);
  assert.equal(resolved.rows[0].cells[1].children[0].children[0].computedStyle.bold,true);
  assert.equal(resolved.rows[0].cells[2].children[0].children[0].computedStyle.italic,true);
});

test('base table style paragraph/run properties apply inside cells while direct paragraph formatting wins', () => {
  const raw={
    body:[{type:'table',properties:{styleId:'Grid'},grid:[2000],rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{},children:[
      {type:'paragraph',properties:{spacing:{line:300}},children:[{type:'run',properties:{italic:true},children:[{type:'text',value:'x'}]}]}
    ]}]}]}],
    styles:{defaults:{paragraph:{spacing:{after:200,line:276,lineRule:'auto'}},run:{}},styles:{
      Normal:{id:'Normal',type:'paragraph',isDefault:true,paragraphProperties:{spacing:{after:200,line:276,lineRule:'auto'}}},
      Grid:{id:'Grid',type:'table',paragraphProperties:{spacing:{after:0,line:240,lineRule:'auto'}},runProperties:{bold:true}}
    }}, numbering:{},settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const p=resolveStyles(raw).body[0].rows[0].cells[0].children[0];
  assert.equal(p.computedStyle.spacing.after,0);
  assert.equal(p.computedStyle.spacing.line,300);
  assert.equal(p.children[0].computedStyle.bold,true);
  assert.equal(p.children[0].computedStyle.italic,true);
});

test('paragraph tab stops inherit by position and direct clear removes only the matching inherited stop', () => {
  const raw={
    body:[{type:'paragraph',properties:{styleId:'TabBase',tabs:[{value:'clear',position:2880}]},children:[]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{TabBase:{id:'TabBase',type:'paragraph',paragraphProperties:{tabs:[
      {value:'left',position:2880},{value:'left',position:5760}
    ]}}}}, numbering:{},settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const p=resolveStyles(raw).body[0];
  assert.deepEqual(p.computedStyle.tabs,[{value:'left',position:5760}]);
});


test('WordprocessingML text color prefers concrete w:val over reapplying theme tint', () => {
  const raw={
    body:[{type:'paragraph',properties:{},children:[
      {type:'run',properties:{color:{value:'A8D08D',themeColor:'accent6',themeTint:'99'}},children:[{type:'text',value:'Image Below'}]}
    ]}],
    styles:{defaults:{paragraph:{},run:{}},styles:{}},numbering:{},settings:{},resources:{},
    theme:{colors:{accent6:'70AD47'}},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const resolved=resolveStyles(raw);
  assert.equal(resolved.body[0].children[0].computedStyle.resolvedColor,'A8D08D');
});

test('numbering level run properties style the label without leaking into paragraph body runs', () => {
  const raw={
    body:[{type:'paragraph',properties:{numbering:{numId:5,level:0}},children:[
      {type:'run',properties:{},children:[{type:'text',value:'one'}]}
    ]}],
    styles:{defaults:{paragraph:{},run:{fonts:{ascii:'Liberation Serif'},size:24}},styles:{Normal:{id:'Normal',type:'paragraph',isDefault:true,paragraphProperties:{},runProperties:{}}}},
    numbering:{
      abstractNumbers:{7:{levels:{0:{start:1,format:'bullet',text:'\uf06c',paragraphProperties:{},runProperties:{fonts:{ascii:'Wingdings',hAnsi:'Wingdings'}}}}}},
      numbers:{5:{abstractNumId:7,overrides:{}}}
    },
    settings:{},resources:{},theme:{},fonts:{},headers:{},footers:{},diagnostics:[]
  };
  const paragraph=resolveStyles(raw).body[0];
  assert.equal(paragraph.numbering.runProperties.fonts.ascii,'Wingdings');
  assert.equal(paragraph.computedStyle.runProperties.fonts.ascii,'Liberation Serif');
  assert.equal(paragraph.children[0].computedStyle.fonts.ascii,'Liberation Serif');
});
