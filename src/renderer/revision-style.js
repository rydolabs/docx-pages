import { revisionChangeId } from "../changes/change-id.js";

const PRESETS = Object.freeze({
  review: Object.freeze({
    del: Object.freeze({ backgroundColor: "#FCEBEB", color: "#A32D2D", textDecorationLine: "line-through" }),
    ins: Object.freeze({ backgroundColor: "#EAF3DE", color: "#3B6D11" }),
    moveFrom: Object.freeze({ backgroundColor: "#FCEBEB", color: "#A32D2D", textDecorationLine: "line-through" }),
    moveTo: Object.freeze({ backgroundColor: "#EAF3DE", color: "#3B6D11" })
  }),
  word: Object.freeze({
    del: Object.freeze({ color: "#C00000", textDecorationLine: "line-through" }),
    ins: Object.freeze({ color: "#0000FF", textDecorationLine: "underline" }),
    moveFrom: Object.freeze({ color: "#7030A0", textDecorationLine: "line-through" }),
    moveTo: Object.freeze({ color: "#7030A0", textDecorationLine: "underline" })
  }),
  none: Object.freeze({})
});

export function resolveRevisionStyle(option = "review") {
  if (option == null) return PRESETS.review;
  if (option === false || option === "none") return PRESETS.none;
  if (typeof option === "string") return PRESETS[option] || PRESETS.review;
  if (typeof option !== "object") return PRESETS.review;
  const base = option.preset ? (PRESETS[option.preset] || PRESETS.review) : PRESETS.review;
  return {
    del: mergeKind(base.del, option.del || option.delete),
    ins: mergeKind(base.ins, option.ins || option.insert),
    moveFrom: mergeKind(base.moveFrom, option.moveFrom),
    moveTo: mergeKind(base.moveTo, option.moveTo)
  };
}

export function applyRevisionPresentation(element, revision, changesOptions = {}) {
  if (!revision?.kind) return;
  const kind = revision.kind;
  element.dataset.revisionKind = kind;
  if (revision.id != null) element.dataset.revisionId = String(revision.id);
  const changeId = revisionChangeId(revision);
  if (changeId) element.dataset.changeId = changeId;
  if (revision.author) element.dataset.revisionAuthor = revision.author;
  if (revision.date) element.dataset.revisionDate = revision.date;
  if (revision.author || revision.date) {
    element.title = [revision.author, revision.date].filter(Boolean).join(" · ");
  }

  const styleOption = Object.prototype.hasOwnProperty.call(changesOptions || {}, "style")
    ? changesOptions.style
    : "review";
  const styles = resolveRevisionStyle(styleOption);
  applyStyleObject(element, styles[kind]);
}

function mergeKind(base, override) {
  if (override === false || override === null) return {};
  if (!override) return { ...(base || {}) };
  return { ...(base || {}), ...override };
}

function applyStyleObject(element, style) {
  if (!style) return;
  for (const [property, value] of Object.entries(style)) {
    if (value == null || value === false) continue;
    if (property === "textDecorationLine") {
      element.style.textDecorationLine = mergeDecorationLine(element.style.textDecorationLine, String(value));
      continue;
    }
    element.style[property] = String(value);
  }
}

function mergeDecorationLine(existing, next) {
  const values = new Set(String(existing || "").split(/\s+/).filter(Boolean));
  for (const value of String(next || "").split(/\s+/).filter(Boolean)) values.add(value);
  return [...values].join(" ");
}
