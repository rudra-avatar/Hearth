import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {RemoteArt} from '../components/RemoteArt';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {buttonLabel, canonicalButton, listedButtons, sameAction, type RemapAction, type RemapConfig} from '../lib/remapcmd';
import {boundByInputHook, buttonForKey, nextButton, reassignable, remoteLayout, REMOTES, type RemoteModel} from '../lib/remotes';

/** Something a button can be given: an app, an input, Hearth, mute, nothing, or the TV's own action (null). */
export interface RemapTarget {
	key: string;
	label: string;
	detail?: string;
	action: RemapAction | null;
}

/** Which remote the screen draws: one of the drawings, the plain list, or not chosen yet (''). */
export type RemoteChoice = RemoteModel | 'list' | '';

interface Props {
	remap: RemapConfig;
	/** everything a button can do, in the order the list shows it (the TV's own action first) */
	targets: RemapTarget[];
	/** the button Hearth was told about after a press (seq changes with each press) */
	captured: {name: string; seq: number} | null;
	/** the master switch is being changed, or a change is being saved */
	busy: boolean;
	/** the remote the user chose */
	model: RemoteChoice;
	/** the remote the TV's log names (offered first when choosing) */
	detected: RemoteModel | null;
	/** Linux key codes LG Input Hook has bindings for (it acts on those buttons too) */
	inputHook: number[];
	onModel: (model: RemoteModel | 'list') => void;
	onSwitch: () => void;
	onAssign: (name: string, action: RemapAction | null) => void;
	/** start or stop waiting for a button press */
	onCapture: (waiting: boolean) => void;
	onClose: () => void;
}

interface Row {
	key: string;
	kind: 'switch' | 'capture' | 'button' | 'target' | 'info' | 'model' | 'picture' | 'showlist';
	label: string;
	detail?: string;
	name?: string;
	target?: RemapTarget;
	model?: RemoteModel | 'list';
	current?: boolean;
}

type Mode = 'model' | 'remote' | 'list' | 'waiting' | 'choose';

const VISIBLE_ROWS = 8;
/** How long "Press a button" waits in the list (the key filter gives up after a minute too). */
const WAIT_MS = 55000;
/** The picture listens all the time: the filter is asked again before its minute runs out. */
const LISTEN_RENEW_MS = 50000;
/** A press on the real remote: the button flashes on the drawing, then its choices open. */
const PULSE_MS = 450;
const HOOK_NOTE = 'LG Input Hook also acts on this button';

/** What a button does now, in words. */
export function actionText (action: RemapAction | undefined, targets: RemapTarget[]): string {
	if (!action) return "The TV's own action";
	const target = targets.filter((t) => sameAction(t.action, action))[0];
	if (action.t === 'app') return target && target.detail === 'Input' ? `Switches to ${target.label}` : `Opens ${target ? target.label : action.id}`;
	return target ? target.label : action.t;
}

/** The short form beside the drawing: just the app, the input, or the job. */
export function shortJob (action: RemapAction | undefined, targets: RemapTarget[]): string {
	if (!action) return '';
	const target = targets.filter((t) => sameAction(t.action, action))[0];
	return target ? target.label : action.t === 'app' ? action.id : action.t;
}

/** Is `name` a button Input Hook has a binding for (on any of the drawn remotes)? */
function hookedName (name: string, codes: number[]): boolean {
	if (!codes.length) return false;
	return REMOTES.some((r) => r.buttons.some((b) => b.key === canonicalButton(name) && b.linux !== undefined && codes.indexOf(b.linux) !== -1));
}

/** Settings → Options → "Reassign remote buttons". First "Which remote do you have?"; then a drawing of it, where
 *  pressing a button on the real remote picks it (or the arrows move between the buttons that can be changed), and its
 *  choices open. "Other / not listed" shows the plain list of buttons, with "Press a button to reassign it". */
