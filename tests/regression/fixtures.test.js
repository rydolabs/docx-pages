import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { parseDocument } from '../../src/parser/document-parser.js';
import { resolveStyles } from '../../src/style-resolver/style-resolver.js';
import { buildDocumentIR } from '../../src/document-ir/ir-builder.js';
import { layoutDocument } from '../../src/layout/layout-engine.js';

async function loadFixture(name) {
  const source = await fs.readFile(new URL(`../fixtures/regression/${name}.docx`, import.meta.url));
  const raw = await parseDocument(source, { JSZipImpl: JSZip, domParser: new DOMParser() });
  const resolved = resolveStyles(raw);
  const ir = buildDocumentIR(resolved);
  const layout = layoutDocument(ir);
  return { raw, resolved, ir, layout };
}

test('table-heavy regression fixture keeps auto-fit table and nested table content', async () => {
  const { ir, layout } = await loadFixture('table-heavy');
  const tableNode = ir.sections[0].children.find(node => node.type === 'table');
  assert.ok(tableNode);
  const topTable = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(topTable);
  assert.equal(topTable.layoutMode, 'autofit');
  assert.equal(topTable.columnWidths.length, 2);
  assert.ok(topTable.columnWidths.every(width => width > 0));
  const nested = topTable.rows.flatMap(row => row.cells).flatMap(cell => cell.blocks || []).find(block => block.type === 'table');
  assert.ok(nested, 'nested table should survive into layout');
  assert.deepEqual(layout.diagnostics, []);
});

test('mixed-sections regression fixture composes portrait, landscape, and continuous regions', async () => {
  const { ir, layout } = await loadFixture('mixed-sections');
  assert.equal(ir.sections.length, 3);
  assert.equal(layout.pages.length, 2);
  assert.ok(layout.pages[0].heightPt > layout.pages[0].widthPt, 'page 1 should be portrait');
  assert.ok(layout.pages[1].widthPt > layout.pages[1].heightPt, 'page 2 should be landscape');
  assert.equal(layout.pages[1].regions.length, 2);
  assert.deepEqual(layout.pages[1].regions.map(region => region.columns.length), [1, 2]);
  assert.deepEqual(layout.diagnostics, []);
});

test('numbering-links regression fixture keeps multilevel labels, hyperlink, and bookmark semantics', async () => {
  const { ir, layout } = await loadFixture('numbering-links');
  const paragraphs = ir.sections[0].children.filter(node => node.type === 'paragraph');
  const labels = paragraphs.map(p => p.numberingLabel?.text).filter(Boolean);
  assert.deepEqual(labels, ['1.', '1.1.', '1.2.', '2.']);
  const children = paragraphs.flatMap(p => p.children || []);
  assert.ok(children.some(node => node.type === 'bookmark-start' && node.name === 'TargetHere'));
  assert.ok(children.some(node => node.type === 'hyperlink' && node.target === 'https://example.com'));
  assert.ok(children.some(node => node.type === 'hyperlink' && node.anchor === 'TargetHere'));
  const renderedText = layout.pages.flatMap(page => page.columns || []).flatMap(col => col.blocks || [])
    .filter(block => block.type === 'paragraph').flatMap(block => block.lines || []).map(line => line.text).join('\n');
  assert.match(renderedText, /1\. First item/);
  assert.match(renderedText, /2\. Second item/);
  assert.deepEqual(layout.diagnostics, []);
});

test('notes regression fixture keeps footnote at page bottom and endnote in document flow', async () => {
  const { ir, layout } = await loadFixture('notes');
  assert.equal(Object.keys(ir.footnotes || {}).length, 1);
  assert.equal(Object.keys(ir.endnotes || {}).length, 1);
  assert.ok(layout.pages[0].footnotes);
  assert.deepEqual(layout.pages[0].footnotes.ids, [2]);
  const footText = layout.pages[0].footnotes.blocks.flatMap(block => block.lines || []).map(line => line.text).join('');
  assert.match(footText, /Footnote body/);
  const bodyText = layout.pages.flatMap(page => page.columns || []).flatMap(col => col.blocks || [])
    .filter(block => block.type === 'paragraph').flatMap(block => block.lines || []).map(line => line.text).join('\n');
  assert.match(bodyText, /Endnote body/);
  assert.deepEqual(layout.diagnostics, []);
});

