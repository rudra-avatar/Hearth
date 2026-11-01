import {useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {failureText} from '../lib/failure';
import type {AppEntry} from '../lib/apps';
import {preloadMessage, readPreload, resetPreload, setPreloadOff, type PreloadView} from '../lib/preload';
import {t as tt} from '../i18n';

// "LG preloaded apps (experimental)": the apps LG keeps loaded in the background, one row each. OK switches an app's
// preloading off or back to LG's own setting. Nothing is closed. The list comes from the TV (lib/preload.ts).

interface Props {
	/** the app list, for the names of the apps (an app with no name here is not offered) */
	apps: AppEntry[];
	onClose: () => void;
	/** how many apps are switched off now, so the Settings row can show it and Hearth knows to tell the TV again at start */
	onChanged: (count: number) => void;
	onToast: (text: string, kind?: 'info' | 'error') => void;
}

interface Row {
	key: string;
	label: string;
	detail: string;
	icon: 'slideshow' | 'default' | 'info' | 'search';
	run: () => void;
}

const VISIBLE_ROWS = 6;
const RESET_KEY = 'reset';

export function Preload ({apps, onClose, onChanged, onToast}: Props) {
	const [view, setView] = useState<PreloadView | null>(null);
	const [problem, setProblem] = useState('');
	const [busy, setBusy] = useState('');
	const [index, setIndex] = useState(0);
	const alive = useRef(true);
	const titles = useRef<Record<string, string>>({});

	useEffect(() => () => { alive.current = false; }, []);

	const load = () => {
		const names: Record<string, string> = {};
		apps.forEach((a) => { names[a.id] = a.title; });
		titles.current = names;
		return readPreload(names).then((v) => {
			if (!alive.current) return;
			setView(v);
			setProblem('');
			onChanged(v.read.state.off.length);
		}, (e) => { if (alive.current) setProblem(failureText(e, tt('preload.readTheTvSPreload'))); });
	};

	useEffect(() => { load(); }, []);                                  // eslint-disable-line react-hooks/exhaustive-deps

	/** Runs a change, then reads the list again so the rows show what the TV really has. */
	const change = (text: string, run: () => Promise<string>) => {
		setBusy(text);
		run().then((result) => {
			if (!alive.current) return;
			onToast(preloadMessage(result as 'ok'), result === 'ok' ? 'info' : 'error');
		}, (e: Error) => {
			if (alive.current) onToast(preloadMessage('unreachable', e && e.message ? e.message : ''), 'error');
		}).then(() => load()).then(() => { if (alive.current) setBusy(''); });
	};

	const rows: Row[] = [];
	if (busy) {
		rows.push({key: 'busy', label: busy, detail: tt('preload.pleaseWait'), icon: 'info', run: () => undefined});
	} else if (!view && !problem) {
		rows.push({key: 'read', label: tt('preload.readingTheTv'), detail: tt('preload.pleaseWait2'), icon: 'info', run: () => undefined});
	} else if (view && view.supported) {
		view.apps.forEach((a) => {
			const memory = a.memoryMb !== null ? tt('preload.aboutMemorymbMbWhenLoaded', {memoryMb: a.memoryMb}) : tt('preload.memoryUseNotKnown');
			rows.push({
				key: a.id, label: a.title, icon: a.off ? 'default' : 'slideshow',
				detail: a.off
					? tt('preload.switchedOffOkGives')
					: tt('preload.preloadedByLg', {memory, loaded: a.loaded ? tt('preload.loadedNow') : ''}),
				run: () => change(`${a.off ? 'Giving back' : 'Switching off'} ${a.title}…`, () => setPreloadOff(view, a.id, !a.off))
			});
		});
		if (!view.apps.length) rows.push({key: 'none', label: tt('preload.noPreloadedAppsFound'), detail: tt('preload.lgPreloadsNoneOf'), icon: 'info', run: () => undefined});
		if (view.read.state.off.length) {
			rows.push({key: RESET_KEY, label: tt('preload.everythingBackToLg'), detail: tt('preload.givesEverySwitchedOff'), icon: 'search', run: () => change("Giving back LG's setting…", () => resetPreload(view))});
		}
	} else {
		rows.push({key: 'retry', label: tt('preload.readTheTvAgain'), detail: tt('preload.okTriesOnceMore'), icon: 'search', run: () => { setProblem(''); setView(null); load(); }});
	}

	const at = clamp(index, 0, Math.max(0, rows.length - 1));

	const handleKey = (key: NavKey): boolean => {
		if (busy) return true;
		if (key === 'up') setIndex(clamp(at - 1, 0, Math.max(0, rows.length - 1)));
		else if (key === 'down') setIndex(clamp(at + 1, 0, Math.max(0, rows.length - 1)));
		else if (key === 'enter') { if (rows[at]) rows[at].run(); }
		else if (key === 'back') onClose();
		return true;
	};
	useKeys(handleKey, true);

	const off = view ? view.read.state.off.length : 0;
	const lines = [
		'LG keeps these apps loaded in the background so they open fast. Switching one off frees its memory; it then opens a little slower.',
		tt('preload.nothingIsClosedAnApp')
	];
	if (view && !view.supported) lines.push('This TV has no list of preloaded apps, so nothing can be changed here.');
	if (view && view.supported) lines.push(off ? `${off} app${off === 1 ? ' is' : 's are'} switched off.` : 'Nothing is switched off: LG\'s own setting is in use.');

	const start = clamp(at - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('preload.lgPreloadedApps')}</h1>
				<p class="settings__hint">{tt('preload.moveOkSwitchesOff')}</p>
				<div class="picker__note">
					<div class="picker__note-title">{tt('preload.experimental')}</div>
					<div class="picker__note-para">{lines.map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					{problem && <div class="picker__note-para"><div class="picker__note-line picker__note-line--error">{problem}</div></div>}
				</div>
				<div class="picker">
					{visible.map((row, n) => {
						const i = start + n;
						return (
							<div
								key={row.key}
								class={`picker__row${i === at ? ' picker__row--focused' : ''}`}
								onMouseEnter={() => setIndex(i)}
								onClick={() => { setIndex(i); if (!busy) row.run(); }}
							>
								<PickerIcon kind={row.icon} />
								<div class="picker__text">
									<div class="picker__label">{row.label}</div>
									<div class="picker__detail">{row.detail}</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
