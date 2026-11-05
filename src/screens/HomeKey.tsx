import {useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {failureText} from '../lib/failure';
import {
	clearHomeKey, readBinds, readStatus, setHomeKey, HOOK_CONFIG,
	type HookStatus, type Outcome
} from '../lib/homekey';
import {
	DETECT_KEEP_MS, HOME_CODES, autoPick, describeBind, hearthCodes, isGuardBind, isHearthBind, isHomeCode, stripGuard, isProtected, keyLabel, rankDetected, type AutoResult,
	type DetectedKey, type Keybinds
} from '../lib/homekeycore';
import {beginListening, endListening, listening, pressedKeys, resumeListening} from '../lib/keydetect';
import {log} from '../lib/log';
import {startEngine, type EngineOutcome} from '../lib/homeengine';
import {isWebOS} from '../lib/luna';
import {RemoteDrawing} from '../components/RemoteDrawing';
import {REMOTE_NAMES, nextModel, remoteLayout, type RemoteModel} from '../lib/remotedraw';
import {t as tt} from '../i18n';

// "Home button opens Hearth" (test build). Hearth starts its own key engine when this screen opens (no other app needed).
// The screen finds which button number the remote's Home button sends by reading the engine's log while the user presses
// it, offers what it saw (and, as a fallback when the Home button is not seen, LG's three known Home codes, 773 first),
// asks once, and then writes Hearth's entry into the keybinds file.

interface Props {
	onClose: () => void;
	/** P61c: the remote drawn beside the list, and how to change it */
	model: RemoteModel;
	onModel: (m: RemoteModel) => void;
	/** the button that now opens Hearth (null: none), so the Options row can show it */
	onChanged: (code: number | null) => void;
	onToast: (text: string, kind?: 'info' | 'error') => void;
	/** K1/U3: a mapping ended, automatic or chosen (also when this screen was left meanwhile): the app shows the pop-up and the row */
	onAuto: (result: AutoResult) => void;
	/** U3: a pop-up is in front: this screen takes no keys meanwhile */
	paused?: boolean;
}

type IconKind = 'folder' | 'picture' | 'drive' | 'slideshow' | 'default' | 'info' | 'search' | 'pin';

interface Row {
	key: string;
	label: string;
	detail: string;
	icon: IconKind;
	run: () => void;
	/** the key code the row is about (drawn highlighted) */
	code?: number;
}

const VISIBLE_ROWS = 5;
const POLL_MS = 2000;

export function HomeKey ({onClose: closeScreen, model, onModel, onChanged, onToast, onAuto, paused}: Props) {
	const [status, setStatus] = useState<HookStatus | null>(null);
	const [problem, setProblem] = useState('');
	const [binds, setBinds] = useState<Keybinds | null>(null);
	const [bindsWhy, setBindsWhy] = useState('');
	const [found, setFound] = useState<DetectedKey[]>([]);
	const [since, setSince] = useState(0);
	const [pending, setPending] = useState<number | null>(null);
	const [engine, setEngine] = useState<EngineOutcome | null>(null);
	// gate: 'check' = reading the state; 'ask' = button settings or a running hook already exist, the user must say yes first; 'go'
	const [gate, setGate] = useState<'check' | 'ask' | 'go'>(isWebOS() ? 'check' : 'go');
	const [foreign, setForeign] = useState<string[]>([]);
	// a button was just set: Hearth stopped listening and does not start again until the screen is opened again (or asked to)
	const [stopped, setStopped] = useState(false);
	const [busy, setBusy] = useState('');
	const [result, setResult] = useState<Outcome | null>(null);
	const [index, setIndex] = useState(0);
	const polling = useRef(false);
	const autoTried = useRef(0);
	const alive = useRef(true);
	const onTv = isWebOS();

	useEffect(() => () => { alive.current = false; }, []);
	// Z: leaving by Back or *No, go back* ends the listening (the key files go, a later start of Hearth does not reopen this screen); a Home press does not come through here
	const onClose = () => { if (onTv) endListening(); closeScreen(); };

	/** Input Hook's state and its keybinds file. */
	const refresh = () => {
		if (!onTv) return Promise.resolve();
		return Promise.all([readStatus(), readBinds()]).then(([s, r]) => {
			if (!alive.current) return;
			setStatus(s);
			setProblem('');
			if (r.ok) { setBinds(stripGuard(r.binds)); setBindsWhy(''); } else { setBinds(null); setBindsWhy(r.why); }
		}, (e) => { if (alive.current) setProblem(failureText(e, tt('homekey.readTheKeyEngine'))); });
	};

	/** Start listening for button presses. A start that is still fresh (the user pressed Home and came back) is kept. */
	const begin = (forget: boolean) => {
		if (!onTv) return Promise.resolve();
		if (forget) setFound([]);
		return beginListening(forget).then((at) => {
			if (!alive.current) return;
			setSince(at);
		}, (e) => { if (alive.current) setProblem(failureText(e, tt('homekey.listenForButtons'))); });
	};

	/** Start the key engine if it is not running in this boot, then look at its state and start listening to its log. */
	const go = (s: HookStatus, mapped = false) => {
		setGate('go');
		if (mapped) setStopped(true);       // a button of Hearth's is set: the engine stays (it is the Home key), but nothing listens until asked
		(s.injected && s.ready ? Promise.resolve(null) : startEngine())
			.then((o) => { if (o && alive.current) setEngine(o); })
			.catch((e) => { if (alive.current) setProblem(failureText(e, tt('homekey.startTheKeyEngine'))); })
			.then(() => { if (alive.current) { refresh(); if (!mapped) { const at = resumeListening(); if (at) setSince(at); } } });   // listening starts only on the last row; a fresh earlier start is kept
	};

	// First look at what is already there. Nothing is started while button settings of someone else exist and the user has
	// not said yes (unless Hearth already has a button of its own set: the user said yes then).
	useEffect(() => {
		if (!onTv) return;
		Promise.all([readStatus(), readBinds()]).then(([s, r]) => {
			if (!alive.current) return;
			setStatus(s);
			if (r.ok) { setBinds(stripGuard(r.binds)); setBindsWhy(''); } else { setBinds(null); setBindsWhy(r.why); }
			const others = r.ok ? Object.keys(r.binds).filter((k) => !isHearthBind(r.binds[k]) && !isGuardBind(r.binds[k])) : [];
			const ours = r.ok && hearthCodes(stripGuard(r.binds)).length > 0;
			if (r.ok && others.length && !ours) {
				setForeign(others.slice(0, 3).map((k) => `button ${/^\d+$/.test(k) ? keyLabel(Number(k)) : k} ${describeBind(r.binds[k])}`).concat(others.length > 3 ? [`and ${others.length - 3} more`] : []));
				setGate('ask');
			} else go(s, ours);
		}, (e) => { if (alive.current) { setProblem(failureText(e, tt('homekey.readTheKeyEngine'))); setGate('go'); } });
	}, []);                                                                 // eslint-disable-line react-hooks/exhaustive-deps

	// Every moment the log is read again: what was pressed since detecting started.
	useEffect(() => {
		if (!since) return undefined;
		const tick = () => {
			if (polling.current) return;
			polling.current = true;
			pressedKeys().then((k) => { polling.current = false; if (alive.current) setFound(k); }, () => { polling.current = false; });
		};
		tick();
		const timer = window.setInterval(tick, POLL_MS);
		return () => window.clearInterval(timer);
	}, [since]);

	/** `shown` is the longer text for the note; the toast gets the short one. */
	const finish = (r: Outcome, changed: number | null | undefined, shown?: string) => {
		if (!alive.current) return;
		setBusy('');
		setResult(r.ok && shown ? {ok: true, text: shown} : r);
		setIndex(0);
		if (r.ok && changed !== undefined) onChanged(changed);
		onToast(r.text, r.ok ? 'info' : 'error');
		refresh();
	};

	/** A button is set: stop reading the log and forget what was detected. */
	const stopListening = () => {
		endListening();
		setSince(0);
		setFound([]);
		setStopped(true);
	};

	const apply = (code: number, auto = false) => {
		setPending(null);
		setBusy(tt('homekey.settingButtonV1', {v1: keyLabel(code)}));
		// U3: the pop-up comes for every way of setting the button (automatic or chosen), success or failure
		setHomeKey(code).then((r) => {
			if (r.ok) stopListening();
			log(`homekey: ${auto ? 'auto' : 'chosen'} map of ${code} ${r.ok ? 'done' : 'failed: ' + r.text}`);
			onAuto({ok: r.ok, code, why: r.ok ? '' : r.text});
			return r;
		}).then((r) => finish(r, r.ok ? code : undefined, tt('homekey.textPressItOnThe', {text: r.text})));
	};

	const remove = () => {
		setBusy(tt('homekey.removingTheMapping'));
		clearHomeKey().then((r) => { finish(r, r.ok ? null : undefined); if (r.ok) { autoTried.current = 0; setStopped(false); } });
	};

	const choose = (code: number) => {
		if (isProtected(code)) { onToast(tt('homekey.buttonIsNeededTo', {keyLabel: keyLabel(code)}), 'error'); return; }
		setResult(null);
		setPending(code);
		setIndex(0);
	};

	const bindOf = (code: number) => (binds ? binds[String(code)] : undefined);

	// K1: one of LG's Home codes (773, 774, 125) was detected: map it at once, without the question. A code that another
	// app uses is not taken over (the rows below stay for that); both ways the pop-up at the next start tells the result.
	useEffect(() => {
		if (gate !== 'go' || busy || pending !== null || stopped || !since) return;
		const pick = autoPick(found, binds);
		if (!pick || autoTried.current === pick.code) return;
		autoTried.current = pick.code;
		if (pick.blockedBy) {
			const why = tt('homekey.autoBlocked', {keyLabel: keyLabel(pick.code), describeBind: describeBind(pick.blockedBy)});
			onAuto({ok: false, code: pick.code, why});
			return;
		}
		apply(pick.code, true);
	}, [found, binds, gate, busy, pending, stopped, since]);                // eslint-disable-line react-hooks/exhaustive-deps

	/** The second line of a button's row: why it can't be used, what it does now, or what OK does. */
	const codeDetail = (code: number, lead: string): string => {
		if (isProtected(code)) return tt('homekey.notUsableThisButtonIs');
		const b = bindOf(code);
		if (isHearthBind(b)) return tt('homekey.hearthOpensFromThisButton');
		if (b) return tt('homekey.thisButtonAlreadyV1Choosing', {v1: describeBind(b)});
		return lead;
	};

	// ----- the rows -----
	const mapped = binds ? hearthCodes(binds) : [];
	const rows: Row[] = [];

	if (gate === 'check' && onTv) {
		rows.push({key: 'check', label: tt('homekey.checking'), detail: tt('homekey.pleaseWait'), icon: 'info', run: () => undefined});
	} else if (gate === 'ask') {
		rows.push({key: 'proceed', label: tt('homekey.yesContinue'), detail: tt('homekey.hearthStartsItsKey'), icon: 'pin', run: () => { if (status) go(status); }});
		rows.push({key: 'cancel', label: tt('homekey.noGoBack'), detail: tt('homekey.nothingIsStartedOr'), icon: 'default', run: onClose});
	} else if (busy) {
		rows.push({key: 'busy', label: busy, detail: tt('homekey.pleaseWait2'), icon: 'info', run: () => undefined});
	} else if (pending !== null) {
		const existing = bindOf(pending);
		rows.push({
			key: 'yes', label: tt('homekey.yesMakeButtonOpen', {keyLabel: keyLabel(pending)}), icon: 'pin',
			detail: existing && !isHearthBind(existing) ? tt('homekey.itNowRemoveHere', {describeBind: describeBind(existing)}) : tt('homekey.youCanRemoveThis'),
			run: () => apply(pending)
		});
		rows.push({key: 'no', label: tt('homekey.noGoBack2'), detail: tt('homekey.nothingIsChanged'), icon: 'default', run: () => { setPending(null); setIndex(0); }});
	} else {
		const detected = rankDetected(found).filter((d) => !isHomeCode(d.code)).slice(0, 5);
		HOME_CODES.forEach((h, n) => {
			const seen = found.filter((d) => d.code === h.code)[0];
			rows.push({
				key: `known:${h.code}`, label: tt('homekey.knownHomeCode', {keyLabel: keyLabel(h.code)}), icon: 'pin',
				detail: codeDetail(h.code, `${seen ? `seen ${seen.count}× · ` : ''}${n === 0 ? 'First choice · OK to use it' : 'OK to use it if the one above did nothing'}`),
				run: () => choose(h.code), code: h.code
			});
		});
		detected.forEach((d) => {
			rows.push({
				key: `found:${d.code}`, label: tt('homekey.detectedButton', {keyLabel: keyLabel(d.code)}), icon: 'search',
				detail: codeDetail(d.code, `seen ${d.count}× · OK to use it for Home`),
				run: () => choose(d.code), code: d.code
			});
		});
		mapped.forEach((c) => {
			rows.push({key: `remove:${c}`, label: tt('homekey.removeButtonOpensHearth', {keyLabel: keyLabel(c)}), detail: tt('homekey.okGivesTheButton'), icon: 'default', run: remove, code: c});
		});
		rows.push({
			key: 'again', label: since ? tt('homekey.forgetWhatWasDetected') : stopped ? tt('homekey.listenForButtonsAgain') : tt('homekey.listenForTheHomeButton'), icon: 'slideshow',
			detail: tt('homekey.thenPressTheHome'),
			run: () => { setStopped(false); setFound([]); setResult(null); setIndex(0); refresh(); begin(true); }
		});
		rows.push({key: 'model', label: tt('homekey.remote', {v: REMOTE_NAMES[model]}), detail: tt('homekey.okChangesTheDrawing'), icon: 'default', run: () => onModel(nextModel(model, 1))});
	}

	const at = clamp(index, 0, Math.max(0, rows.length - 1));

	// ----- the note above the rows -----
	const running = !!(status && (status.ready || (status.injected && status.logs > 0)));
	const hookLine = !onTv ? tt('homekey.thisOnlyWorksOnA')
		: problem ? problem
		: engine && !engine.ok ? engine.text
		: !status ? tt('homekey.startingTheKeyEngine')
		: running ? tt('homekey.keyEngineRunning', {inputHook: status.app ? tt('homekey.theInputHookAppIs') : ''})
		: tt('homekey.theKeyEngineIsNot');
	const mappedLine = bindsWhy ? bindsWhy : mapped.length ? tt('homekey.homeButtonButtonOpens', {button: keyLabel(mapped[0])}) : tt('homekey.homeButtonNotMappedYet');
	const minutes = Math.round(DETECT_KEEP_MS / 60000);
	const detectLine = !onTv ? ''
		: stopped && !since ? tt('homekey.notListeningNowBecauseA')
		: !since ? tt('homekey.notListeningYet')
		: found.length ? tt('homekey.detectingLengthButtonV2Seen', {length: found.length, v2: found.length === 1 ? '' : tt('homekey.pluralSuffix')})
		: !listening(since) ? tt('homekey.listeningHasEndedAndNothing')
		: tt('homekey.detectingPressTheHomeButton') + minutes + tt('homekey.minutesEnd');

	const askLines = [
		status && status.app ? tt('homekey.itSeemsTheInputHook') : tt('homekey.buttonSettingsLeftFromThe'),
		...foreign,
		status && status.injected ? tt('homekey.theHookIsAlreadyRunning') : '',
		tt('homekey.hearthAddsOneEntryOf'),
		tt('homekey.areYouSureYouWant')
	].filter(Boolean);
	const noteTitle = gate === 'ask' ? tt('homekey.buttonSettingsAlreadyExist') : busy ? tt('homekey.homeButtonOpensHearth') : pending !== null ? tt('homekey.makeButtonV1OpenHearth', {v1: keyLabel(pending)}) : tt('homekey.homeButtonOpensHearth');
	const noteLines: string[] = gate === 'ask' ? askLines : busy ? [] : pending !== null
		? [
			tt('homekey.afterYouSayYesPress'),
			tt('homekey.ifLgHomeOpensInstead'),
			tt('homekey.savedInHookConfigOnly', {HOOK_CONFIG})
		]
		: [hookLine, detectLine, mappedLine].filter(Boolean);

	const handleKey = (key: NavKey): boolean => {
		if (busy) return true;
		if (key === 'up') setIndex(clamp(at - 1, 0, Math.max(0, rows.length - 1)));
		else if (key === 'down') setIndex(clamp(at + 1, 0, Math.max(0, rows.length - 1)));
		else if (key === 'enter') { if (rows[at]) rows[at].run(); }
		else if (key === 'back') { if (pending !== null) { setPending(null); setIndex(0); } else onClose(); }
		return true;
	};
	useKeys(handleKey, !paused);

	const start = clamp(at - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);

	return (
		<div class="screen screen--picker">
			<RemoteDrawing layout={remoteLayout(model)} focusCode={pending !== null ? pending : (rows[at] && rows[at].code) || 0} mappedCodes={mapped} />
			<div class="settings">
				<h1 class="settings__title">{tt('homekey.homeButton')}</h1>
				<p class="settings__hint">{pending !== null ? tt('homekey.okChoosesBackGoesBack') : tt('homekey.moveOkChoosesBackReturns')}</p>
				<div class="picker__note">
					<div class="picker__note-title">{noteTitle}</div>
					<div class="picker__note-para">{noteLines.map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					{result && <div class="picker__note-para"><div class={result.ok ? 'picker__note-line' : 'picker__note-line picker__note-line--error'}>{result.text}</div></div>}
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
				<div class="picker__credit">{tt('homekey.buttonDetectionAndMapping')}</div>
			</div>
		</div>
	);
}