export function RemoteButtons ({remap, targets, captured, busy, model, detected, inputHook, onModel, onSwitch, onAssign, onCapture, onClose}: Props) {
	const [mode, setMode] = useState<Mode>(model === '' ? 'model' : model === 'list' ? 'list' : 'remote');
	const [base, setBase] = useState<'remote' | 'list'>(model === 'list' ? 'list' : 'remote');
	const [index, setIndex] = useState(() => (model === '' && detected ? Math.max(0, REMOTES.findIndex((r) => r.model === detected)) : 0));
	const [listIndex, setListIndex] = useState(0);
	const [chosen, setChosen] = useState<string | null>(null);
	const layout = remoteLayout(model === '' || model === 'list' ? (detected || 'magic-2019') : model);
	const [artId, setArtId] = useState<string>(() => { const first = reassignable(layout)[0]; return first ? first.id : ''; });
	const [zone, setZone] = useState<'art' | 'side'>('art');
	const [pulse, setPulse] = useState<{id: string; seq: number} | null>(null);
	const pulseTimer = useRef(0);

	const choose = (name: string, from: 'remote' | 'list') => {
		name = canonicalButton(name);
		setChosen(name);
		setBase(from);
		setListIndex(index);
		const current = remap.keys[name];
		const at = targets.findIndex((t) => sameAction(t.action, current || null));
		setIndex(Math.max(0, at));
		setMode('choose');
	};
	const back = () => { setMode(base); setIndex(listIndex); };

	// a button pressed on the real remote: in the picture it flashes, then its choices open; in the list, straight away
	useEffect(() => {
		if (!captured) return;
		if (mode === 'waiting') { onCapture(false); choose(captured.name, 'list'); return; }
		if (mode !== 'remote') return;
		const b = buttonForKey(layout, canonicalButton(captured.name));
		if (!b) { choose(captured.name, 'remote'); return; }
		setArtId(b.id);
		setZone('art');
		setPulse({id: b.id, seq: captured.seq});
		window.clearTimeout(pulseTimer.current);
		pulseTimer.current = window.setTimeout(() => choose(captured.name, 'remote'), PULSE_MS);
	}, [captured ? captured.seq : 0]);              // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => () => window.clearTimeout(pulseTimer.current), []);

	// the TV's log named a remote after the screen opened: start the choice on it
	useEffect(() => {
		if (mode === 'model' && model === '' && detected) setIndex(Math.max(0, REMOTES.findIndex((r) => r.model === detected)));
	}, [detected]);                                  // eslint-disable-line react-hooks/exhaustive-deps

	// the list's "Press a button": stop waiting after a while
	useEffect(() => {
		if (mode !== 'waiting') return undefined;
		const timer = window.setTimeout(() => { onCapture(false); setMode('list'); }, WAIT_MS);
		return () => window.clearTimeout(timer);
	}, [mode]);                                      // eslint-disable-line react-hooks/exhaustive-deps

	// the picture listens for presses the whole time it is shown (only when the buttons are switched on: the filter
	// that hears them is only on the TV then)
	useEffect(() => {
		if (mode !== 'remote' || !remap.on) return undefined;
		onCapture(true);
		const timer = window.setInterval(() => onCapture(true), LISTEN_RENEW_MS);
		return () => { window.clearInterval(timer); onCapture(false); };
	}, [mode, remap.on]);                            // eslint-disable-line react-hooks/exhaustive-deps

	const switchRow: Row = {key: 'switch', kind: 'switch', label: `Reassigned buttons: ${remap.on ? 'On' : 'Off'}`,
		detail: busy ? 'One moment…' : remap.on ? 'OK turns it off: every button does what the TV does again' : 'Every button does what the TV does. OK turns your choices on'};
	const rows: Row[] = [];
	if (mode === 'model') {
		REMOTES.forEach((r) => rows.push({key: r.model, kind: 'model', model: r.model, label: r.name, detail: r.model === detected ? 'The one this TV heard last' : undefined, current: r.model === model}));
		rows.push({key: 'list', kind: 'model', model: 'list', label: 'Other, or not listed', detail: 'A list of the buttons instead of a picture', current: model === 'list'});
	} else if (mode === 'remote') {
		rows.push(switchRow);
		rows.push({key: 'change', kind: 'picture', label: 'Change the remote', detail: layout.name});
		rows.push({key: 'showlist', kind: 'showlist', label: 'Show as a list'});
	} else if (mode === 'list') {
		rows.push(switchRow);
		rows.push({key: 'capture', kind: 'capture', label: 'Press a button to reassign it…', detail: 'The surest way: remotes from different years can send different codes for the same button. Not the arrows, OK, Back, Home, power, volume, channels or numbers'});
		listedButtons(remap).forEach((name) => rows.push({key: name, kind: 'button', name, label: buttonLabel(name),
			detail: actionText(remap.keys[name], targets) + (hookedName(name, inputHook) ? ' · ' + HOOK_NOTE : '')}));
		rows.push({key: 'picture', kind: 'picture', label: 'Show a picture of my remote…', detail: 'Choose your remote, then press a button on it'});
	} else if (mode === 'waiting') {
		rows.push({key: 'wait', kind: 'info', label: 'Press the button on the remote now', detail: 'Hearth is listening for one press, for up to a minute · Back cancels'});
	} else {
		const current = chosen ? remap.keys[chosen] : undefined;
		targets.forEach((t) => rows.push({key: t.key, kind: 'target', label: t.label, detail: t.detail, target: t, current: sameAction(t.action, current || null)}));
	}

	const activate = (i: number) => {
		const row = rows[i];
		if (!row || (busy && row.kind !== 'model' && row.kind !== 'picture' && row.kind !== 'showlist')) return;
		if (row.kind === 'switch') onSwitch();
		else if (row.kind === 'capture') { setListIndex(i); setMode('waiting'); setIndex(0); onCapture(true); }
		else if (row.kind === 'button' && row.name) choose(row.name, 'list');
		else if (row.kind === 'picture') { setMode('model'); setIndex(Math.max(0, REMOTES.findIndex((r) => r.model === (model || detected)))); }
		else if (row.kind === 'showlist') { onModel('list'); setMode('list'); setIndex(0); }
		else if (row.kind === 'model' && row.model) {
			onModel(row.model);
			if (row.model === 'list') { setMode('list'); setIndex(0); return; }
			const first = reassignable(remoteLayout(row.model))[0];
			setArtId(first ? first.id : '');
			setZone('art');
			setMode('remote');
			setIndex(0);
		}
		else if (row.kind === 'target' && row.target && chosen) {
			onAssign(chosen, row.target.action);
			back();
		}
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		if (mode === 'remote' && zone === 'art') {
			const from = layout.buttons.filter((b) => b.id === artId)[0];
			if (key === 'enter') { if (from && from.key) choose(from.key, 'remote'); return true; }
			if (key === 'back') { onClose(); return true; }
			const next = from ? nextButton(layout, from, key) : reassignable(layout)[0] || null;
			if (next) setArtId(next.id);
			else if (key === 'right') { setZone('side'); setIndex(0); }
			return true;
		}
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, Math.max(0, rows.length - 1))); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, Math.max(0, rows.length - 1))); break;
			case 'left':
				if (mode === 'remote') setZone('art');
				else setIndex((i) => clamp(i - VISIBLE_ROWS, 0, Math.max(0, rows.length - 1)));       // long lists: ← → jump a page
				break;
			case 'right': if (mode !== 'remote') setIndex((i) => clamp(i + VISIBLE_ROWS, 0, Math.max(0, rows.length - 1))); break;
			case 'enter': activate(index); break;
			case 'back':
				if (mode === 'waiting') { onCapture(false); setMode('list'); setIndex(listIndex); }
				else if (mode === 'choose') back();
				else if (mode === 'model' && model !== '') { setMode(model === 'list' ? 'list' : 'remote'); setIndex(0); }
				else onClose();
				break;
			default: break;
		}
		return true;
	}, [rows.length, index, mode, zone, artId, listIndex, chosen, busy, remap, targets, layout, model, base]);   // eslint-disable-line react-hooks/exhaustive-deps

	useKeys(handleKey, true);

	const renderRows = (list: Row[], first: number, focused: boolean) => list.map((row, n) => {
		const i = first + n;
		const dim = busy && (row.kind === 'switch' || row.kind === 'target' || row.kind === 'button' || row.kind === 'capture');
		return (
			<div
				key={row.key}
				class={`picker__row${focused && i === index ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}${dim ? ' picker__row--disabled' : ''}`}
				onMouseEnter={() => { setIndex(i); if (mode === 'remote') setZone('side'); }}
				onClick={() => { setIndex(i); activate(i); }}
			>
				<PickerIcon kind={row.kind === 'switch' ? 'power' : row.kind === 'capture' || row.kind === 'info' ? 'search' : row.kind === 'button' || row.kind === 'model' || row.kind === 'picture' ? 'remote' : row.kind === 'showlist' ? 'folder' : row.current ? 'pin' : 'app'} />
				<div class="picker__text">
					<div class="picker__label">{row.label}{row.current ? ' (now)' : ''}</div>
					{row.detail && <div class="picker__detail">{row.detail}</div>}
				</div>
			</div>
		);
	});

	const title = mode === 'choose' && chosen ? `${buttonLabel(chosen)} button` : mode === 'model' ? 'Which remote do you have?' : 'Reassign remote buttons';
	const hint = mode === 'choose' ? 'OK gives the button this job · ← → jump a page · Back keeps it as it is'
		: mode === 'waiting' ? 'Press the button you want to reassign · Back cancels'
		: mode === 'model' ? 'OK chooses it · its buttons are drawn, and you can press them'
		: mode === 'remote' ? (remap.on ? 'Press a highlighted button on your remote, or move to it and press OK · Back returns to settings' : 'Move to a highlighted button and press OK · Back returns to settings')
		: 'OK chooses what a button does · Back returns to settings';

	if (mode === 'remote') {
		const jobs: Record<string, string> = {};
		layout.buttons.forEach((b) => { if (b.key && remap.keys[b.key]) jobs[b.id] = shortJob(remap.keys[b.key], targets); });
		const hooked = boundByInputHook(layout, inputHook);
		const focused = layout.buttons.filter((b) => b.id === artId)[0];
		return (
			<div class="screen screen--picker">
				<div class="settings">
					<h1 class="settings__title">{title}</h1>
					<p class="settings__hint">{hint}</p>
					<div class="remote-view">
						<RemoteArt
							layout={layout}
							focusedId={zone === 'art' ? artId : null}
							pulse={pulse}
							jobs={jobs}
							hooked={hooked}
							onSelect={(id) => { setZone('art'); setArtId(id); }}
							onActivate={(id) => { const b = layout.buttons.filter((x) => x.id === id)[0]; if (b && b.key) choose(b.key, 'remote'); }}
						/>
						<div class="remote-side">
							<div class="remote-card">
								<div class="remote-card__title">{focused ? focused.label : layout.name}</div>
								<div class="remote-card__job">{focused && focused.key ? actionText(remap.keys[focused.key], targets) : ''}</div>
								{focused && hooked.indexOf(focused.id) !== -1 && <div class="remote-card__note">{HOOK_NOTE}, and before Hearth: its binding decides first. To use Hearth's, remove it in Input Hook.</div>}
								<div class="remote-card__note">{remap.on ? 'Listening: press a highlighted button on your remote.' : 'Turn the reassigned buttons on below to pick a button by pressing it.'}</div>
							</div>
							{renderRows(rows, 0, zone === 'side')}
						</div>
					</div>
				</div>
			</div>
		);
	}

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const path = mode === 'choose' ? 'Choose what it does' : mode === 'waiting' ? 'Waiting for a button' : mode === 'model' ? 'Remotes' : 'Buttons';
	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{title}</h1>
				<p class="settings__hint">{hint}</p>
				<div class="picker__path">{path}</div>
				<div class="picker">{renderRows(rows.slice(start, start + VISIBLE_ROWS), start, true)}</div>
			</div>
		</div>
	);
}
