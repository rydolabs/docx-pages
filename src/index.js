// Stable public package surface. Internal pipeline modules stay importable by
// project tests/tools through their source paths, but are not package exports.
export { openDocx } from "./docx-viewer.js";
