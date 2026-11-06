// Screen fit (2.1.5, issue #47): Hearth is drawn on a fixed 1920x1080 layout. On a TV whose web view window is smaller (an HD set
// reports 1280x720) the edges were cut off. Once at start, when the window is smaller than 1920x1080, `#root` is drawn at 1920x1080
// and scaled down to fit, centred. Nothing is saved, nothing runs while idle, a window that is 1920x1080 or bigger is not touched.
// Not used by the legacy bundle (webOS 3, Chromium 38). Pure rule: `fitFor`; `applyFit` does the one DOM write.
import {LAYOUT} from '../theme/tokens';

export interface Fit {scale: number; x: number; y: number}

const MIN_W = 320;
const MIN_H = 180;
let last: Fit | null = null;

/** The scale and offset that fit the layout into a w x h window, or null when no scaling is needed (or the size is not believable). */
export function fitFor (w: number, h: number): Fit | null {
	if (!(w >= MIN_W) || !(h >= MIN_H) || !isFinite(w) || !isFinite(h)) return null;
	const scale = Math.min(w / LAYOUT.screenWidth, h / LAYOUT.screenHeight);
	if (!(scale < 1)) return null;
	return {scale, x: (w - LAYOUT.screenWidth * scale) / 2, y: (h - LAYOUT.screenHeight * scale) / 2};
}

/** Scales `root` once for the given window; returns what was applied (null = left alone). */
export function applyFit (w: number, h: number, root: HTMLElement | null): Fit | null {
	const fit = fitFor(w, h);
	last = fit;
	if (!fit || !root) return null;
	root.style.width = LAYOUT.screenWidth + 'px';
	root.style.height = LAYOUT.screenHeight + 'px';
	root.style.transformOrigin = '0 0';
	root.style.transform = 'translate(' + fit.x.toFixed(2) + 'px,' + fit.y.toFixed(2) + 'px) scale(' + fit.scale.toFixed(4) + ')';
	return fit;
}

/** What `applyFit` did at start (for the Debug page), null when nothing was scaled. */
export function appliedFit (): Fit | null { return last; }

// Screen measurements (`getBoundingClientRect`, `innerWidth/Height`) are in real screen pixels; once `#root` is scaled, code that
// compares them with layout pixels must convert. Not scaled = every function returns its input unchanged.
export function layoutX (clientX: number): number { return last ? (clientX - last.x) / last.scale : clientX; }
export function layoutY (clientY: number): number { return last ? (clientY - last.y) / last.scale : clientY; }
/** The size of the window in layout pixels: the whole 1920x1080 when scaled, otherwise the window as it is. */
export function layoutSize (): {w: number; h: number} {
	if (last) return {w: LAYOUT.screenWidth, h: LAYOUT.screenHeight};
	return {w: typeof window !== 'undefined' ? window.innerWidth : LAYOUT.screenWidth, h: typeof window !== 'undefined' ? window.innerHeight : LAYOUT.screenHeight};
}
