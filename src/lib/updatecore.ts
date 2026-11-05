// R2-a: the update list. `repo/updates.json` (on GitHub) lists the released versions, newest first or in any order,
// each with a very small summary; only the newest entry also carries the install facts (used by the install step).
// Everything here is plain functions (no TV calls), so a node test can run it.

export const UPDATES_URL = 'https://raw.githubusercontent.com/rudra-avatar/Hearth/main/repo/updates.json';

export interface UpdateEntry {
	version: string;
	date: string;
	summary: string[];
	/** install facts: present only when all three are valid */
	ipkUrl: string;
	sha256: string;
	size: number;
}

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPK_URL = /^https:\/\/github\.com\/rudra-avatar\/Hearth\/releases\/download\/[A-Za-z0-9._\/-]+\.ipk$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/g;
const MAX_VERSIONS = 30;
const MAX_LINES = 8;
const MAX_LINE = 160;
const MAX_SIZE = 200 * 1048576;

export function versionParts (v: string): number[] | null {
	if (typeof v !== 'string' || !VERSION.test(v)) return null;
	return v.split('.').map((n) => parseInt(n, 10));
}

/** Negative when a is older than b, 0 when equal or either is not a version, positive when newer. */
export function compareVersions (a: string, b: string): number {
	const x = versionParts(a), y = versionParts(b);
	if (!x || !y) return 0;
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
}

function cleanLine (v: unknown): string {
	return typeof v === 'string' ? v.replace(CONTROL, ' ').trim().slice(0, MAX_LINE) : '';
}

/** The entries of an update list, or null when the text is not a usable list. Bad entries are skipped. */
export function parseUpdates (text: string): UpdateEntry[] | null {
	let data: any;
	try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (e) { return null; }
	if (!data || data.format !== 1 || !(data.versions instanceof Array)) return null;
	const out: UpdateEntry[] = [];
	const seen: Record<string, boolean> = {};
	for (let i = 0; i < data.versions.length && out.length < MAX_VERSIONS; i++) {
		const e = data.versions[i];
		if (!e || !versionParts(e.version) || seen[e.version]) continue;
		seen[e.version] = true;
		const lines: string[] = [];
		const raw = e.summary instanceof Array ? e.summary : [];
		for (let j = 0; j < raw.length && lines.length < MAX_LINES; j++) { const line = cleanLine(raw[j]); if (line) lines.push(line); }
		const ok = typeof e.ipkUrl === 'string' && IPK_URL.test(e.ipkUrl) && typeof e.sha256 === 'string' && SHA256.test(e.sha256)
			&& typeof e.size === 'number' && e.size > 0 && e.size <= MAX_SIZE && Math.floor(e.size) === e.size;
		out.push({
			version: e.version,
			date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : '',
			summary: lines,
			ipkUrl: ok ? e.ipkUrl : '',
			sha256: ok ? e.sha256 : '',
			size: ok ? e.size : 0
		});
	}
	return out;
}

/** The entries newer than `current`, newest first. */
export function newerThan (current: string, entries: UpdateEntry[]): UpdateEntry[] {
	return entries.filter((e) => compareVersions(e.version, current) > 0).sort((a, b) => compareVersions(b.version, a.version));
}
