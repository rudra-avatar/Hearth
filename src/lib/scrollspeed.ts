import {td} from '../i18n';
// How fast a held Left/Right key (or the Magic Remote pointer) moves along the home row.
// Pure functions (no UI). A held key repeats far faster than the row can glide, so repeats are
// thinned out: the first repeats are slow and the pace builds up gently (a gentle acceleration).

// Saved ids are permanent: 'fast' (saved by earlier versions) is now shown as "Max"; the new middle level is 'brisk', shown as "Fast".
export type ScrollSpeed = 'slow' | 'medium' | 'brisk' | 'fast';
export const SCROLL_SPEED_IDS: readonly ScrollSpeed[] = ['slow', 'medium', 'brisk', 'fast'];
export const scrollSpeedText = (v: ScrollSpeed): string => td(`scroll.${v}`);

interface Profile {start: number; end: number; ramp: number}
/** Time between steps of a held key: `start` ms at the first repeat, down to `end` ms after `ramp` steps. */
const PROFILES: Record<ScrollSpeed, Profile> = {
	slow: {start: 200, end: 110, ramp: 10},
	medium: {start: 140, end: 65, ramp: 8},
	brisk: {start: 110, end: 45, ramp: 7},
	fast: {start: 80, end: 30, ramp: 6}
};

/** A key counts as held when it comes this soon after the last step (or the TV marks it as a repeat). */
export const HELD_GAP_MS = 90;
/** A pause this long ends the held run. */
export const RUN_END_MS = 350;

export function repeatInterval (speed: ScrollSpeed, run: number): number {
	const p = PROFILES[speed] || PROFILES.medium;
	const t = Math.min(1, Math.max(0, run) / p.ramp);
	return Math.round(p.start + (p.end - p.start) * t);
}

export interface StepState {at: number; run: number}
export function initialStepState (): StepState {
	return {at: 0, run: 0};
}

/** Decide whether a Left/Right key press moves the highlight. A single tap always does; a held key does once per `repeatInterval`. */
export function stepDecision (state: StepState, now: number, repeat: boolean, speed: ScrollSpeed): {move: boolean; state: StepState} {
	const gap = now - state.at;
	if (gap > RUN_END_MS) return {move: true, state: {at: now, run: 0}};          // a new press
	const held = repeat || gap < HELD_GAP_MS;
	if (!held) return {move: true, state: {at: now, run: state.run}};            // a quick tap, not a repeat
	if (gap < repeatInterval(speed, state.run)) return {move: false, state};       // too soon: skip this repeat
	return {move: true, state: {at: now, run: state.run + 1}};
}
