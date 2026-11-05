// Probe tests 53-55 (Tests tab only, 2.0.3 V probe): can Hearth's own helper service (no root, the SSAP helper) see the remote's
// key events, and open Hearth when Home is pressed? A separate no-root Home helper (Razdva122's clean-your-tv-lg-webos) works
// that way. Pure parts only: the answer of the service's `evdev` method turned into text.

type Json = Record<string, unknown>;

export interface Device {dev: string; name: string; readable: boolean; error?: string}
export interface KeyCount {down: number; up: number; rep: number; firstMs: number}
export interface EvdevReply {
	uid: number; arch: string; node: string; devices: Device[]; error?: string; watched?: string[];
	events?: Record<string, KeyCount>; launch?: {code: number; ok?: boolean; ms?: number; error?: string; pending?: boolean}; watchedMs?: number;
}

export function parseEvdev (r: Json): EvdevReply {
	const devices = (Array.isArray(r.devices) ? r.devices : []).map((d) => {
		const o = (d || {}) as Json;
		return {dev: String(o.dev || ''), name: String(o.name || ''), readable: o.readable === true, error: o.error ? String(o.error) : undefined};
	});
	return {
		uid: typeof r.uid === 'number' ? r.uid : -1, arch: String(r.arch || ''), node: String(r.node || ''), devices,
		error: r.error ? String(r.error) : undefined, watched: Array.isArray(r.watched) ? r.watched.map(String) : undefined,
		events: (r.events && typeof r.events === 'object' ? r.events : undefined) as Record<string, KeyCount> | undefined,
		launch: r.launch as EvdevReply['launch'], watchedMs: typeof r.watchedMs === 'number' ? r.watchedMs : undefined
	};
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Test 53: who the service runs as and which key devices it may open. */
export function devicesText (r: EvdevReply): string {
	const open = r.devices.filter((d) => d.readable);
	const sample = r.devices.slice(0, 8).map((d) => `${d.dev} ${clip(d.name || '?', 18)}${d.readable ? '' : ' (' + (d.error || 'no') + ')'}`).join(', ');
	return `service uid ${r.uid} (0 = root), ${r.arch}, node ${r.node}; ${r.devices.length} key devices, ${open.length} readable${r.error ? '; list error ' + r.error : ''}: ${sample}`;
}

export const HOME_CODES = [773, 774, 125];

/** Test 54/55: the key events counted while listening. */
export function eventsText (r: EvdevReply): string {
	const ev = r.events || {};
	const codes = Object.keys(ev);
	const keys = codes.length
		? codes.slice(0, 8).map((c) => `${c}${HOME_CODES.indexOf(Number(c)) >= 0 ? '(Home)' : ''}: down ${ev[c].down}, up ${ev[c].up}, repeat ${ev[c].rep}, first at ${(ev[c].firstMs / 1000).toFixed(1)} s`).join(' | ')
		: 'no key events';
	const home = codes.some((c) => HOME_CODES.indexOf(Number(c)) >= 0);
	const launch = r.launch
		? (r.launch.ok ? `; Hearth was asked to open ${r.launch.ms} ms after Home and the TV accepted` : r.launch.pending ? '; the launch request got no answer' : `; the launch failed: ${r.launch.error || '?'}`)
		: '';
	return `listened to ${(r.watched || []).join(', ') || 'nothing'}; ${keys}${home ? '' : '; NO Home key seen'}${launch}`;
}

/** Test 53 is OK when at least one device can be read; 54/55 when a key event arrived. */
export const readableCount = (r: EvdevReply): number => r.devices.filter((d) => d.readable).length;
export const sawKeys = (r: EvdevReply): boolean => Object.keys(r.events || {}).length > 0;
export const sawHome = (r: EvdevReply): boolean => Object.keys(r.events || {}).some((c) => HOME_CODES.indexOf(Number(c)) >= 0);