test('table-pagination-edge repeats headers and keeps cantSplit / vertical-merge boundaries intact', async () => {
  const { layout } = await loadFixture('table-pagination-edge');
  assert.ok(layout.pages.length >= 2);
  const pageTables = layout.pages.map(page => (page.columns || []).flatMap(col => col.blocks || []).find(block => block.type === 'table')).filter(Boolean);
  assert.equal(pageTables.length, layout.pages.length);
  for (const table of pageTables) {
    assert.equal(table.rows[0]?.repeatHeader, true, 'header row should repeat on each table fragment');
    const firstText = table.rows[0]?.cells?.[0]?.blocks?.[0]?.lines?.[0]?.text;
    assert.equal(firstText, 'Key');
  }
  const allRows = pageTables.flatMap(table => table.rows.map(row => ({ page: pageTables.indexOf(table), row })));
  const lockRows = allRows.filter(item => item.row.cells?.some(cell => (cell.blocks || []).some(block => block.lines?.some(line => line.text.includes('LOCK')))));
  assert.equal(lockRows.length, 1, 'cantSplit row must remain a single row');
  assert.equal(lockRows[0].row.rowFragment, undefined, 'cantSplit row must not become a row fragment');
  const mergePages = new Set(allRows.filter(item => item.row.cells?.some(cell => cell.properties?.verticalMerge)).map(item => item.page));
  assert.equal(mergePages.size, 1, 'restart/continue vertical-merge rows should stay on the same table fragment');
  assert.deepEqual(layout.diagnostics, []);
});

test('section-page-numbering restarts PAGE field and preserves lower-roman formatting', async () => {
  const { ir, layout } = await loadFixture('section-page-numbering');
  assert.deepEqual(ir.sections.map(section => section.properties?.pageNumbering), [
    { format: 'lowerRoman', start: 4 },
    { format: 'decimal', start: 1 }
  ]);
  assert.equal(layout.pages.length, 3);
  const footerNumbers = layout.pages.map(page => (page.footer?.blocks || [])
    .flatMap(block => block.lines || []).map(line => line.text).join(''));
  assert.deepEqual(footerNumbers, ['iv', 'v', '1']);
  assert.deepEqual(layout.pages.map(page => page.sectionOwnerIndex), [0, 0, 1]);
  assert.deepEqual(layout.diagnostics, []);
});

test('footnote-pagination-edge repaginates page-bottom notes including references inside tables', async () => {
  const { layout } = await loadFixture('footnote-pagination-edge');
  assert.equal(layout.pages.length, 2);
  assert.deepEqual(layout.pages.map(page => page.footnotes?.ids || []), [[2, 4], [6]]);
  const page1Text = layout.pages[0].footnotes.blocks.flatMap(block => block.lines || []).map(line => line.text).join(' ');
  const page2Text = layout.pages[1].footnotes.blocks.flatMap(block => block.lines || []).map(line => line.text).join(' ');
  assert.match(page1Text, /First long footnote/);
  assert.match(page1Text, /Second footnote from a table cell/);
  assert.match(page2Text, /Third footnote/);
  assert.deepEqual(layout.diagnostics, []);
});

test('field-links-highlight preserves cached field links and run highlight through layout', async () => {
  const { ir, layout } = await loadFixture('field-links-highlight');
  const paragraphs = ir.sections[0].children.filter(node => node.type === 'paragraph');
  assert.ok(paragraphs.some(paragraph => (paragraph.children || []).some(node => node.type === 'bookmark-start' && node.name === 'FieldTarget')));
  const blocks = layout.pages.flatMap(page => page.columns || []).flatMap(column => column.blocks || []).filter(block => block.type === 'paragraph');
  const fragments = blocks.flatMap(block => block.lines || []).flatMap(line => line.fragments || []);
  assert.ok(fragments.some(fragment => fragment.link?.target === 'https://example.com'));
  assert.ok(fragments.some(fragment => fragment.link?.anchor === 'FieldTarget'));
  assert.ok(fragments.some(fragment => fragment.style?.highlight === 'yellow'));
  assert.ok(!fragments.some(fragment => String(fragment.text || '').includes('SHOULD_NOT_RENDER')));
  assert.deepEqual(layout.diagnostics, []);
});

