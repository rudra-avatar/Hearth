import {useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {readBinds} from '../lib/homekey';
import {isHomeCode, isProtected, keyLabel, type DetectedKey, type Keybind, type Keybinds} from '../lib/homekeycore';
import {clearExtraKey, mappedExtras, setExtraKey, whyNot} from '../lib/extrakeys';
import {beginListening, endListening, listening, pressedKeys} from '../lib/keydetect';
import {isWebOS} from '../lib/luna';
import {RemoteDrawing} from '../components/RemoteDrawing';
import {REMOTE_NAMES, nextModel, remoteLayout, type RemoteModel} from '../lib/remotedraw';
import {isLgHomeCommand} from '../lib/lghomecmd';
import {sameAction, type RemapAction} from '../lib/remapcmd';
import type {RemapTarget} from './RemoteButtons';
import {t as tt} from '../i18n';

// P61g: Settings -> System -> Remote control -> "Map additional keys". Built on the key hook (Input Hook engine). Find a button by
// pressing it (raw key devices and Input Hook's log, P61f) or pick a known one, then choose what it does. The row "Use the other
// method" (PR #19's key filter) is always there, so there is no automatic fallback: the user chooses.

interface Props {
	/** everything a button can do: the TV's own action first, then nothing, Hearth, mute, inputs, apps */
	targets: RemapTarget[];
	/** P61c: the remote drawn beside the list, and how to change it */
	model: RemoteModel;
	onModel: (m: RemoteModel) => void;
	onOtherMethod: () => void;
	/** a pop-up is open on top: this screen does not read keys meanwhile */
	paused?: boolean;
	/** called before the LG Home job is saved: runs `go` at once, or after the user agreed (a Home replacement is on) */
	onLgHomeCheck: (go: () => void) => void;
	onClose: () => void;
	onToast: (text: string, kind?: 'info' | 'error') => void;
}

type Mode = 'list' | 'find' | 'choose';
type Kind = 'model' | 'add' | 'mapped' | 'found' | 'known' | 'info' | 'again' | 'other' | 'target';

interface Row {
	key: string;
	kind: Kind;
	label: string;
	detail?: string;
	code?: number;
	target?: RemapTarget;
	current?: boolean;
}

const VISIBLE_ROWS = 8;
const POLL_MS = 2000;
/** Buttons offered without detecting (LG's partner and colour buttons). */
const KNOWN: number[] = [1037, 1038, 1042, 398, 399, 400, 401];

function bindAction (bind: Keybind | undefined): RemapAction | null {
	if (!bind) return null;
	if (bind.action === 'launch') return {t: 'app', id: bind.id};
	if (bind.action === 'replace' && bind.keycode === 113) return {t: 'mute'};
	if (bind.action === 'ignore') return {t: 'none'};
	if (bind.action === 'exec' && isLgHomeCommand(bind.command)) return {t: 'lghome'};
	return null;
}

export function ExtraKeys ({targets, model, onModel, onOtherMethod, paused, onLgHomeCheck, onClose, onToast}: Props) {
	const [mode, setMode] = useState<Mode>('list');
	const [index, setIndex] = useState(0);
	const [listIndex, setListIndex] = useState(0);
	const [binds, setBinds] = useState<Keybinds | null>(null);
	const [why, setWhy] = useState('');
	const [found, setFound] = useState<DetectedKey[]>([]);
	const [since, setSince] = useState(0);
	const [chosen, setChosen] = useState(0);
	const [from, setFrom] = useState<Mode>('list');
	const [busy, setBusy] = useState('');
	const alive = useRef(true);
	const polling = useRef(false);
	const onTv = isWebOS();

	const refresh = () => readBinds().then((r) => { if (!alive.current) return; if (r.ok) { setBinds(r.binds); setWhy(''); } else { setBinds(null); setWhy(r.why); } }, () => undefined);
	useEffect(() => { refresh(); return () => { alive.current = false; }; }, []);      // eslint-disable-line react-hooks/exhaustive-deps

	// while finding a button: read what was pressed, every 2 s (only on this screen, only in this mode)
	useEffect(() => {
		if (mode !== 'find' || !since) return undefined;
		const tick = () => {
			if (polling.current) return;
			polling.current = true;
			pressedKeys().then((k) => { polling.current = false; if (alive.current) setFound(k); }, () => { polling.current = false; });
		};
		tick();
		const timer = window.setInterval(tick, POLL_MS);
		return () => window.clearInterval(timer);
	}, [mode, since]);

	const targetsHere = targets.filter((t) => !(t.action && t.action.t === 'app' && t.detail === 'This home screen'));
	const labelOf = (action: RemapAction | null): string => {
		if (!action) return tt('app.theTvSOwn');
		const t = targets.filter((x) => sameAction(x.action, action))[0];
		return action.t === 'app' ? tt('extrakeys.opensV1', {v1: t ? t.label : action.id}) : t ? t.label : action.t;
	};

	const startFind = (forget: boolean) => {
		setMode('find'); setIndex(0); setFound([]);
		beginListening(forget).then((at) => { if (alive.current) setSince(at); });
	};

	const choose = (code: number) => {
		const problem = whyNot(code);
		if (problem) { onToast(problem, 'error'); return; }
		setListIndex(index);
		setFrom(mode);
		setChosen(code);
		const current = binds ? bindAction(binds[String(code)]) : null;
		const at = targetsHere.findIndex((t) => sameAction(t.action, current));
		setIndex(Math.max(0, at));
		setMode('choose');
	};

	const assign = (action: RemapAction | null) => {
		if (action && action.t === 'lghome') { onLgHomeCheck(() => save(action)); return; }
		save(action);
	};

	const save = (action: RemapAction | null) => {
		setBusy(action ? tt('extrakeys.saving') : tt('extrakeys.givingTheButtonBack'));
		(action ? setExtraKey(chosen, action) : clearExtraKey(chosen)).then((r) => {
			if (!alive.current) return;
			setBusy('');
			onToast(r.text, r.ok ? 'info' : 'error');
			if (r.ok) { endListening(); setSince(0); setFound([]); setMode('list'); setIndex(0); refresh(); }
		});
	};

	const rows: Row[] = [];
	if (mode === 'list') {
		rows.push({key: 'add', kind: 'add', label: tt('extrakeys.addAButton'), detail: tt('extrakeys.pressItOnThe')});
		rows.push({key: 'model', kind: 'model', label: tt('extrakeys.remote', {v: REMOTE_NAMES[model]}), detail: tt('extrakeys.okChangesTheDrawing')});
		(binds ? mappedExtras(binds) : []).forEach((m) => rows.push({key: `m${m.code}`, kind: 'mapped', code: m.code, label: tt('extrakeys.button', {keyLabel: keyLabel(m.code)}), detail: labelOf(bindAction(m.bind))}));
		rows.push({key: 'other', kind: 'other', label: tt('extrakeys.useTheOtherMethod'), detail: tt('extrakeys.theTvSKey')});
	} else if (mode === 'find') {
		const open = listening(since);
		const shown = found.filter((f) => !isProtected(f.code) && !isHomeCode(f.code)).reverse();
		if (!shown.length) rows.push({key: 'wait', kind: 'info', label: open ? tt('extrakeys.pressTheButtonOn') : tt('extrakeys.nothingWasPressed'), detail: open ? tt('extrakeys.hearthListensForUp') : tt('extrakeys.okOnListenAgain')});
		shown.forEach((f) => rows.push({key: `f${f.code}`, kind: 'found', code: f.code, label: tt('extrakeys.detectedButton', {keyLabel: keyLabel(f.code)}), detail: tt('extrakeys.seenOkToChoose', {count: f.count})}));
		KNOWN.filter((c) => !shown.some((f) => f.code === c)).forEach((c) => rows.push({key: `k${c}`, kind: 'known', code: c, label: tt('extrakeys.knownButton', {keyLabel: keyLabel(c)}), detail: tt('extrakeys.okToChooseWhat')}));
		rows.push({key: 'again', kind: 'again', label: tt('extrakeys.listenAgain'), detail: tt('extrakeys.forgetsWhatWasDetected')});
		rows.push({key: 'model', kind: 'model', label: tt('extrakeys.remote2', {v: REMOTE_NAMES[model]}), detail: tt('extrakeys.okChangesTheDrawing2')});
		rows.push({key: 'other', kind: 'other', label: tt('extrakeys.useTheOtherMethod2'), detail: tt('extrakeys.buttonsNotDetectedHere')});
	} else {
		const current = binds ? bindAction(binds[String(chosen)]) : null;
		const mapped = !!(binds && binds[String(chosen)]);
		targetsHere.forEach((t) => {
			if (!t.action && !mapped) return;
			rows.push({key: t.key, kind: 'target', target: t, label: t.action ? t.label : tt('extrakeys.backToTheTv'), detail: t.action ? t.detail : tt('extrakeys.removesTheJobHearth'), current: !!t.action && sameAction(t.action, current)});
		});
	}

	const at = clamp(index, 0, Math.max(0, rows.length - 1));
	const activate = (i: number) => {
		const row = rows[i];
		if (!row || busy) return;
		if (row.kind === 'model') onModel(nextModel(model, 1));
		else if (row.kind === 'add') { setListIndex(i); startFind(false); }
		else if (row.kind === 'again') startFind(true);
		else if (row.kind === 'other') { endListening(); onOtherMethod(); }
		else if (row.kind === 'mapped' || row.kind === 'found' || row.kind === 'known') { if (row.code !== undefined) choose(row.code); }
		else if (row.kind === 'target' && row.target) assign(row.target.action);
	};

	const handleKey = (key: NavKey): boolean => {
		if (busy) return true;
		if (key === 'up') setIndex(clamp(at - 1, 0, Math.max(0, rows.length - 1)));
		else if (key === 'down') setIndex(clamp(at + 1, 0, Math.max(0, rows.length - 1)));
		else if (key === 'left') setIndex(clamp(at - VISIBLE_ROWS, 0, Math.max(0, rows.length - 1)));
		else if (key === 'right') setIndex(clamp(at + VISIBLE_ROWS, 0, Math.max(0, rows.length - 1)));
		else if (key === 'enter') activate(at);
		else if (key === 'back') {
			if (mode === 'choose') { setMode(from); setIndex(from === 'list' ? listIndex : 0); }
			else if (mode === 'find') { endListening(); setSince(0); setMode('list'); setIndex(listIndex); }
			else onClose();
		}
		return true;
	};
	useKeys(handleKey, !paused);

	const start = clamp(at - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);
	const title = mode === 'choose' ? tt('extrakeys.buttonV1', {v1: keyLabel(chosen)}) : tt('pref.remap.label');
	const hint = mode === 'choose' ? tt('extrakeys.okGivesTheButtonThis')
		: mode === 'find' ? tt('extrakeys.moveOkChoosesBackReturns')
		: tt('extrakeys.moveOkChoosesBackReturns2');
	const note = !onTv ? tt('extrakeys.thisOnlyWorksOnA') : busy ? busy : why ? why
		: mode === 'list' ? tt('extrakeys.buttonsHearthSetUpUse') : '';

	const focusCode = mode === 'choose' ? chosen : (rows[at] && rows[at].code) || 0;
	const mappedCodes = binds ? mappedExtras(binds).map((x) => x.code) : [];

	return (
		<div class="screen screen--picker">
			<RemoteDrawing layout={remoteLayout(model)} focusCode={focusCode} mappedCodes={mappedCodes} />
			<div class="settings">
				<h1 class="settings__title">{title}</h1>
				<p class="settings__hint">{hint}</p>
				{note && <div class="picker__path">{note}</div>}
				<div class="picker">
					{visible.map((row, n) => {
						const i = start + n;
						return (
							<div
								key={row.key}
								class={`picker__row${i === at ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}${busy ? ' picker__row--disabled' : ''}`}
								onMouseEnter={() => setIndex(i)}
								onClick={() => { setIndex(i); activate(i); }}
							>
								<PickerIcon kind={row.kind === 'model' ? 'remote' : row.kind === 'add' || row.kind === 'again' ? 'slideshow' : row.kind === 'mapped' ? 'remote' : row.kind === 'found' || row.kind === 'info' ? 'search' : row.kind === 'known' ? 'pin' : row.kind === 'other' ? 'default' : row.current ? 'pin' : 'app'} />
								<div class="picker__text">
									<div class="picker__label">{row.label}{row.current ? ' (now)' : ''}</div>
									{row.detail && <div class="picker__detail">{row.detail}</div>}
								</div>
							</div>
						);
					})}
				</div>
				<div class="picker__credit">{tt('extrakeys.buttonDetectionAndMapping')}</div>
			</div>
		</div>
	);
}
