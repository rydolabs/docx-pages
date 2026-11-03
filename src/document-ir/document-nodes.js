export function createDocumentNode({ sections = [], resources = {}, settings = {}, metadata = {}, headers = {}, footers = {}, footnotes = {}, endnotes = {}, comments = {}, background = null } = {}) {
  return { type: "document", sections, resources, settings, metadata, headers, footers, footnotes, endnotes, comments, background };
}

export function createSectionNode({ properties = {}, children = [], headerRefs = [], footerRefs = [] } = {}) {
  return { type: "section", properties, children, headerRefs, footerRefs };
}