test('text-semantics-lowcost preserves final-view revision/customXml content and applies caps variants in layout', async () => {
  const { layout } = await loadFixture('text-semantics-lowcost');
  const text = layout.pages.flatMap(page => page.columns || []).flatMap(col => col.blocks || [])
    .filter(block => block.type === 'paragraph').flatMap(block => block.lines || []).map(line => line.text).join('\n');
  assert.match(text, /CAPS TEXT/);
  assert.match(text, /SMALL CAPS/);
  assert.match(text, /MOVED_VISIBLE/);
  assert.match(text, /CUSTOM_VISIBLE/);
  assert.doesNotMatch(text, /OLD_MOVED_TEXT/);
  assert.deepEqual(layout.diagnostics, []);
});

test('page-background preserves document background through layout', async () => {
  const { raw, ir, layout } = await loadFixture('page-background');
  assert.equal(raw.background?.color, 'FFF2CC');
  assert.equal(ir.background?.resolvedColor, 'FFF2CC');
  assert.equal(layout.pages[0].background?.resolvedColor, 'FFF2CC');
  assert.deepEqual(layout.diagnostics, []);
});

test('common-formatting carries bounded parity features through parser, resolver, IR, and layout', async () => {
  const { ir, layout } = await loadFixture('common-formatting');
  const paragraphs=ir.sections[0].children.filter(node=>node.type==='paragraph');
  assert.equal(paragraphs[1].style?.borders?.top?.resolvedColor,'FF0000');
  assert.equal(paragraphs[2].children?.[0]?.style?.emphasis,'dot');
  assert.equal(paragraphs[3].style?.bidi,true);
  assert.equal(paragraphs[3].children?.[0]?.style?.rtl,true);
  const link=paragraphs[4].children?.find(node=>node.type==='hyperlink');
  assert.equal(link?.tooltip,'Open example');
  assert.equal(link?.targetFrame,'_blank');
  const table=ir.sections[0].children.find(node=>node.type==='table');
  assert.equal(table.rows[0].cells[0].properties.noWrap,true);
  const tableBlock=layout.pages[0].columns[0].blocks.find(block=>block.type==='table');
  assert.ok(tableBlock.columnWidths[0] > 0);
  assert.deepEqual(layout.diagnostics,[]);
});

test('table-floating-edge constrains a table when its measured height intersects a square-wrapped float', async () => {
  const { layout } = await loadFixture('table-floating-edge');
  const page = layout.pages[0];
  const floating = page.floats?.[0];
  const table = page.columns[0].blocks.find(block => block.type === 'table');
  assert.ok(floating);
  assert.ok(table);
  assert.ok(table.y < floating.y && table.y + table.heightPt > floating.y, 'table should start above but intersect the float vertically');
  assert.equal(table.x, floating.x + floating.widthPt);
  assert.ok(table.widthPt < page.columns[0].widthPt);
  assert.deepEqual(layout.diagnostics, []);
});

test('footnote-section-edge keeps a continuous-section footnote on the shared physical page without body overlap', async () => {
  const { ir, layout } = await loadFixture('footnote-section-edge');
  assert.equal(ir.sections.length, 2);
  assert.equal(layout.pages.length, 1);
  const page = layout.pages[0];
  assert.deepEqual(page.regions.map(region => region.sectionIndex), [0, 1]);
  assert.deepEqual(page.footnotes?.ids, [2]);
  const contentBottom = Math.max(...page.regions.flatMap(region => region.columns).flatMap(column => column.blocks.map(block => block.y + block.heightPt)));
  assert.ok(contentBottom <= page.footnotes.y + 0.001);
  assert.deepEqual(layout.diagnostics, []);
});

