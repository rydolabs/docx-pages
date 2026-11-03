import { openDocx } from '../docx-viewer.js';

export async function renderAsync(data, bodyContainer, styleContainer = null, options = {}) {
  const mapped = mapDocxPreviewOptions(options, { styleContainer });
  const compatDebug = mapped.compatibility || null;
  if (compatDebug) delete mapped.compatibility;
  const result = await openDocx(data, bodyContainer, mapped);
  if (compatDebug) result.compatibility = compatDebug;
  return result;
}

export function mapDocxPreviewOptions(options = {}, context = {}) {
  const unsupported = [];
  const ignored = [];
  const mapped = {
    fonts: { embedded: options.ignoreFonts !== true },
    revisions: options.renderChanges === true ? { mode:'markup', style:'word' } : false
  };

  // Migration-only diagnostics. These options are intentionally not emulated
  // because the core viewer always uses Word-like fixed page geometry.
  for (const name of ['ignoreWidth','ignoreHeight','breakPages','ignoreLastRenderedPageBreak','renderHeaders','renderFooters','renderFootnotes','renderEndnotes','inWrapper','hideWrapperOnPrint','className','useBase64URL','renderComments','renderAltChunks','experimental','trimXmlDeclaration','h']) {
    if (Object.prototype.hasOwnProperty.call(options, name)) unsupported.push(name);
  }
  if (context.styleContainer != null) ignored.push('styleContainer');
  if (options.debug === true) mapped.compatibility = { debug:true, unsupported, ignored };
  return mapped;
}

export const compatibility = Object.freeze({
  supportedOptions: Object.freeze(['ignoreFonts','renderChanges','debug']),
  intentionallyUnsupportedOptions: Object.freeze([
    'ignoreWidth','ignoreHeight','breakPages','ignoreLastRenderedPageBreak',
    'renderHeaders','renderFooters','renderFootnotes','renderEndnotes',
    'inWrapper','hideWrapperOnPrint','className','useBase64URL',
    'renderComments','renderAltChunks','experimental','trimXmlDeclaration','h'
  ])
});
