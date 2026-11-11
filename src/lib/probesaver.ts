// Probe tests 49-53 (how the care drift moves the video; Tests tab only; 2.1.6 Q5, redesigned in Q6; p21: the drift modes 65-68 are gone, the nudge of mode 4 is the normal drift now, so 49 and 50 show whether the video stays in the frame).
// The saver runs with the probe overlay (setting overlay=1): an info panel with live numbers (so a missing panel shows at once that
// the Hearth saver is not what the TV displays), a red box on the picture layer that moves with the drift, a green box on the video
// item and a magenta line on each of the four screen edges. Tests: 49 light video Fill + care, 50 Fit + care, 51 Fill without care,
// 52 a still photo with care (to tell a video-plane problem from a general one), 53 put the settings back. The care drift runs every
// 8 s instead of every minute (setting driftms). The saver's settings file is copied first and put back by itself after PS_AUTO_S
// seconds (a detached job), or at once by test 53. Needs a rooted TV.

import {exec} from './apps';
import {classifyFailure} from './failure';
import {detached} from './fdclean';
import {SAVER_DIR, settingsCommand, type SaverSettings} from './screensavercmd';
import type {ProbeResult, ProbeTest} from './probe';

const SCRIPT = `${SAVER_DIR}/screensaver.sh`;
const SETTINGS = `${SAVER_DIR}/settings`;
const ORIG = `${SAVER_DIR}/settings.hearth-orig`;
/** The saver settings are put back by themselves this long after a probe test (seconds). */
export const PS_AUTO_S = 300;
/** The care drift step during the probe (ms; the normal step is 60000). */
export const PS_DRIFT_MS = 8000;

export interface SaverVariant {
	fill: boolean;
	care: boolean;
	/** a still photo instead of the light video */
	photo?: boolean;
}

/** The settings the probe writes: the light video (or one photo) alone, overlay on, no dim, no power off, drift every PS_DRIFT_MS. */
export function probeSettings (v: SaverVariant): SaverSettings {
	return {source: v.photo ? '@photo:photo-01' : '@probe', interval: 60, shuffle: false, dim: false, care: v.care ? 1 : 0, fill: v.fill ? 1 : 0, powerOff: 0, recursive: false, dimLevel: 40, driftMs: PS_DRIFT_MS, overlay: true};
}

/** Puts the saver settings back from the copy (when there is one) and mounts the QML again; prints restored=yes|no. */
export function restoreSaverCommand (): string {
	return `if [ -f ${ORIG} ]; then cat ${ORIG} > ${SETTINGS} && rm -f ${ORIG} && sh ${SCRIPT} apply >/dev/null 2>&1; echo restored=yes; else echo restored=no; fi`;
}

/** Copies the settings (only the first time), writes the probe settings, mounts, shows the saver, plans the put-back. Prints probe=<word>. */
export function probeSaverCommand (v: SaverVariant, seconds: number = PS_AUTO_S): string {
	const later = detached(`sh -c "sleep ${seconds}; ${restoreSaverCommand()}"`);
	return [
		`if [ ! -f ${SCRIPT} ]; then echo probe=no-saver; exit 0; fi`,
		`[ -f ${ORIG} ] || cp -f ${SETTINGS} ${ORIG} 2>/dev/null || : > ${ORIG}`,
		settingsCommand(probeSettings(v)),
		`r=$(sh ${SCRIPT} apply 2>/dev/null | tail -n 1)`,
		'if [ "$r" != applied ]; then echo "probe=apply-$r"; exit 0; fi',
		`s=$(sh ${SCRIPT} show 2>/dev/null | tail -n 1)`,
		later,
		'echo "probe=$s"'
	].join('; ');
}

export function parseProbe (out: string): string {
	const m = /probe=(\S+)/.exec(out);
	return m ? m[1] : '';
}

const msg = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || 'unknown');

function variantTest (id: string, label: string, v: SaverVariant): ProbeTest {
	const what = `${v.photo ? 'a still photo' : 'a 1 s light video'}, ${v.fill ? 'Fill' : 'Fit'}, care frame ${v.care ? 'on, drift every 8 s' : 'off'}`;
	return {
		id, manual: true, label,
		description: `Starts the saver with ${what} and an overlay: an info panel, a RED box (picture layer), a GREEN box (video item) and a MAGENTA line on each screen edge. Watch about 1 min and note: (1) is the panel there? (2) all four magenta lines? (3) does the red box move every 8 s? (4) any gap between the picture edge and the boxes? (5) after a move, does the video come back into the green frame by itself, and after how many seconds (panel: step N s ago)? Any key ends the saver. Your saver settings come back by themselves after ${Math.round(PS_AUTO_S / 60)} min, or run test 53. Needs a rooted TV with the screen saver on.`,
		run: (): Promise<ProbeResult> => exec(probeSaverCommand(v), 30000).then((out): ProbeResult => {
			const w = parseProbe(out);
			return w === 'shown' ? {ok: true, text: `Saver started (${what}). Panel there? Four magenta lines? Red box moves? Gap at an edge? Then run test 53.`}
				: {ok: false, text: w === 'no-saver' ? 'NO SAVER: switch the Hearth screen saver on first (System tab)' : `FAILED: ${w || out.trim().slice(0, 120) || 'no answer'}`};
		}, (e): ProbeResult => ({ok: false, text: `FAILED (${classifyFailure(e)}): ${msg(e)}`}))
	};
}

export const SAVER_PROBE_TESTS: ProbeTest[] = [
	variantTest('saverprobefillcare', '49. Saver probe: light video, Fill + care', {fill: true, care: true}),
	variantTest('saverprobefitcare', '50. Saver probe: light video, Fit + care', {fill: false, care: true}),
	variantTest('saverprobefillplain', '51. Saver probe: light video, Fill, no care frame', {fill: true, care: false}),
	variantTest('saverprobephoto', '52. Saver probe: still photo, Fill + care', {fill: true, care: true, photo: true}),
	{
		id: 'saverproberestore', label: '53. Saver probe: put my saver settings back now',
		description: 'Puts the saver settings back as they were before tests 49-52 and mounts the saver again. Safe to run at any time. Needs a rooted TV.',
		run: () => exec(restoreSaverCommand(), 30000).then((out): ProbeResult => (/restored=yes/.test(out) ? {ok: true, text: 'Given back: your saver settings are in place again.'} : {ok: true, text: 'Nothing to give back (no probe test had changed the settings, or they were already given back).'}), (e): ProbeResult => ({ok: false, text: `FAILED (${classifyFailure(e)}): ${msg(e)}`}))
	}
];