test('nested-table-pagination-edge moves a nested-table row at the outer row boundary and preserves the nested table', async () => {
  const { layout } = await loadFixture('nested-table-pagination-edge');
  assert.equal(layout.pages.length, 2);
  const firstTable = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  const secondTable = layout.pages[1].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(firstTable && secondTable);
  assert.equal(firstTable.rows.length, 1);
  assert.equal(secondTable.rows.length, 1);
  assert.equal(firstTable.rows[0].rowFragment, undefined);
  assert.equal(secondTable.rows[0].rowFragment, undefined);
  const nested = secondTable.rows[0].cells.flatMap(cell => cell.blocks || []).find(block => block.type === 'table');
  assert.ok(nested, 'nested table must survive pagination');
  assert.equal(nested.rows.length, 4);
  const pageBottom = layout.pages[1].columns[0].y + layout.pages[1].columns[0].heightPt;
  assert.ok(secondTable.y + secondTable.heightPt <= pageBottom + 0.001, 'row-boundary fallback must fit on the next page');
  assert.deepEqual(layout.diagnostics, []);
});


test('float-clear-break resumes below the float and restores full column width', async () => {
  const { layout } = await loadFixture('float-clear-break');
  const page = layout.pages[0];
  const floating = page.floats?.[0];
  const paragraph = page.columns[0].blocks.find(block =>
    block.type === 'paragraph' && block.lines?.some(line => line.text.includes('Text beside the float before clear'))
  );
  assert.ok(floating && paragraph);
  assert.equal(paragraph.lines[0].breakClear, 'all');
  assert.ok(paragraph.lines[0].x >= floating.x + floating.widthPt - 0.001);
  assert.ok(paragraph.lines[1].y >= floating.y + floating.heightPt - 0.001);
  assert.equal(paragraph.lines[1].x, page.columns[0].x);
  assert.deepEqual(layout.diagnostics, []);
});

test('column-separator-continuous scopes the rule to the two-column section region', async () => {
  const { raw, layout } = await loadFixture('column-separator-continuous');
  assert.equal(raw.finalSection?.columns?.separator, '1');
  assert.equal(layout.pages.length, 1);
  const page=layout.pages[0];
  assert.equal(page.regions.length,2);
  assert.equal(page.regions[0].columnSeparators.length,0);
  assert.equal(page.regions[1].columns.length,2);
  assert.equal(page.regions[1].columnSeparators.length,1);
  const separator=page.regions[1].columnSeparators[0];
  assert.equal(separator.y,page.regions[1].y);
  assert.equal(separator.heightPt,page.regions[1].heightPt);
  assert.deepEqual(layout.diagnostics,[]);
});

test('section-parity-break inserts a blank page for oddPage and avoids an unnecessary blank for evenPage', async () => {
  const { ir, layout } = await loadFixture('section-parity-break');
  assert.deepEqual(ir.sections.map(section => section.properties?.type), [undefined,'oddPage','evenPage']);
  assert.equal(layout.pages.length, 4);
  assert.deepEqual(layout.pages.map(page => page.sectionOwnerIndex), [0,0,1,2]);
  assert.equal(layout.pages[1].isSectionParityBlank, true);
  assert.equal(layout.pages[1].regions.length, 0);
  assert.equal(layout.pages[2].isSectionParityBlank, undefined);
  assert.deepEqual(layout.diagnostics, []);
});

test('mirrored-margins-gutter swaps facing-page margins and keeps a constant text width', async () => {
  const { raw, ir, layout } = await loadFixture('mirrored-margins-gutter');
  assert.equal(ir.settings?.mirrorMargins, true);
  assert.equal(raw.finalSection?.margins?.gutter, 400);
  assert.equal(layout.pages.length, 2);
  const odd = layout.pages[0].regions[0];
  const even = layout.pages[1].regions[0];
  assert.equal(odd.x, 50);
  assert.equal(even.x, 60);
  assert.equal(odd.widthPt, 90);
  assert.equal(even.widthPt, 90);
  assert.deepEqual(
    layout.pages.map(page => [page.margins.left, page.margins.right]),
    [[50, 60], [60, 50]]
  );
  assert.deepEqual(layout.diagnostics, []);
});

