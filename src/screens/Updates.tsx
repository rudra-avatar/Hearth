import {useEffect, useState} from 'preact/hooks';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {checkUpdates} from '../lib/updates';
import {newerThan, type UpdateEntry} from '../lib/updatecore';
import {HEARTH_VERSION} from '../config/version';
import {SYSTEM_APP} from '../config/constants';
import {rootState} from '../lib/failure';
import {canInstall, installUpdate} from '../lib/install';
import type {InstallProgress} from '../lib/installprogress';
import {launchApp} from '../lib/launch';
import type {NoticeButton} from '../components/Notice';
import {t as tt} from '../i18n';

// R2-a: "Check for updates". Opens from the first System row, asks GitHub for the update list once (on open, and on OK
// when nothing newer was found or the check failed), and shows every version above the one in use with its summary.
// R2-b: OK on the list installs the highlighted version (2.1.4; before, always the newest) (rooted TV, direct install after a question); otherwise, or when the
// install fails, a pop-up points to the Homebrew Channel. With the Debug tab on, ← → pretend to be an older version (test of the list).

interface Props {
	onClose: () => void;
	debug?: boolean;
	/** a pop-up is in front: this screen takes no keys meanwhile */
	paused?: boolean;
	/** shows a pop-up in the app (title, text, buttons) */
	notify: (n: {title: string; text: string; buttons: NoticeButton[]; onBack?: () => void}) => void;
	closeNotice: () => void;
}

const VISIBLE_ROWS = 5;
const PRETEND = ['', '2.0.0', '2.0.1', '2.0.2'];

