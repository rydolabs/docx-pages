export class DocxViewerError extends Error {
  constructor(message, { code = "DOCX_VIEWER_ERROR", cause, details } = {}) {
    super(message, { cause }); this.name = this.constructor.name; this.code = code; this.details = details;
  }
}
export class ParserError extends DocxViewerError {}
export class LayoutError extends DocxViewerError {}