test('text-formatting-lowcost-2 carries line-relative spacing, run border, and underline color through the full pipeline', async () => {
  const { ir, layout } = await loadFixture('text-formatting-lowcost-2');
  const paragraph = ir.sections[0].children.find(node => node.type === 'paragraph');
  const run = paragraph.children.find(node => node.type === 'run');
  assert.equal(paragraph.style?.spacing?.beforeLines, 50);
  assert.equal(paragraph.style?.spacing?.afterLines, 100);
  assert.equal(run.style?.border?.resolvedColor, 'FF0000');
  assert.equal(run.style?.border?.size, 8);
  assert.equal(run.style?.underline, 'single');
  assert.equal(run.style?.resolvedUnderlineColor, '00AA00');
  const block = layout.pages[0].columns[0].blocks.find(block => block.type === 'paragraph');
  assert.ok(block.spacingBeforePt > 0);
  assert.ok(block.spacingAfterPt > block.spacingBeforePt);
  const fragment = block.lines.flatMap(line => line.fragments || []).find(fragment => fragment.text?.includes('Bordered'));
  assert.equal(fragment.style?.border?.resolvedColor, 'FF0000');
  assert.equal(fragment.style?.resolvedUnderlineColor, '00AA00');
  assert.deepEqual(layout.diagnostics, []);
});

test('character-indentation applies OOXML character-unit indents through the full pipeline', async () => {
  const { ir, layout } = await loadFixture('character-indentation');
  const paragraphs = ir.sections[0].children.filter(node => node.type === 'paragraph');
  assert.equal(paragraphs[0].style?.indentation?.leftChars, 200);
  assert.equal(paragraphs[0].style?.indentation?.rightChars, 100);
  assert.equal(paragraphs[0].style?.indentation?.firstLineChars, 150);
  assert.equal(paragraphs[1].style?.indentation?.hangingChars, 100);
  const blocks = layout.pages[0].columns[0].blocks.filter(block => block.type === 'paragraph');
  assert.ok(blocks[0].indentation.leftPt > 0);
  assert.ok(blocks[0].indentation.rightPt > 0);
  assert.ok(blocks[0].indentation.firstLineOffsetPt > 0);
  assert.ok(blocks[1].indentation.firstLineOffsetPt < 0);
  assert.deepEqual(layout.diagnostics, []);
});

test('float-multicolumn-edge keeps floating exclusion local to the overlapping physical column', async () => {
  const { layout } = await loadFixture('float-multicolumn-edge');
  assert.ok(layout.pages.length >= 2);
  const firstPage = layout.pages[0];
  assert.equal(firstPage.columns.length, 2);
  const floating = firstPage.floats?.[0];
  assert.ok(floating);
  const firstColumnLine = firstPage.columns[0].blocks.flatMap(block => block.lines || [])[0];
  const secondColumnLine = firstPage.columns[1].blocks.flatMap(block => block.lines || [])[0];
  assert.ok(firstColumnLine.x >= floating.x + floating.widthPt - 0.001);
  assert.equal(secondColumnLine.x, firstPage.columns[1].x);
  assert.deepEqual(layout.diagnostics, []);
});

test('complex-script-formatting carries cs font/size/bold/italic overrides through the full pipeline', async () => {
  const { layout } = await loadFixture('complex-script-formatting');
  const fragments = layout.pages.flatMap(page => page.columns || []).flatMap(column => column.blocks || [])
    .filter(block => block.type === 'paragraph').flatMap(block => block.lines || []).flatMap(line => line.fragments || []);
  const fragment = fragments.find(item => String(item.text || '').includes('שלום'));
  assert.ok(fragment);
  assert.equal(fragment.style.fontSizePt, 15);
  assert.match(fragment.style.fontFamily, /Arial/);
  assert.equal(fragment.style.bold, false);
  assert.equal(fragment.style.italic, true);
  assert.deepEqual(layout.diagnostics, []);
});

test('floating-stacking preserves behindDoc and relativeHeight metadata for bounded renderer layering', async () => {
  const { layout } = await loadFixture('floating-stacking');
  assert.equal(layout.pages.length, 1);
  const floats = layout.pages[0].floats || [];
  assert.equal(floats.length, 3);
  assert.deepEqual(floats.map(item => Number(item.positioning?.relativeHeight)), [20, 10, 30]);
  assert.deepEqual(floats.map(item => item.positioning?.behindDoc), ['1', '0', '0']);
  assert.deepEqual(layout.diagnostics, []);
});