export function Updates ({onClose, debug, paused, notify, closeNotice}: Props) {
	const [state, setState] = useState<'checking' | 'failed' | 'done' | 'installing'>('checking');
	const [entries, setEntries] = useState<UpdateEntry[]>([]);
	const [index, setIndex] = useState(0);
	const [pretend, setPretend] = useState(0);
	const [round, setRound] = useState(0);
	const [target, setTarget] = useState('');
	const [progress, setProgress] = useState<InstallProgress>({step: 'start', percent: 0, download: 0});

	useEffect(() => {
		let cancelled = false;
		setState('checking');
		setIndex(0);
		checkUpdates().then((result) => {
			if (cancelled) return;
			if (result.ok) { setEntries(result.entries); setState('done'); } else setState('failed');
		});
		return () => { cancelled = true; };
	}, [round]);

	const current = debug && pretend ? PRETEND[pretend] : HEARTH_VERSION;
	const list = state === 'done' || state === 'installing' ? newerThan(current, entries) : [];
	const at = clamp(index, 0, Math.max(0, list.length - 1));
	const shown = list[at];

	const brew = (title: string, text: string): void => {
		notify({
			title, text,
			buttons: [
				{label: tt('updates.openBrew'), tone: 'light', run: () => { closeNotice(); launchApp(SYSTEM_APP.homebrewChannel).then(undefined, () => undefined); }},
				{label: tt('app.close'), run: closeNotice}
			],
			onBack: closeNotice
		});
	};

	const askInstall = (entry: UpdateEntry): void => {
		if (rootState() !== 'yes') { brew(tt('updates.noRootTitle'), tt('updates.noRootText')); return; }
		if (!canInstall(entry)) { brew(tt('updates.noFactsTitle'), tt('updates.noFactsText')); return; }
		notify({
			title: tt('updates.askTitle', {version: entry.version}),
			text: tt('updates.askText'),
			buttons: [
				{label: tt('updates.askInstall'), tone: 'light', run: () => { closeNotice(); runInstall(entry); }},
				{label: tt('app.close'), run: closeNotice}
			],
			onBack: closeNotice
		});
	};

	const runInstall = (entry: UpdateEntry): void => {
		setTarget(entry.version);
		setProgress({step: 'start', percent: 0, download: 0});
		setState('installing');
		installUpdate(entry, setProgress).then((r) => {
			setState('done');
			if (r.ok) notify({title: tt('updates.doneTitle', {version: entry.version}), text: tt('updates.doneText'), buttons: [{label: tt('app.ok'), tone: 'light', run: closeNotice}], onBack: closeNotice});
			else brew(tt('updates.failTitle'), tt('updates.failText'));
		});
	};

	const handleKey = (key: NavKey): boolean => {
		if (state === 'installing') return true;
		if (key === 'back') onClose();
		else if (key === 'up') setIndex(clamp(at - 1, 0, Math.max(0, list.length - 1)));
		else if (key === 'down') setIndex(clamp(at + 1, 0, Math.max(0, list.length - 1)));
		else if (key === 'enter') {
			if (state === 'checking') return true;
			if (!list.length) setRound((n) => n + 1);
			else askInstall(shown);
		}
		else if (debug && (key === 'left' || key === 'right')) { setPretend((n) => (n + (key === 'right' ? 1 : PRETEND.length - 1)) % PRETEND.length); setIndex(0); }
		return true;
	};
	useKeys(handleKey, !paused);

	const start = clamp(at - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, list.length - VISIBLE_ROWS));
	const visible = list.slice(start, start + VISIBLE_ROWS);
	const test = debug && pretend ? ` (test: pretending ${current})` : '';
	const direct = rootState() === 'yes';
	const hint = (list.length ? `${tt('updates.found', {count: list.length})} · ${tt(direct ? 'updates.hintInstall' : 'updates.hintBrew', {version: current})}` : tt('updates.hintOther', {version: current})) + test;

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('updates.title')}</h1>
				<p class="settings__hint">{hint}</p>
				{state === 'checking' && <div class="picker__status">{tt('updates.checking')}</div>}
				{state === 'installing' && (
					<div class="picker__status">
						<div>{tt('updates.installing', {version: target})}</div>
						<div class="upd__bar"><div class="upd__fill" style={{width: `${progress.percent}%`}} /></div>
						<div class="upd__step">{progress.step === 'download' ? tt('updates.stepDownload', {percent: progress.download}) : tt(progress.step === 'check' ? 'updates.stepCheck' : progress.step === 'install' ? 'updates.stepInstall' : progress.step === 'finish' ? 'updates.stepFinish' : 'updates.stepStart')} · {progress.percent}%</div>
					</div>
				)}
				{state === 'failed' && (
					<div class="picker__note">
						<div class="picker__note-title">{tt('updates.failed')}</div>
						<div class="picker__note-para"><div class="picker__note-line picker__note-line--error">{tt('updates.failedText')}</div></div>
					</div>
				)}
				{state === 'done' && !list.length && (
					<div class="picker__note">
						<div class="picker__note-title">{tt('updates.upToDate')}</div>
						<div class="picker__note-para"><div class="picker__note-line">{tt('updates.upToDateText', {version: current})}</div></div>
					</div>
				)}
				{shown && (
					<div class="upd">
						<div class="upd__list">
							{visible.map((entry, n) => {
								const i = start + n;
								return (
									<div key={entry.version} class={`picker__row${i === at ? ' picker__row--focused' : ''}`} onMouseEnter={() => setIndex(i)}>
										<div class="picker__text">
											<div class="picker__label">{entry.version}</div>
											<div class="picker__detail">{i === 0 ? tt('updates.rowNewest') : tt('updates.rowIncluded', {newest: list[0].version})}</div>
										</div>
									</div>
								);
							})}
						</div>
						<div class="upd__panel">
							<div class="upd__title">{tt('updates.whatsNew', {version: shown.version})}</div>
							<div class="upd__sub">{tt('updates.summaryNote')}{shown.date ? ` · ${shown.date}` : ''}</div>
							{shown.summary.length
								? shown.summary.map((line) => <div key={line} class="upd__line">{line}</div>)
								: <div class="upd__line">{tt('updates.noNotes')}</div>}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
