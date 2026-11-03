# Regression DOCX fixtures

These fixtures broaden coverage beyond the KIMST golden document without pretending that the viewer's current output is Microsoft Word ground truth.

## Reference classes

- `word-golden`: captured from Microsoft Word and suitable for fidelity comparison.
- `engine-snapshot`: synthetic DOCX used for structural/browser regression only. A snapshot must not be treated as proof of Word fidelity.

The KIMST fixture remains the current Word-captured visual golden. The fixtures in this directory are `engine-snapshot` until explicit promotion.

## Fixtures

- `table-heavy.docx`: auto-fit widths, nested table, row sizing, borders.
- `mixed-sections.docx`: portrait → landscape, next-page section, continuous region, two-column flow.
- `numbering-links.docx`: multilevel numbering, external hyperlink, bookmark target/jump.
- `notes.docx`: page-bottom footnote reservation and document-end endnote flow.
- `table-pagination-edge.docx`: multi-page table, repeated header, cantSplit, vertical-merge boundary.
- `section-page-numbering.docx`: section page-number restart and PAGE field formatting (`iv`, `v`, `1`).
- `footnote-pagination-edge.docx`: multiple footnotes, table-cell footnote reference, bounded repagination.

`manifest.json` records purpose, reference class, and expected browser page counts.

## Commands

Regenerate synthetic DOCX fixtures:

```bash
python3 tools/generate-regression-fixtures.py
```

Run semantic/layout regression:

```bash
npm run regression:fixtures
```

Generate browser snapshots and verify expected page counts:

```bash
npm run regression:visual
```

Compare only Microsoft Word goldens:

```bash
npm run regression:golden
```

To promote a fixture after placing Word page images in
`tests/regression/visual/reference/<fixture-id>/page-*.png`:

```bash
python3 tools/promote-regression-golden.py <fixture-id>
```

Promotion fails deliberately if Word reference images do not exist.