test('table-cell-spacing preserves visible gaps between cell boxes through the full pipeline', async () => {
  const { ir, layout } = await loadFixture('table-cell-spacing');
  const tableNode = ir.sections[0].children.find(node => node.type === 'table');
  assert.equal(tableNode.properties.cellSpacing.value, 120);
  const table = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(table);
  assert.equal(table.cellSpacingPt, 6);
  const [a,b] = table.rows[0].cells;
  assert.ok(b.x > a.x + a.widthPt);
  assert.equal(Math.round((b.x - (a.x + a.widthPt)) * 1000) / 1000, 6);
  const c = table.rows[1].cells[0];
  assert.equal(Math.round((c.y - (a.y + a.heightPt)) * 1000) / 1000, 6);
  assert.deepEqual(layout.diagnostics, []);
});

test('mirrored-header-evenodd uses facing-page margins for header geometry and selects the even header', async () => {
  const { layout } = await loadFixture('mirrored-header-evenodd');
  assert.equal(layout.pages.length, 2);
  const [odd, even] = layout.pages;
  const oddText = odd.header.blocks.flatMap(block => block.lines || []).map(line => line.text).join(' ');
  const evenText = even.header.blocks.flatMap(block => block.lines || []).map(line => line.text).join(' ');
  assert.match(oddText, /ODD HEADER/);
  assert.match(evenText, /EVEN HEADER/);
  assert.notEqual(odd.header.x, even.header.x);
  assert.equal(odd.header.x, odd.layoutContext.margins.left);
  assert.equal(even.header.x, even.layoutContext.margins.left);
  assert.equal(odd.header.widthPt, even.header.widthPt);
  assert.deepEqual(layout.diagnostics, []);
});

test('floating-no-overlap matches Word anchor stacking when later object permits overlap', async () => {
  const { layout } = await loadFixture('floating-no-overlap');
  const floats = layout.pages[0].floats || [];
  assert.equal(floats.length, 2);
  assert.equal(floats[0].positioning.allowOverlap, '0');
  assert.equal(floats[1].positioning.allowOverlap, '1');
  assert.equal(floats[0].y, 20);
  // The archived Word reference shows these rectangles overlapping at their
  // explicit page anchors; forcing the second to y=70 obscured body text.
  assert.equal(floats[1].y, 30);
  assert.ok(floats[1].y < floats[0].y + floats[0].heightPt);
  assert.deepEqual(layout.diagnostics, []);
});

test('table-section-break keeps the table in the old section and starts the next section on a new page', async () => {
  const { ir, layout } = await loadFixture('table-section-break');
  assert.equal(ir.sections.length, 2);
  assert.equal(layout.pages.length, 2);
  assert.equal(layout.pages[0].regions[0].sectionIndex, 0);
  assert.equal(layout.pages[1].regions[0].sectionIndex, 1);
  const page1Table = layout.pages[0].columns.flatMap(column => column.blocks || []).find(block => block.type === 'table');
  assert.ok(page1Table);
  assert.notEqual(layout.pages[0].widthPt, layout.pages[1].widthPt);
  assert.deepEqual(layout.diagnostics, []);
});

test('footnote-table-edge finds references inside table cells and reserves a non-overlapping page-bottom footnote region', async () => {
  const { layout } = await loadFixture('footnote-table-edge');
  assert.equal(layout.pages.length, 1);
  const page = layout.pages[0];
  assert.deepEqual(page.footnotes?.ids, [8]);
  const bodyBottom = Math.max(...page.columns.flatMap(column => column.blocks || []).map(block => (block.y || 0) + (block.heightPt || 0)));
  assert.ok(bodyBottom <= page.footnotes.y + 0.001);
  const noteText = page.footnotes.blocks.flatMap(block => block.lines || []).map(line => line.text).join(' ');
  assert.match(noteText, /Table-cell footnote body/);
  assert.deepEqual(layout.diagnostics, []);
});

