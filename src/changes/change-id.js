export function revisionChangeId(revision = {}) {
  if (!revision?.kind) return null;
  if (revision.changeId) return String(revision.changeId);
  const id = revision.id != null && revision.id !== '' ? String(revision.id) : fallbackRevisionIdentity(revision);
  return `${normalizeKind(revision.kind)}-${sanitize(id)}`;
}

function fallbackRevisionIdentity(revision) {
  return [revision.author || 'anon', revision.date || 'undated'].join('-');
}

function normalizeKind(kind) {
  return kind === 'delete' ? 'del' : kind === 'insert' ? 'ins' : String(kind || 'revision');
}

function sanitize(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}
