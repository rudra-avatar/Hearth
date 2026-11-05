import {useCallback, useEffect, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {log} from '../lib/log';
import {buttonLabel, listedButtons, sameAction, type RemapAction, type RemapConfig} from '../lib/remapcmd';
import {t as tt} from '../i18n';

/** Something a button can be given: an app, an input, Hearth, mute, nothing, or the TV's own action (null). */
export interface RemapTarget {
	key: string;
	label: string;
	detail?: string;
	action: RemapAction | null;
}

interface Props {
	remap: RemapConfig;
	/** the buttons are also set at every TV start (boot link exists) */
	kept: boolean;
	/** everything a button can do, in the order the list shows it (the TV's own action first) */
	targets: RemapTarget[];
	/** the button Hearth was told about after "Press a button" (seq changes with each press) */
	captured: {name: string; seq: number} | null;
	/** the master switch is being changed, or a change is being saved */
	busy: boolean;
	onSwitch: () => void;
	onKeep: () => void;
	onAssign: (name: string, action: RemapAction | null) => void;
	/** start or stop waiting for a button press */
	onCapture: (waiting: boolean) => Promise<boolean>;
	onClose: () => void;
}

interface Row {
	key: string;
	kind: 'switch' | 'keep' | 'capture' | 'button' | 'target' | 'info';
	label: string;
	detail?: string;
	name?: string;
	target?: RemapTarget;
	current?: boolean;
}

type Mode = 'list' | 'waiting' | 'choose';

const VISIBLE_ROWS = 8;
/** How long "Press a button" waits (the key filter gives up after a minute too). */
const WAIT_MS = 55000;

/** What a button does now, in words. */
export function actionText (action: RemapAction | undefined, targets: RemapTarget[]): string {
	if (!action) return tt('app.theTvSOwn');
	const target = targets.filter((t) => sameAction(t.action, action))[0];
	if (action.t === 'app') return target && target.detail === 'Input' ? tt('remotebuttons.switchesToLabel', {label: target.label}) : tt('remotebuttons.opensV1', {v1: target ? target.label : action.id});
	return target ? target.label : action.t;
}

/** Settings → Options → "Reassign remote buttons". The list of buttons and what each does; OK on one chooses a new
 *  job for it. "Press a button" lets the remote itself say which button is meant. */
export function RemoteButtons ({remap, kept, targets, captured, busy, onSwitch, onKeep, onAssign, onCapture, onClose}: Props) {
	const [mode, setMode] = useState<Mode>('list');
	const [index, setIndex] = useState(0);
	const [listIndex, setListIndex] = useState(0);
	const [chosen, setChosen] = useState<string | null>(null);
	const [listening, setListening] = useState(false);     // the TV's filter has said it is listening (issue #36)

	const choose = (name: string) => {
		setChosen(name);
		setListIndex(index);
		const current = remap.keys[name];
		const at = targets.findIndex((t) => sameAction(t.action, current || null));
		setIndex(Math.max(0, at));
		setMode('choose');
	};

	// a button was pressed while waiting: choose its new job straight away
	useEffect(() => {
		if (!captured || mode !== 'waiting') return;
		onCapture(false);
		choose(captured.name);
	}, [captured ? captured.seq : 0]);              // eslint-disable-line react-hooks/exhaustive-deps

	// stop waiting after a while, and whenever this screen goes away
	useEffect(() => {
		if (mode !== 'waiting') return undefined;
		const timer = window.setTimeout(() => { onCapture(false); setMode('list'); }, WAIT_MS);
		return () => window.clearTimeout(timer);
	}, [mode]);                                      // eslint-disable-line react-hooks/exhaustive-deps

	// P61b: while waiting, the page itself also listens: the four colour keys reach the page on most remotes (403-406), so they
	// are named here even if the TV's key filter says nothing; any key the page sees is noted in the debug report
	useEffect(() => {
		if (mode !== 'waiting') return undefined;
		const COLOURS: Record<number, string> = {403: tt('remotebuttons.keyWebosRed'), 404: tt('remotebuttons.keyWebosGreen'), 405: tt('remotebuttons.keyWebosYellow'), 406: tt('remotebuttons.keyWebosBlue')};
		const onKey = (e: KeyboardEvent) => {
			if (!listening) return;
			log(`remap: page saw key ${e.keyCode}`);
			const name = COLOURS[e.keyCode];
			if (name) { onCapture(false); choose(name); }
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [mode, listening]);                           // eslint-disable-line react-hooks/exhaustive-deps

	const rows: Row[] = [];
	if (mode === 'list') {
		rows.push({key: 'switch', kind: 'switch', label: tt('remotebuttons.reassigned', {state: remap.on ? tt('common.on') : tt('common.off')}),
			detail: busy ? tt('remotebuttons.oneMoment') : remap.on ? tt('remotebuttons.theButtonsBelowDo') : tt('remotebuttons.everyButtonDoesWhat')});
		rows.push({key: 'keep', kind: 'keep', label: tt('remotebuttons.keepState', {state: kept ? tt('common.on') : tt('common.off')}), detail: !remap.on ? tt('remotebuttons.turnReassignedButtonsOn') : kept ? tt('remotebuttons.theButtonsWorkAgain') : tt('remotebuttons.aRestartOfThe')});
		rows.push({key: 'capture', kind: 'capture', label: tt('remotebuttons.pressAButtonTo'), detail: tt('remotebuttons.theSurestWayRemotes')});
		listedButtons(remap).forEach((name) => rows.push({key: name, kind: 'button', name, label: buttonLabel(name), detail: actionText(remap.keys[name], targets)}));
	} else if (mode === 'waiting') {
		rows.push({key: 'wait', kind: 'info', label: tt('remotebuttons.pressTheButtonOn'), detail: tt('remotebuttons.hearthIsListeningFor')});
	} else {
		const current = chosen ? remap.keys[chosen] : undefined;
		targets.forEach((t) => rows.push({key: t.key, kind: 'target', label: t.label, detail: t.detail, target: t, current: sameAction(t.action, current || null)}));
	}

	const activate = (i: number) => {
		const row = rows[i];
		if (!row || busy) return;
		if (row.kind === 'switch') onSwitch();
		else if (row.kind === 'keep') onKeep();
		else if (row.kind === 'capture') { setListIndex(i); setMode('waiting'); setIndex(0); setListening(false); onCapture(true).then((ok) => { if (ok) setListening(true); else { setMode('list'); setIndex(i); } }); }
		else if (row.kind === 'button' && row.name) choose(row.name);
		else if (row.kind === 'target' && row.target && chosen) {
			onAssign(chosen, row.target.action);
			setMode('list');
			setIndex(listIndex);
		}
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, Math.max(0, rows.length - 1))); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, Math.max(0, rows.length - 1))); break;
			// the list of apps can be long: ← → jump a page
			case 'left': setIndex((i) => clamp(i - VISIBLE_ROWS, 0, Math.max(0, rows.length - 1))); break;
			case 'right': setIndex((i) => clamp(i + VISIBLE_ROWS, 0, Math.max(0, rows.length - 1))); break;
			case 'enter': activate(index); break;
			case 'back':
				if (mode === 'waiting') { onCapture(false); setMode('list'); setIndex(listIndex); }
				else if (mode === 'choose') { setMode('list'); setIndex(listIndex); }
				else onClose();
				break;
			default: break;
		}
		return true;
	}, [rows.length, index, mode, listIndex, chosen, busy, remap, targets]);   // eslint-disable-line react-hooks/exhaustive-deps

	useKeys(handleKey, true);

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);
	const title = mode === 'choose' && chosen ? tt('remotebuttons.v1Button', {v1: buttonLabel(chosen)}) : tt('remotebuttons.reassignRemoteButtons');
	const hint = mode === 'choose' ? tt('remotebuttons.okGivesTheButtonThis')
		: mode === 'waiting' ? tt('remotebuttons.pressTheButtonYouWant')
		: tt('remotebuttons.okChoosesWhatAButton');
	const path = mode === 'choose' ? tt('remotebuttons.chooseWhatItDoes') : mode === 'waiting' ? tt('remotebuttons.waitingForAButton') : tt('remotebuttons.buttons');

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{title}</h1>
				<p class="settings__hint">{hint}</p>
				<div class="picker__path">{path}</div>
				<div class="picker">
					{visible.map((row, n) => {
						const i = start + n;
						const dim = busy && row.kind !== 'info';
						return (
							<div
								key={row.key}
								class={`picker__row${i === index ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}${dim ? ' picker__row--disabled' : ''}`}
								onMouseEnter={() => setIndex(i)}
								onClick={() => { setIndex(i); activate(i); }}
							>
								<PickerIcon kind={row.kind === 'switch' ? 'power' : row.kind === 'keep' ? 'pin' : row.kind === 'capture' || row.kind === 'info' ? 'search' : row.kind === 'button' ? 'remote' : row.current ? 'pin' : 'app'} />
								<div class="picker__text">
									<div class="picker__label">{row.label}{row.current ? ' (now)' : ''}</div>
									{row.detail && <div class="picker__detail">{row.detail}</div>}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