test('paragraph-border-spacing carries pBdr space into bounded paragraph content insets', async () => {
  const { ir, layout } = await loadFixture('paragraph-border-spacing');
  const paragraphNode = ir.sections[0].children.find(node => node.type === 'paragraph');
  assert.equal(paragraphNode.style?.borders?.left?.space, 10);
  assert.equal(paragraphNode.style?.borders?.right?.space, 8);
  const block = layout.pages[0].columns[0].blocks.find(item => item.type === 'paragraph');
  assert.ok(block);
  assert.deepEqual(block.borderInsetsPt, { top:4, right:8, bottom:6, left:10 });
  assert.equal(block.lines[0].x, block.x + 10);
  assert.equal(block.lines[0].y, block.y + 4);
  assert.ok(block.contentWidthPt < block.widthPt);
  assert.deepEqual(layout.diagnostics, []);
});

test('continuous-mirror-context resolves mirrored margins from each physical page context', async () => {
  const { layout } = await loadFixture('continuous-mirror-context');
  assert.equal(layout.pages.length, 2);
  const [odd, even] = layout.pages;
  assert.ok(odd.regions.length >= 2);
  assert.equal(odd.layoutContext.margins.left, 45);
  assert.equal(odd.layoutContext.margins.right, 55);
  assert.equal(even.layoutContext.margins.left, 55);
  assert.equal(even.layoutContext.margins.right, 45);
  assert.ok(odd.regions.every(region => region.x === 45));
  assert.ok(even.regions.every(region => region.x === 55));
  assert.deepEqual(layout.diagnostics, []);
});

test('inline-style-boundaries keeps adjacent paint-only run styles as distinct layout fragments', async () => {
  const { layout } = await loadFixture('inline-style-boundaries');
  const paragraphs = layout.pages[0].columns[0].blocks.filter(block => block.type === 'paragraph');
  const decorated = paragraphs.find(block => block.lines?.some(line => line.text === 'AB'));
  assert.ok(decorated);
  const fragments = decorated.lines[0].fragments.filter(fragment => fragment.type === 'text');
  assert.equal(fragments.length, 2);
  assert.deepEqual(fragments.map(fragment => fragment.style.highlight), ['yellow', 'green']);
  assert.deepEqual(fragments.map(fragment => fragment.style.border?.space), [1, 2]);
  assert.deepEqual(layout.diagnostics, []);
});

test('theme-border-colors resolves run/paragraph/table/cell border theme colors before rendering', async () => {
  const { ir, layout } = await loadFixture('theme-border-colors');
  const paragraph = ir.sections[0].children.find(node => node.type === 'paragraph');
  const run = paragraph.children.find(node => node.type === 'run');
  assert.equal(paragraph.style?.borders?.bottom?.resolvedColor, '4472C4');
  assert.equal(run.style?.border?.resolvedColor, 'ED7D31');
  const tableNode = ir.sections[0].children.find(node => node.type === 'table');
  assert.equal(tableNode.style?.borders?.top?.resolvedColor, '4472C4');
  assert.equal(tableNode.rows[0].cells[0].properties?.borders?.bottom?.resolvedColor, 'ED7D31');
  assert.deepEqual(layout.diagnostics, []);
});

test('floating-wrap-dist-side applies wrap-local distances and explicit left-side flow through the full pipeline', async () => {
  const { ir, layout } = await loadFixture('floating-wrap-dist-side');
  const media = ir.sections[0].children.flatMap(node => node.children || []).flatMap(node => node.children || []).find(node => node.type === 'image');
  assert.equal(media?.positioning?.wrap?.wrapText, 'left');
  assert.equal(media?.positioning?.wrap?.distanceTop, 127000);
  assert.equal(media?.positioning?.wrap?.distanceBottom, 190500);
  const exclusion = layout.pages[0].exclusions[0];
  assert.equal(exclusion.wrapText, 'left');
  assert.equal(exclusion.y, 10);
  assert.equal(exclusion.heightPt, 85);
  const paragraph = layout.pages[0].columns[0].blocks.find(block => block.type === 'paragraph' && block.lines?.some(line => line.text.includes('Explicit left-')));
  assert.ok(paragraph);
  assert.equal(paragraph.lines[0].flowBox.x, 0);
  assert.equal(paragraph.lines[0].availableWidthPt, 75);
  assert.deepEqual(layout.diagnostics, []);
});

