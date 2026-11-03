from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'fixtures' / 'regression'
OUT.mkdir(parents=True, exist_ok=True)

W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'

def pkg(doc_xml, name, rels='', extras=None, overrides=None):
    extras=extras or {}
    overrides=overrides or []
    ct_overrides=''.join(f'<Override PartName="/{part}" ContentType="{ctype}"/>' for part,ctype in overrides)
    content_types=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="{CT}">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
{ct_overrides}
</Types>'''
    root_rels=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
    doc_rels=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{PKG}">{rels}</Relationships>'''
    path=OUT/name
    with ZipFile(path,'w',ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',content_types)
        z.writestr('_rels/.rels',root_rels)
        z.writestr('word/document.xml',doc_xml)
        z.writestr('word/_rels/document.xml.rels',doc_rels)
        for p,data in extras.items(): z.writestr(p,data)
    return path

def p(text, ppr=''):
    return f'<w:p>{f"<w:pPr>{ppr}</w:pPr>" if ppr else ""}<w:r><w:t>{text}</w:t></w:r></w:p>'

def sect(width=11906,height=16838,orient=None,cols=1,space=720,stype=None):
    o=f' w:orient="{orient}"' if orient else ''
    t=f'<w:type w:val="{stype}"/>' if stype else ''
    return f'''<w:sectPr>{t}<w:pgSz w:w="{width}" w:h="{height}"{o}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/><w:cols w:num="{cols}" w:space="{space}"/></w:sectPr>'''

# 1 table-heavy: grid widths, spans, nested table, long text.
rows=[]
rows.append('''<w:tr><w:trPr><w:tblHeader/></w:trPr>
<w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="5000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc></w:tr>''')
for i in range(1,7):
    nested=''
    if i==3:
        nested='''<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1200"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Nested A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Nested B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'''
    desc=('This is a longer table cell used to verify auto-fit width, wrapping and row sizing. ' * (1 if i<5 else 2))
    rows.append(f'''<w:tr><w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Row {i}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="5000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>{desc}</w:t></w:r></w:p>{nested}</w:tc></w:tr>''')
table=f'''<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="autofit"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="5000"/></w:tblGrid>{''.join(rows)}</w:tbl>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Table regression sample')}{table}{sect()}</w:body></w:document>'''
pkg(doc,'table-heavy.docx')

# 2 mixed section: portrait -> landscape -> continuous two column.
body=[]
body.append(p('Portrait section: ordinary one-column content.'))
body.append(p('This paragraph closes the first section.', sect()))
body.append(p('Landscape section begins here.'))
body.append(p('Landscape content stretches across the wider page.', sect(width=16838,height=11906,orient='landscape',stype='nextPage')))
body.append(p('Continuous section begins with two columns.'))
for i in range(8): body.append(p(f'Two-column flow paragraph {i+1}. This text exists to exercise region and column flow.'))
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{''.join(body)}{sect(width=16838,height=11906,orient='landscape',cols=2,stype='continuous')}</w:body></w:document>'''
pkg(doc,'mixed-sections.docx')

# 3 numbering + hyperlink + bookmark.
numbering=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="{W}"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:suff w:val="space"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/><w:suff w:val="space"/></w:lvl></w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="1"/></w:num></w:numbering>'''
items=[]
for ilvl,text in [(0,'First item'),(1,'Nested item A'),(1,'Nested item B'),(0,'Second item')]:
    items.append(f'''<w:p><w:pPr><w:numPr><w:ilvl w:val="{ilvl}"/><w:numId w:val="5"/></w:numPr></w:pPr><w:r><w:t>{text}</w:t></w:r></w:p>''')
linkp=f'''<w:p><w:bookmarkStart w:id="7" w:name="TargetHere"/><w:r><w:t>Bookmark target</w:t></w:r><w:bookmarkEnd w:id="7"/></w:p><w:p><w:hyperlink r:id="rId2"><w:r><w:t>Open example.com</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> | </w:t></w:r><w:hyperlink w:anchor="TargetHere"><w:r><w:t>Jump to bookmark</w:t></w:r></w:hyperlink></w:p>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Numbering and links regression sample')}{''.join(items)}{linkp}{sect()}</w:body></w:document>'''
rels='''<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>'''
pkg(doc,'numbering-links.docx',rels,{'word/numbering.xml':numbering},[('word/numbering.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml')])

# 4 notes: footnote + endnote.
footnotes=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="{W}"><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/><w:t xml:space="preserve"> Footnote body used for page-bottom layout regression.</w:t></w:r></w:p></w:footnote></w:footnotes>'''
endnotes=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:endnotes xmlns:w="{W}"><w:endnote w:id="3"><w:p><w:r><w:endnoteRef/><w:t xml:space="preserve"> Endnote body appended after the main story.</w:t></w:r></w:p></w:endnote></w:endnotes>'''
body=p('Notes regression sample')+'''<w:p><w:r><w:t>Paragraph with a footnote</w:t><w:footnoteReference w:id="2"/><w:t xml:space="preserve"> and an endnote</w:t><w:endnoteReference w:id="3"/><w:t>.</w:t></w:r></w:p>'''
for i in range(12): body += p(f'Body paragraph {i+1}. Repeated content ensures the page-footnote reservation participates in normal flow.')
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{body}{sect()}</w:body></w:document>'''
rels='''<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>'''
pkg(doc,'notes.docx',rels,{'word/footnotes.xml':footnotes,'word/endnotes.xml':endnotes},[
('word/footnotes.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml'),
('word/endnotes.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml')])

# 5 table-pagination-edge: repeat header, cantSplit, vertical merge and multi-page table.
edge_rows=[]
edge_rows.append('''<w:tr><w:trPr><w:tblHeader/></w:trPr>
<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Key</w:t></w:r></w:p></w:tc>
<w:tc><w:tcPr><w:tcW w:w="4200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Detail</w:t></w:r></w:p></w:tc></w:tr>''')
for i in range(1,5):
    edge_rows.append(f'''<w:tr><w:tc><w:p><w:r><w:t>R{i}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{'Repeated table content. ' * 6}</w:t></w:r></w:p></w:tc></w:tr>''')
edge_rows.append('''<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:p><w:r><w:t>LOCK</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cantSplit row must move as a whole when it does not fit.</w:t></w:r></w:p></w:tc></w:tr>''')
edge_rows.append('''<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>MERGED</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Vertical merge start.</w:t></w:r></w:p></w:tc></w:tr>''')
edge_rows.append('''<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:r><w:t>Vertical merge continuation.</w:t></w:r></w:p></w:tc></w:tr>''')
for i in range(5,11):
    edge_rows.append(f'''<w:tr><w:tc><w:p><w:r><w:t>R{i}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{'More content for pagination. ' * 5}</w:t></w:r></w:p></w:tc></w:tr>''')
edge_table=f'''<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="4200"/></w:tblGrid>{''.join(edge_rows)}</w:tbl>'''
# Short page to force pagination deterministically.
short_sect='''<w:sectPr><w:pgSz w:w="11906" w:h="5000"/><w:pgMar w:top="720" w:right="900" w:bottom="720" w:left="900" w:header="360" w:footer="360"/><w:cols w:num="1" w:space="720"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Table pagination edge sample')}{edge_table}{short_sect}</w:body></w:document>'''
pkg(doc,'table-pagination-edge.docx')

# 6 section-page-numbering: restart and formatting across next-page section.
body=[]
body.append(p('Section one page one.'))
body.append(p('Section one continues with a forced page.', '<w:pageBreakBefore/>'))
body.append(p('Section one closing paragraph.', '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/><w:cols w:num="1"/><w:pgNumType w:start="4" w:fmt="lowerRoman"/></w:sectPr>'))
body.append(p('Section two begins on a new page and restarts numbering.'))
final_sect='''<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/><w:cols w:num="1"/><w:pgNumType w:start="1" w:fmt="decimal"/></w:sectPr>'''
# Footer contains PAGE so formatted section page numbering is observable through layout/rendering.
footer='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="'''+W+'''"><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>'''
# Add the same footer ref to each section.
body=[item.replace('</w:sectPr>','<w:footerReference w:type="default" r:id="rId1"/></w:sectPr>') if '<w:sectPr>' in item else item for item in body]
final_sect=final_sect.replace('</w:sectPr>','<w:footerReference w:type="default" r:id="rId1"/></w:sectPr>')
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{''.join(body)}{final_sect}</w:body></w:document>'''
rels='''<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'''
pkg(doc,'section-page-numbering.docx',rels,{'word/footer1.xml':footer},[('word/footer1.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml')])

# 7 footnote-pagination-edge: multiple notes, table reference, short page and long bodies.
footnotes=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="{W}">
<w:footnote w:id="2"><w:p><w:r><w:footnoteRef/><w:t xml:space="preserve"> First long footnote. {'Footnote detail. ' * 12}</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="4"><w:p><w:r><w:footnoteRef/><w:t xml:space="preserve"> Second footnote from a table cell. {'Additional detail. ' * 10}</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="6"><w:p><w:r><w:footnoteRef/><w:t xml:space="preserve"> Third footnote used to exercise repagination. {'More note content. ' * 12}</w:t></w:r></w:p></w:footnote>
</w:footnotes>'''
body=p('Footnote pagination edge sample')
body+='''<w:p><w:r><w:t>Opening paragraph with note</w:t><w:footnoteReference w:id="2"/><w:t>.</w:t></w:r></w:p>'''
body+='''<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Table cell footnote</w:t><w:footnoteReference w:id="4"/><w:t>.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'''
for i in range(9): body += p(f'Body flow paragraph {i+1}. ' + 'Normal body content participates in page reservation. ' * 2)
body+='''<w:p><w:r><w:t>Late paragraph with note</w:t><w:footnoteReference w:id="6"/><w:t>.</w:t></w:r></w:p>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{body}{short_sect}</w:body></w:document>'''
rels='''<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'''
pkg(doc,'footnote-pagination-edge.docx',rels,{'word/footnotes.xml':footnotes},[
('word/footnotes.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml')])

print('\n'.join(str(path.relative_to(ROOT)) for path in sorted(OUT.glob('*.docx'))))

# 8 field-links-highlight: field-based links plus text highlight.
field_body = '''
<w:p><w:bookmarkStart w:id="9" w:name="FieldTarget"/><w:r><w:t>Field target paragraph</w:t></w:r><w:bookmarkEnd w:id="9"/></w:p>
<w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Highlighted text</w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t> SHOULD_NOT_RENDER</w:t></w:r></w:p>
<w:p><w:fldSimple w:instr=' HYPERLINK "https://example.com" '><w:r><w:t>Field external link</w:t></w:r></w:fldSimple></w:p>
<w:p><w:fldSimple w:instr=' REF FieldTarget \\h '><w:r><w:t>Field bookmark link</w:t></w:r></w:fldSimple></w:p>
<w:p><w:fldSimple w:instr=' PAGEREF FieldTarget \\h '><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Field links and highlight regression sample')}{field_body}{sect()}</w:body></w:document>'''
pkg(doc,'field-links-highlight.docx')

# 9 text-semantics-lowcost: caps/smallCaps + move revisions + customXml visible content.
semantic_body = f'''
<w:p><w:r><w:rPr><w:caps/></w:rPr><w:t>Caps text</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:smallCaps/></w:rPr><w:t>Small Caps</w:t></w:r></w:p>
<w:p>
  <w:moveFrom w:id="1"><w:r><w:t>OLD_MOVED_TEXT</w:t></w:r></w:moveFrom>
  <w:moveTo w:id="2"><w:r><w:t>MOVED_VISIBLE</w:t></w:r></w:moveTo>
</w:p>
<w:p><w:customXml w:uri="urn:test" w:element="wrapped"><w:r><w:t>CUSTOM_VISIBLE</w:t></w:r></w:customXml></w:p>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Low-cost text semantics regression sample')}{semantic_body}{sect()}</w:body></w:document>'''
pkg(doc,'text-semantics-lowcost.docx')

# 10 page-background: document background color flows through the pipeline.
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:background w:color="FFF2CC"/><w:body>{p('Page background regression sample')}{sect()}</w:body></w:document>'''
pkg(doc,'page-background.docx')

# 11 common-formatting: low-cost parity features through the full DOCX pipeline.
formatting_body = f'''
<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="8" w:color="FF0000"/><w:bottom w:val="dashed" w:sz="4" w:color="00AA00"/></w:pBdr></w:pPr><w:r><w:t>Bordered paragraph</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:em w:val="dot"/></w:rPr><w:t>강조점</w:t></w:r></w:p>
<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t>שלום</w:t></w:r></w:p>
<w:p><w:hyperlink r:id="rId2" w:tooltip="Open example" w:tgtFrame="_blank"><w:r><w:t>Tooltip link</w:t></w:r></w:hyperlink></w:p>
<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="autofit"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/></w:tblGrid>
<w:tr><w:tc><w:tcPr><w:noWrap/></w:tcPr><w:p><w:r><w:t>LONG_TOKEN_NO_WRAP</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>normal cell text wraps when needed</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Common formatting regression sample')}{formatting_body}{sect()}</w:body></w:document>'''
rels='''<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>'''
pkg(doc,'common-formatting.docx',rels)

# 12 table-floating-edge: a table starts above an anchored square-wrapped object
# but extends into its vertical range. The table flow must use the bounded side box.
WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
anchor = f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:positionH relativeFrom="margin"><wp:posOffset>254000</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="margin"><wp:posOffset>190500</wp:posOffset></wp:positionV>
<wp:extent cx="1016000" cy="508000"/>
<wp:wrapSquare wrapText="bothSides"/>
<wp:docPr id="1" name="Floating rectangle"/>
</wp:anchor></w:drawing></w:r></w:p>'''
float_table='''<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/></w:tblPr>
<w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="2200"/></w:tblGrid>
<w:tr><w:tc><w:p><w:r><w:t>Left floating collision cell</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Right floating collision cell</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Second row</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>keeps table tall enough</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{anchor}{float_table}{sect()}</w:body></w:document>'''
pkg(doc,'table-floating-edge.docx')

# 13 footnote-section-edge: a footnote reference lives in a continuous section
# that shares the same physical page with the preceding section.
footnotes=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="{W}"><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/><w:t xml:space="preserve"> Continuous-section footnote stays at the shared page bottom.</w:t></w:r></w:p></w:footnote></w:footnotes>'''
first = p('First section content before a continuous section boundary.')
first += p('Continuous boundary.', sect())
second = '''<w:p><w:r><w:t>Second section owns this reference</w:t><w:footnoteReference w:id="2"/><w:t xml:space="preserve"> and continues on the same physical page.</w:t></w:r></w:p>'''
second += p('Second-section trailing content verifies body/footnote separation.')
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{first}{second}{sect(stype='continuous')}</w:body></w:document>'''
rels='''<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'''
pkg(doc,'footnote-section-edge.docx',rels,{'word/footnotes.xml':footnotes},[
('word/footnotes.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml')])

# 14 nested-table-pagination-edge: a nested-table row does not fit the current
# page fragment and must move at the outer row boundary without losing content.
prefix=''.join(p(f'Lead paragraph {i+1}. Pagination setup content.') for i in range(5))
nested_rows=''.join(f'''<w:tr><w:tc><w:p><w:r><w:t>Nested row {i+1} A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Nested row {i+1} B</w:t></w:r></w:p></w:tc></w:tr>''' for i in range(4))
nested=f'''<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1200"/></w:tblGrid>{nested_rows}</w:tbl>'''
outer=f'''<w:tbl><w:tblPr><w:tblW w:w="3000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>
<w:tr><w:tc><w:p><w:r><w:t>Outer first row</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Nested table row starts here</w:t></w:r></w:p>{nested}<w:p><w:r><w:t>Nested table row ends here</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{prefix}{outer}{sect(width=6000,height=5000)}</w:body></w:document>'''
pkg(doc,'nested-table-pagination-edge.docx')

# 15 float-clear-break: a manual line break with w:clear="all" must resume below
# a preceding square-wrapped float instead of staying in the side flow box.
clear_anchor = f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:positionH relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionV>
<wp:extent cx="1270000" cy="1016000"/>
<wp:wrapSquare wrapText="bothSides"/>
<wp:docPr id="2" name="Clear-break floating rectangle"/>
</wp:anchor></w:drawing></w:r></w:p>'''
clear_para='''<w:p><w:r><w:t>Text beside the float before clear</w:t><w:br w:clear="all"/><w:t>Text below the float after clear</w:t></w:r></w:p>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{clear_anchor}{clear_para}{sect()}</w:body></w:document>'''
pkg(doc,'float-clear-break.docx')

# 16 column-separator-continuous: separator belongs to the section region only,
# including a continuous section that starts lower on the same physical page.
first = p('Single-column introduction before continuous section.', '''<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/><w:cols w:num="1" w:space="720"/></w:sectPr>''')
body = first
for i in range(8):
    body += p(f'Separated two-column paragraph {i+1}. This content exercises a region-scoped column rule.')
final = '''<w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/><w:cols w:num="2" w:space="720" w:sep="1"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{body}{final}</w:body></w:document>'''
pkg(doc,'column-separator-continuous.docx')

# 17 section-parity-break: oddPage inserts a blank physical page when the next
# candidate page has the wrong parity; a following evenPage transition can start
# directly when parity already matches.
parity_body = p('Section A on physical page 1.', sect())
parity_body += p('Section B starts on odd physical page 3.', sect(stype='oddPage'))
parity_body += p('Section C starts on even physical page 4.')
doc = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{parity_body}{sect(stype='evenPage')}</w:body></w:document>'''
pkg(doc, 'section-parity-break.docx')

# 18 mirrored-margins-gutter: mirror left/right margins on facing pages and add
# the section gutter to the physical binding edge without changing body width.
settings='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="%s"><w:mirrorMargins/></w:settings>''' % W
mirror_body=''.join(p(f'Mirrored margin paragraph {i+1}. ' + ('Facing-page geometry content. ' * 3)) for i in range(8))
mirror_sect='''<w:sectPr><w:pgSz w:w="4000" w:h="7000"/><w:pgMar w:top="400" w:right="1200" w:bottom="400" w:left="600" w:header="200" w:footer="200" w:gutter="400"/><w:cols w:num="1"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{mirror_body}{mirror_sect}</w:body></w:document>'''
rels='''<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'''
pkg(doc,'mirrored-margins-gutter.docx',rels,{'word/settings.xml':settings},[
('word/settings.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml')])

# 19 low-cost text formatting: line-relative paragraph spacing plus bounded
# character border and explicit underline color are common visual properties
# that can reuse the existing text/layout pipeline without a new subsystem.
format_body = '''
<w:p><w:pPr><w:spacing w:beforeLines="50" w:afterLines="100"/></w:pPr>
  <w:r><w:rPr><w:bdr w:val="single" w:sz="8" w:space="1" w:color="FF0000"/><w:u w:val="single" w:color="00AA00"/></w:rPr><w:t>Bordered and colored underline</w:t></w:r>
</w:p>
<w:p><w:r><w:t>Following paragraph verifies line-relative after spacing.</w:t></w:r></w:p>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{format_body}{sect()}</w:body></w:document>'''
pkg(doc,'text-formatting-lowcost-2.docx')

# 20 character-indentation: OOXML character-unit indents use the active paragraph
# font metric when physical twip alternatives are absent.
char_indent_body = '''
<w:p><w:pPr><w:ind w:leftChars="200" w:rightChars="100" w:firstLineChars="150"/></w:pPr>
  <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Character-unit first line indentation is measured from the active font.</w:t></w:r>
</w:p>
<w:p><w:pPr><w:ind w:leftChars="200" w:hangingChars="100"/></w:pPr>
  <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Character-unit hanging indentation keeps wrapped lines aligned to the paragraph body.</w:t></w:r>
</w:p>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{char_indent_body}{sect()}</w:body></w:document>'''
pkg(doc,'character-indentation.docx')

# 21 float-multicolumn-edge: a side-wrapped float in the first column must narrow
# only overlapping first-column lines; another physical column keeps its own box.
float_multi_anchor = f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:positionH relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionV>
<wp:extent cx="762000" cy="762000"/>
<wp:wrapSquare wrapText="bothSides"/>
<wp:docPr id="3" name="Two-column floating rectangle"/>
</wp:anchor></w:drawing></w:r></w:p>'''
float_multi_body = float_multi_anchor
for i in range(18):
    float_multi_body += p(f'Two-column floating flow paragraph {i+1}. ' + ('Column flow content. ' * 4))
float_multi_sect='''<w:sectPr><w:pgSz w:w="7000" w:h="5000"/><w:pgMar w:top="400" w:right="400" w:bottom="400" w:left="400" w:header="200" w:footer="200"/><w:cols w:num="2" w:space="400"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{float_multi_body}{float_multi_sect}</w:body></w:document>'''
pkg(doc,'float-multicolumn-edge.docx')

# 22 complex-script-formatting: reuse the existing basic RTL path while honoring
# OOXML complex-script font/size/bold/italic overrides. This remains bounded
# formatting support, not a full shaping/bidi engine.
complex_body = '''
<w:p><w:pPr><w:bidi/></w:pPr>
  <w:r><w:rPr><w:rtl/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="30"/><w:b/><w:bCs w:val="0"/><w:i w:val="0"/><w:iCs/></w:rPr><w:t>שלום עולם</w:t></w:r>
</w:p>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Complex-script formatting regression sample')}{complex_body}{sect()}</w:body></w:document>'''
pkg(doc,'complex-script-formatting.docx')

# 23 floating-stacking: foreground anchors must paint above body text while
# behindDoc anchors stay behind it; relativeHeight orders anchors in one layer.
A='http://schemas.openxmlformats.org/drawingml/2006/main'
WPG='http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'
WPS='http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
def shape_anchor(doc_id, color, relative_height, behind):
    return f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" xmlns:a="{A}" xmlns:wpg="{WPG}" xmlns:wps="{WPS}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="{relative_height}" behindDoc="{behind}" locked="0" layoutInCell="1" allowOverlap="1">
    <wp:positionH relativeFrom="page"><wp:posOffset>1270000</wp:posOffset></wp:positionH>
    <wp:positionV relativeFrom="page"><wp:posOffset>1270000</wp:posOffset></wp:positionV>
    <wp:extent cx="1524000" cy="762000"/><wp:wrapNone/><wp:docPr id="{doc_id}" name="Stack {doc_id}"/>
    <a:graphic><a:graphicData uri="urn:test:shape"><wps:wsp><wps:spPr><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln><a:prstGeom prst="rect"/></wps:spPr></wps:wsp></a:graphicData></a:graphic>
    </wp:anchor></w:drawing></w:r></w:p>'''
stack_body = shape_anchor(21,'D9EAD3',20,1) + shape_anchor(22,'F4CCCC',10,0) + shape_anchor(23,'CFE2F3',30,0)
stack_body += p('Body text crosses the overlapping floating shapes to verify front/behind paint order.')
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{stack_body}{sect()}</w:body></w:document>'''
pkg(doc,'floating-stacking.docx')

# 24 table-cell-spacing: common Word table cell spacing should create visible
# gaps between adjacent cell boxes while preserving the table's overall width.
spacing_table = '''<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellSpacing w:w="120" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="8"/><w:insideV w:val="single" w:sz="8"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
<w:tr><w:tc><w:p><w:r><w:t>Spaced A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Spaced B</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Spaced C</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Spaced D</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Table cell spacing regression sample')}{spacing_table}{sect()}</w:body></w:document>'''
pkg(doc,'table-cell-spacing.docx')

# 25 mirrored-header-evenodd: combine facing-page geometry with Word's
# even/odd header selection to ensure page-context margins reach page parts.
settings='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="%s"><w:mirrorMargins/><w:evenAndOddHeaders/></w:settings>''' % W
odd_header=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="{W}"><w:p><w:r><w:t>ODD HEADER</w:t></w:r></w:p></w:hdr>'''
even_header=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="{W}"><w:p><w:r><w:t>EVEN HEADER</w:t></w:r></w:p></w:hdr>'''
header_body=p('Facing header page one.') + p('Facing header page two.', '<w:pageBreakBefore/>')
header_sect='''<w:sectPr><w:headerReference w:type="default" r:id="rIdOdd"/><w:headerReference w:type="even" r:id="rIdEven"/><w:pgSz w:w="4000" w:h="7000"/><w:pgMar w:top="500" w:right="1100" w:bottom="500" w:left="700" w:header="250" w:footer="250" w:gutter="200"/><w:cols w:num="1"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{header_body}{header_sect}</w:body></w:document>'''
rels='''<Relationship Id="rIdSettings2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdOdd" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdEven" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>'''
pkg(doc,'mirrored-header-evenodd.docx',rels,{
  'word/settings.xml':settings,
  'word/header1.xml':odd_header,
  'word/header2.xml':even_header,
},[
  ('word/settings.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'),
  ('word/header1.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'),
  ('word/header2.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'),
])

# 26 floating-no-overlap: an anchor with allowOverlap=0 participates in bounded
# collision avoidance; later overlapping anchors move down without a shape engine.
def simple_anchor(doc_id, y_emu, allow_overlap, color='D9EAD3'):
    return f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" xmlns:a="{A}" xmlns:wps="{WPS}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="{doc_id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="{allow_overlap}">
    <wp:positionH relativeFrom="page"><wp:posOffset>1270000</wp:posOffset></wp:positionH>
    <wp:positionV relativeFrom="page"><wp:posOffset>{y_emu}</wp:posOffset></wp:positionV>
    <wp:extent cx="1270000" cy="635000"/><wp:wrapNone/><wp:docPr id="{doc_id}" name="NoOverlap {doc_id}"/>
    <a:graphic><a:graphicData uri="urn:test:shape"><wps:wsp><wps:spPr><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:prstGeom prst="rect"/></wps:spPr></wps:wsp></a:graphicData></a:graphic>
    </wp:anchor></w:drawing></w:r></w:p>'''
no_overlap_body = simple_anchor(31,254000,'0','D9EAD3') + simple_anchor(32,381000,'1','F4CCCC') + p('The second anchor should be moved below the first because one object disallows overlap.')
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{no_overlap_body}{sect()}</w:body></w:document>'''
pkg(doc,'floating-no-overlap.docx')

# 27 table-section-break: a table immediately before a next-page section break
# must remain in the old section while the following section begins on a new page.
section_table='''<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="2500"/></w:tblGrid>
<w:tr><w:tc><w:p><w:r><w:t>Section table A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Section table B</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Section table C</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Section table D</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'''
first_section = '''<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="7000" w:h="5000"/><w:pgMar w:top="500" w:right="500" w:bottom="500" w:left="500" w:header="250" w:footer="250"/><w:cols w:num="1"/></w:sectPr>'''
final_section = '''<w:sectPr><w:pgSz w:w="9000" w:h="5000"/><w:pgMar w:top="500" w:right="700" w:bottom="500" w:left="700" w:header="250" w:footer="250"/><w:cols w:num="1"/></w:sectPr>'''
section_body = p('Table before section break') + section_table + p('End of first section', first_section) + p('Second section starts on a new physical page.')
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{section_body}{final_section}</w:body></w:document>'''
pkg(doc,'table-section-break.docx')

# 28 footnote-table-edge: footnote references inside table cells must reserve the
# page-bottom note region and survive table pagination without overlapping it.
footnote_table_part=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="{W}"><w:footnote w:id="8"><w:p><w:r><w:footnoteRef/><w:t xml:space="preserve"> Table-cell footnote body.</w:t></w:r></w:p></w:footnote></w:footnotes>'''
foot_rows=[]
for i in range(1,8):
    ref='<w:footnoteReference w:id="8"/>' if i==3 else ''
    foot_rows.append(f'''<w:tr><w:tc><w:p><w:r><w:t>Row {i}</w:t>{ref}<w:t xml:space="preserve"> {'Table content ' * 7}</w:t></w:r></w:p></w:tc></w:tr>''')
foot_table=f'''<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid>{''.join(foot_rows)}</w:tbl>'''
foot_short='''<w:sectPr><w:pgSz w:w="7000" w:h="5000"/><w:pgMar w:top="500" w:right="700" w:bottom="500" w:left="700" w:header="250" w:footer="250"/><w:cols w:num="1"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Footnote in table regression sample')}{foot_table}{foot_short}</w:body></w:document>'''
rels='''<Relationship Id="rIdFoot8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'''
pkg(doc,'footnote-table-edge.docx',rels,{'word/footnotes.xml':footnote_table_part},[('word/footnotes.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml')])

# 29 paragraph-border-spacing: pBdr w:space should inset paragraph text from
# the painted border while keeping border painting in the existing renderer path.
border_space_body = '''
<w:p><w:pPr><w:pBdr>
  <w:top w:val="single" w:sz="8" w:space="4" w:color="4472C4"/>
  <w:right w:val="single" w:sz="8" w:space="8" w:color="4472C4"/>
  <w:bottom w:val="single" w:sz="8" w:space="6" w:color="4472C4"/>
  <w:left w:val="single" w:sz="8" w:space="10" w:color="4472C4"/>
</w:pBdr></w:pPr><w:r><w:t>Paragraph border spacing keeps text away from each edge.</w:t></w:r></w:p>
<w:p><w:r><w:t>Following paragraph verifies ordinary flow after the bordered block.</w:t></w:r></w:p>
'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{border_space_body}{sect()}</w:body></w:document>'''
pkg(doc,'paragraph-border-spacing.docx')

# 30 continuous-mirror-context: a continuous section on an odd physical page
# and its overflow onto an even page must resolve mirrorMargins from the physical
# page context, not mutate or cache the section margins themselves.
settings='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="%s"><w:mirrorMargins/></w:settings>''' % W
continuous_first = p('Odd-page region before the continuous section.', '''<w:sectPr><w:pgSz w:w="5000" w:h="5000"/><w:pgMar w:top="400" w:right="1100" w:bottom="400" w:left="700" w:header="200" w:footer="200" w:gutter="200"/><w:cols w:num="1"/></w:sectPr>''')
continuous_body = continuous_first + ''.join(p(f'Continuous mirrored content {i+1}. ' + ('flow text ' * 10)) for i in range(8))
continuous_final='''<w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="5000" w:h="5000"/><w:pgMar w:top="400" w:right="1100" w:bottom="400" w:left="700" w:header="200" w:footer="200" w:gutter="200"/><w:cols w:num="1"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{continuous_body}{continuous_final}</w:body></w:document>'''
rels='''<Relationship Id="rIdSettings3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'''
pkg(doc,'continuous-mirror-context.docx',rels,{'word/settings.xml':settings},[
  ('word/settings.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml')])

# 31 inline-style-boundaries: adjacent runs that differ only in low-cost
# paint attributes must not be coalesced into one layout fragment.
inline_styles = '''<w:p>
  <w:r><w:rPr><w:highlight w:val="yellow"/><w:shd w:val="clear" w:fill="FFF2CC"/><w:bdr w:val="single" w:sz="8" w:space="1" w:color="FF0000"/></w:rPr><w:t>A</w:t></w:r>
  <w:r><w:rPr><w:highlight w:val="green"/><w:shd w:val="clear" w:fill="E2F0D9"/><w:bdr w:val="single" w:sz="8" w:space="2" w:color="FF0000"/></w:rPr><w:t>B</w:t></w:r>
</w:p>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Inline style boundary regression sample')}{inline_styles}{sect()}</w:body></w:document>'''
pkg(doc,'inline-style-boundaries.docx')

# 32 theme-border-colors: theme-backed run/paragraph/table/cell borders should
# resolve before rendering; border style tokens must never be mistaken for colors.
theme=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="{A}" name="Regression Theme"><a:themeElements><a:clrScheme name="Regression"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2></a:clrScheme><a:fontScheme name="Regression"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>'''
theme_table='''<w:tbl><w:tblPr><w:tblW w:w="3600" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:themeColor="accent1"/><w:left w:val="single" w:sz="8" w:themeColor="accent1"/><w:bottom w:val="single" w:sz="8" w:themeColor="accent1"/><w:right w:val="single" w:sz="8" w:themeColor="accent1"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="1800"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcBorders><w:bottom w:val="double" w:sz="8" w:themeColor="accent2"/></w:tcBorders></w:tcPr><w:p><w:r><w:t>Theme cell</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Theme table</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'''
theme_para='''<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:themeColor="accent1"/></w:pBdr></w:pPr><w:r><w:rPr><w:bdr w:val="double" w:sz="8" w:themeColor="accent2"/></w:rPr><w:t>Theme-backed borders</w:t></w:r></w:p>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{theme_para}{theme_table}{sect()}</w:body></w:document>'''
rels='''<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'''
pkg(doc,'theme-border-colors.docx',rels,{'word/theme/theme1.xml':theme},[('word/theme/theme1.xml','application/vnd.openxmlformats-officedocument.theme+xml')])

# 33 floating-wrap-dist-side: per-wrap distance attributes must override anchor
# defaults and explicit wrapText left/right should constrain the single-float
# side flow without introducing a general polygon wrap engine.
wrap_dist_anchor = f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="40" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:positionH relativeFrom="page"><wp:posOffset>1016000</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="page"><wp:posOffset>254000</wp:posOffset></wp:positionV>
<wp:extent cx="762000" cy="762000"/>
<wp:wrapSquare wrapText="left" distT="127000" distB="190500" distL="63500" distR="63500"/>
<wp:docPr id="40" name="Wrap distance and side rectangle"/>
</wp:anchor></w:drawing></w:r></w:p>'''
wrap_dist_text = p('Explicit left-side wrap flow should stay left of the object while top and bottom distances expand the exclusion.')
wrap_dist_sect='''<w:sectPr><w:pgSz w:w="6000" w:h="4000"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/><w:cols w:num="1"/></w:sectPr>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{wrap_dist_anchor}{wrap_dist_text}{wrap_dist_sect}</w:body></w:document>'''
pkg(doc,'floating-wrap-dist-side.docx')

# 34 table-conditional-style: bounded tblStylePr support for common Word table
# look options (header row, banded rows, last column) using existing cell/text paths.
styles='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="%s"><w:docDefaults/><w:style w:type="table" w:styleId="AccentTable"><w:name w:val="Accent Table"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:color="666666"/><w:left w:val="single" w:sz="8" w:color="666666"/><w:bottom w:val="single" w:sz="8" w:color="666666"/><w:right w:val="single" w:sz="8" w:color="666666"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders></w:tblPr><w:tblStylePr w:type="firstRow"><w:tcPr><w:shd w:val="clear" w:fill="4472C4"/></w:tcPr><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr></w:tblStylePr><w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:fill="EAF0F8"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band2Horz"><w:tcPr><w:shd w:val="clear" w:fill="FFFFFF"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="lastCol"><w:rPr><w:i/></w:rPr></w:tblStylePr></w:style></w:styles>''' % W
rows=[]
for r,vals in enumerate([('Header A','Header B'),('Row A1','Row A2'),('Row B1','Row B2')]):
    rows.append('<w:tr>'+''.join(f'<w:tc><w:p><w:r><w:t>{v}</w:t></w:r></w:p></w:tc>' for v in vals)+'</w:tr>')
table=f'''<w:tbl><w:tblPr><w:tblStyle w:val="AccentTable"/><w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="1" w:noHBand="0" w:noVBand="1"/><w:tblW w:w="4200" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2100"/><w:gridCol w:w="2100"/></w:tblGrid>{''.join(rows)}</w:tbl>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Conditional table style regression sample')}{table}{sect()}</w:body></w:document>'''
rels='''<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'''
pkg(doc,'table-conditional-style.docx',rels,{'word/styles.xml':styles},[('word/styles.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml')])

# 35 table-row-grid-omissions: rows may omit leading/trailing grid columns via
# trPr gridBefore/gridAfter. Visible cells must stay on their logical tracks.
omitted_table='''<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>
<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
<w:tr><w:tc><w:p><w:r><w:t>Full A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Full B</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Full C</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:trPr><w:gridBefore w:val="1"/><w:gridAfter w:val="1"/><w:wBefore w:w="2000" w:type="dxa"/><w:wAfter w:w="2000" w:type="dxa"/></w:trPr><w:tc><w:p><w:r><w:t>Middle only</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Row grid omission regression sample')}{omitted_table}{sect()}</w:body></w:document>'''
pkg(doc,'table-row-grid-omissions.docx')

# 36 table-band-theme-modifiers: bounded table band sizes plus Word theme
# tint/shade modifiers should survive parser -> resolver -> IR -> renderer data.
styles='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="%s"><w:docDefaults/><w:style w:type="table" w:styleId="BandTintTable"><w:name w:val="Band Tint Table"/><w:tblPr><w:tblStyleRowBandSize w:val="2"/><w:tblStyleColBandSize w:val="2"/><w:tblBorders><w:top w:val="single" w:sz="8" w:themeColor="accent2" w:themeShade="80"/><w:left w:val="single" w:sz="8" w:themeColor="accent2" w:themeShade="80"/><w:bottom w:val="single" w:sz="8" w:themeColor="accent2" w:themeShade="80"/><w:right w:val="single" w:sz="8" w:themeColor="accent2" w:themeShade="80"/></w:tblBorders></w:tblPr><w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:themeFill="accent1" w:themeFillTint="80"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band2Horz"><w:tcPr><w:shd w:val="clear" w:themeFill="accent1" w:themeFillShade="80"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="band1Vert"><w:rPr><w:b/></w:rPr></w:tblStylePr><w:tblStylePr w:type="band2Vert"><w:rPr><w:i/></w:rPr></w:tblStylePr></w:style></w:styles>''' % W
rows=[]
for r in range(4):
    cells=''.join(f'<w:tc><w:p><w:r><w:t>R{r+1}C{c+1}</w:t></w:r></w:p></w:tc>' for c in range(4))
    rows.append(f'<w:tr>{cells}</w:tr>')
table=f'''<w:tbl><w:tblPr><w:tblStyle w:val="BandTintTable"/><w:tblLook w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/><w:tblW w:w="6400" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{''.join('<w:gridCol w:w="1600"/>' for _ in range(4))}</w:tblGrid>{''.join(rows)}</w:tbl>'''
theme=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="{A}" name="Band Theme"><a:themeElements><a:clrScheme name="Band Theme"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2></a:clrScheme><a:fontScheme name="Band Theme"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Band size and theme modifier regression sample')}{table}{sect()}</w:body></w:document>'''
rels='''<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'''
pkg(doc,'table-band-theme-modifiers.docx',rels,{'word/styles.xml':styles,'word/theme/theme1.xml':theme},[
('word/styles.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'),
('word/theme/theme1.xml','application/vnd.openxmlformats-officedocument.theme+xml')])

# 37 drawing-line-style: basic DrawingML line dash/no-fill paint semantics.
dashed_shape=f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" xmlns:a="{A}" xmlns:wps="{WPS}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="51" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:positionH relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionV><wp:extent cx="1828800" cy="0"/><wp:wrapNone/><wp:docPr id="51" name="Dashed line"/>
<a:graphic><a:graphicData uri="urn:test:shape"><wps:wsp><wps:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:prstGeom prst="line"/></wps:spPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>'''
no_line_shape=f'''<w:p><w:r><w:drawing><wp:anchor xmlns:wp="{WP}" xmlns:a="{A}" xmlns:wps="{WPS}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="52" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:positionH relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>1219200</wp:posOffset></wp:positionV><wp:extent cx="1828800" cy="457200"/><wp:wrapNone/><wp:docPr id="52" name="No outline rectangle"/>
<a:graphic><a:graphicData uri="urn:test:shape"><wps:wsp><wps:spPr><a:solidFill><a:srgbClr val="FFF2CC"/></a:solidFill><a:ln w="12700"><a:noFill/></a:ln><a:prstGeom prst="rect"/></wps:spPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>'''
doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{p('Drawing line style regression sample')}{dashed_shape}{no_line_shape}{sect()}</w:body></w:document>'''
pkg(doc,'drawing-line-style.docx')
