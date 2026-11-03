export const TWIPS_PER_POINT = 20;
export const EMUS_PER_POINT = 12700;
export const POINTS_PER_INCH = 72;
export const CSS_PIXELS_PER_INCH = 96;

export function twipToPt(value = 0) { return Number(value) / TWIPS_PER_POINT; }
export function halfPointToPt(value = 0) { return Number(value) / 2; }
export function emuToPt(value = 0) { return Number(value) / EMUS_PER_POINT; }
export function ptToPx(value = 0) { return Number(value) * CSS_PIXELS_PER_INCH / POINTS_PER_INCH; }
export function pxToPt(value = 0) { return Number(value) * POINTS_PER_INCH / CSS_PIXELS_PER_INCH; }