test('table-conditional-style applies tblLook header/banding/last-column styles through the full pipeline', async () => {
  const { raw, ir, layout } = await loadFixture('table-conditional-style');
  const rawTable = raw.body.find(node => node.type === 'table');
  assert.equal(rawTable.properties.look.firstRow, true);
  assert.equal(rawTable.properties.look.lastColumn, true);
  assert.equal(rawTable.properties.look.noHBand, false);
  const tableNode = ir.sections[0].children.find(node => node.type === 'table');
  assert.equal(tableNode.rows[0].cells[0].properties.shading.resolvedFill, '4472C4');
  assert.equal(tableNode.rows[1].cells[0].properties.shading.resolvedFill, 'EAF0F8');
  assert.equal(tableNode.rows[2].cells[0].properties.shading.resolvedFill, 'FFFFFF');
  const headerRun = tableNode.rows[0].cells[0].children[0].children[0];
  const lastColRun = tableNode.rows[1].cells[1].children[0].children[0];
  assert.equal(headerRun.style.bold, true);
  assert.equal(headerRun.style.resolvedColor, 'FFFFFF');
  assert.equal(lastColRun.style.italic, true);
  const table = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(table);
  assert.deepEqual(layout.diagnostics, []);
});

test('table-row-grid-omissions keeps visible cells on logical tblGrid tracks', async () => {
  const { raw, layout } = await loadFixture('table-row-grid-omissions');
  const rawTable = raw.body.find(node => node.type === 'table');
  assert.equal(rawTable.rows[1].properties.gridBefore, 1);
  assert.equal(rawTable.rows[1].properties.gridAfter, 1);
  const table = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(table);
  const [fullRow, middleRow] = table.rows;
  assert.equal(fullRow.cells.length, 3);
  assert.equal(middleRow.cells.length, 1);
  assert.equal(middleRow.cells[0].gridStart, 1);
  assert.equal(middleRow.cells[0].x, fullRow.cells[1].x);
  assert.equal(middleRow.cells[0].widthPt, fullRow.cells[1].widthPt);
  assert.deepEqual(layout.diagnostics, []);
});

test('table-band-theme-modifiers applies two-row/two-column bands and Word theme tint/shade through the full pipeline', async () => {
  const { raw, ir, layout } = await loadFixture('table-band-theme-modifiers');
  const style = raw.styles.styles.BandTintTable;
  assert.equal(style.tableProperties.rowBandSize, 2);
  assert.equal(style.tableProperties.columnBandSize, 2);
  const tableNode = ir.sections[0].children.find(node => node.type === 'table');
  assert.equal(tableNode.style.rowBandSize, 2);
  assert.equal(tableNode.style.columnBandSize, 2);
  assert.equal(tableNode.style.borders.top.resolvedColor, '773F19');
  assert.equal(tableNode.rows[0].cells[0].properties.shading.resolvedFill, 'A2B9E2');
  assert.equal(tableNode.rows[1].cells[0].properties.shading.resolvedFill, 'A2B9E2');
  assert.equal(tableNode.rows[2].cells[0].properties.shading.resolvedFill, '223962');
  assert.equal(tableNode.rows[0].cells[0].children[0].children[0].style.bold, true);
  assert.equal(tableNode.rows[0].cells[1].children[0].children[0].style.bold, true);
  assert.equal(tableNode.rows[0].cells[2].children[0].children[0].style.italic, true);
  const table = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(table);
  assert.deepEqual(layout.diagnostics, []);
});

test('drawing-line-style preserves bounded dash style and suppresses noFill outlines through the full pipeline', async () => {
  const { ir, layout } = await loadFixture('drawing-line-style');
  const images = ir.sections[0].children.flatMap(node => node.children || []).flatMap(node => node.children || []).filter(node => node.type === 'image');
  assert.equal(images.length, 2);
  assert.equal(images[0].visual.geometry, 'line');
  assert.equal(images[0].visual.line.dash, 'dash');
  assert.equal(images[0].visual.line.color, '4472C4');
  assert.equal(images[1].visual.geometry, 'rect');
  assert.equal(images[1].visual.line, null);
  assert.equal(images[1].visual.fill, 'FFF2CC');
  assert.equal(layout.pages[0].floats.length, 2);
  assert.deepEqual(layout.diagnostics, []);
});
