# Licensing and attribution

- DOCX Pages project source: **No license has been selected by the owner.** Obtain explicit licensing approval before offering rights for third-party redistribution or packaging to npm.
- JSZip v3.10.1: MIT OR GPL-3.0-or-later; the GitHub Pages build includes the license at `vendor/JSZIP-LICENSE.markdown`.
- pako v1.0.11: (MIT AND Zlib), included through JSZip; the site includes `vendor/PAKO-LICENSE`.
- `@xmldom/xmldom` v0.9.8: MIT, used for Node tests/development only (browser DOMParser is native).
- React is an optional peer dependency, not included in the static site output.

Audit transitive dependencies and licenses with the exact release lockfile before commercial rollout.

- Withheld docxjs/docx-preview upstream sample-derived DOCX (13), not distributed here: Apache-2.0 project, copyright Volodymyr Baydalka / respective contributors. https://github.com/VolodymyrBaydalka/docxjs/blob/master/LICENSE . The original sample/container byte provenance is recorded in `tests/corpus/manifest.json`. Review any additional rights to embedded third-party material before publication.
- Word PNG reference screenshots (87) were produced from in-house regression/diagnostic or upstream sample documents, excluding the KIMST real-world file. Reference images are not licensed from Microsoft as a package. Confirm document/output rights before distribution.
