// The Debug tab: what Hearth knows about this TV and what it has done lately, laid out to fit a screen so a photo
// of it is enough. Page 1: how to get the log files. Page 2: this TV (state, figures) and the latest events, in small type.

import type {UserConfig} from './storage';
import type {SystemStats} from './system';

export interface DebugSnapshot {
	about: string;
	rootDetail: string;
	appList: {source: string; count: number; ago: string} | null;
	weather: string;
	config: UserConfig;
	events: string[];
	/** memory and storage, once read (null when not rooted or not read) */
	stats?: SystemStats | null;
	/** the helper's log file exists only on rooted TVs with the helper on */
	userAgent: string;
}

export interface DebugPage {
	title: string;
	lines: string[];
	/** smaller type, so more lines fit */
	dense?: boolean;
	/** a second column shown to the right of `lines` (page 2: the latest events) */
	right?: {title: string; lines: string[]};
}

const WIDTH = 100;     // P94b: was 118 (lines ran over the right screen edge on the TV)
const LEFT_WIDTH = 76;     // page 2, left column (this TV), 20px type
const RIGHT_WIDTH = 50;    // page 2, right column (events); P94b: was 60
export const DENSE_ROWS = 22;   // event rows in the right column (28 ran off the bottom of the TV's screen)
const APP_STORAGE = '/mnt/lg/appstore';
export const REPORT_FILE = '/tmp/hearth-debug.txt';

const clip = (s: string, width: number = WIDTH): string => (s.length > width ? s.slice(0, width - 1) + '…' : s);
const gb = (mb: number): string => (mb < 0 ? '?' : mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB');
const yn = (v: boolean): string => (v ? 'on' : 'off');

export function debugPages (s: DebugSnapshot): DebugPage[] {
	const c = s.config;
	const chrome = /Chrome\/([0-9.]+)/.exec(s.userAgent);
	const state = [
		s.rootDetail ? 'Root detail: ' + s.rootDetail : '',
		`Web view: ${chrome ? 'Chrome ' + chrome[1] : 'unknown'}   Screen: ${typeof window !== 'undefined' ? window.innerWidth + '×' + window.innerHeight : '?'}`,
		s.appList ? `App list: ${s.appList.count} apps from the ${s.appList.source === 'homebrew' ? 'live Homebrew list' : s.appList.source === 'tv' ? "TV's remote-control service (experimental)" : 'built-in list'} (${s.appList.ago})` : 'App list: not read yet',
		`Weather: ${s.weather}`,
		'',
		`Theme ${c.theme}, background ${c.background}, icons ${c.iconScale}%, ${c.rows} row${c.rows === 1 ? '' : 's'}, labels ${yn(c.showLabels)}, minimal ${yn(c.minimal)}`,
		`Wallpaper ${c.wallpaper.mode}${c.wallpaper.path ? ' ' + c.wallpaper.path : ''}`,
		`Close LG Home ${c.closeHome ? 'on' : 'switched off (it kept coming back)'}, helper ${yn(c.replaceHome)}`,
		`Hidden apps ${c.hiddenIds ? c.hiddenIds.length : '?'}, sources shown ${c.sourceIds.length}, edited sources ${Object.keys(c.sourceEdits).length}`,
		`LG Home tile ${yn(c.showLgHome)}, System Settings tile ${yn(c.showSystem)}`
	].filter((l, i) => l !== '' || i === 5);
	const st = s.stats;
	state.push('');
	if (st) {
		// only the app storage matters (the other mounts are read-only or temporary); other TVs without it show all
		const appStore = st.disks.filter((d) => d.mount === APP_STORAGE);
		(appStore.length ? appStore : st.disks).forEach((d) => state.push(`Storage ${d.mount}: ${gb(d.freeMB)} free of ${gb(d.totalMB)}`));
	} else state.push('Storage: not available (needs a rooted TV)');
	const help = [
		'To send the report, photograph page 2 (the report file holds all events, not just these).',
		'',
		'Rooted TV, over SSH: open this tab once, then on a computer run',
		`   ssh root@<TV address> cat ${REPORT_FILE}`,
		'   ssh root@<TV address> cat /tmp/launcher-homehook.log      (the helper\'s own log, if the helper is on)',
		'   <TV address> is shown in the Homebrew Channel settings. The first file is written when this tab opens.',
		'',
		'No SSH client? webOS Dev Manager has a terminal option that gives SSH access to the TV:',
		'   open it, use the terminal, and run the same cat commands as above.',
		'',
		'Not rooted: only the photo works (a TV app cannot save files you can reach).',
		'',
		'Use ↑ and ↓ to change page.'
	].map((l) => clip(l));
	// a long event continues on a second, indented row instead of being cut (no flatMap: Chrome 53)
	const wrapped = s.events.reduce((rows: string[], e) => rows.concat(e.length <= RIGHT_WIDTH ? [e] : [e.slice(0, RIGHT_WIDTH), '  ' + e.slice(RIGHT_WIDTH, RIGHT_WIDTH * 2 - 2)]), []);
	const events = wrapped.length ? wrapped.slice(-DENSE_ROWS) : ['Nothing has happened yet.'];
	return [
		{title: 'Debug 1 of 2: how to share the logs', lines: help},
		{
			title: 'Debug 2 of 2: this TV and the latest events',
			lines: state.map((l) => clip(l, LEFT_WIDTH)),
			dense: true,
			right: {title: 'Latest events', lines: events.map((l) => clip(l, RIGHT_WIDTH))}
		}
	];
}

/** The pages as plain text, for the report file. */
export function reportText (pages: DebugPage[], allEvents?: string[], beforeRestart?: string[], bootTrace?: string[]): string {
	const base = pages.map((p) => p.title + '\n' + p.lines.join('\n') + (p.right ? '\n\n' + p.right.title + '\n' + p.right.lines.join('\n') : '')).join('\n\n') + '\n';
	const earlier = beforeRestart && beforeRestart.length ? '\nBefore the last restart (end of the old file)\n' + beforeRestart.join('\n') + '\n' : '';
	const trace = bootTrace && bootTrace.length ? '\nBoot trace of the webOS 3 guard (oldest first)\n' + bootTrace.join('\n') + '\n' : '';
	return (allEvents && allEvents.length ? base + '\nAll events since this start (oldest first)\n' + allEvents.join('\n') + '\n' : base) + earlier + trace;
}
