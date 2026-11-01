import {useCallback, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';

/** Something the TV can open when it is switched on. '' = the TV's own default. */
export interface PowerOnChoice {
	id: string;
	label: string;
	detail?: string;
}

interface Props {
	choices: PowerOnChoice[];
	/** what is chosen now ('' = the TV's default) */
	chosen: string;
	/** network wake-ups open it too */
	network: boolean;
	/** the TV still needs a restart before it does what was chosen */
	restartNeeded: boolean;
	/** what the TV does until then, in words */
	untilRestart: string;
	/** a change is being made */
	busy: boolean;
	onChoose: (id: string) => void;
	onNetwork: () => void;
	onRestart: () => void;
	onClose: () => void;
}

interface Row {
	key: string;
	kind: 'restart' | 'network' | 'choice';
	label: string;
	detail?: string;
	choice?: PowerOnChoice;
	current?: boolean;
}

const VISIBLE_ROWS = 8;

/** Settings → Options → "When the TV turns on, open…": the TV's default, Hearth, then every app. OK chooses. While a
 *  restart is still needed, the first row offers it. */
export function PowerOnPicker ({choices, chosen, network, restartNeeded, untilRestart, busy, onChoose, onNetwork, onRestart, onClose}: Props) {
	// focus is kept by row, not by position: the restart row comes and goes at the top, and the focus must stay on the
	// same app when it does. It starts on the current choice.
	const [focusKey, setFocusKey] = useState('c:' + chosen);
	const [confirm, setConfirm] = useState(false);

	const rows: Row[] = [];
	if (restartNeeded) {
		rows.push(confirm
			? {key: 'restart', kind: 'restart', label: 'Press OK again to restart the TV', detail: 'The screen goes dark for about half a minute. Back cancels'}
			: {key: 'restart', kind: 'restart', label: 'Restart the TV now to start using it', detail: `The TV reads this when it starts up. Until it restarts, it opens ${untilRestart}`});
	}
	if (chosen) {
		rows.push({key: 'network', kind: 'network', label: `Also when woken over the network: ${network ? 'On' : 'Off'}`,
			detail: 'How phone apps and Home Assistant switch it on. Casting to it while off then opens this app first'});
	}
	choices.forEach((c) => rows.push({key: 'c:' + c.id, kind: 'choice', label: c.label, detail: c.detail, choice: c, current: c.id === chosen}));
	// a focused row that goes away (the restart row after a refresh): stay at about the same place
	const lastIndex = useRef(0);
	const found = rows.findIndex((r) => r.key === focusKey);
	const index = found === -1 ? clamp(lastIndex.current, 0, Math.max(0, rows.length - 1)) : found;
	lastIndex.current = index;
	const focusAt = (i: number) => { const row = rows[clamp(i, 0, Math.max(0, rows.length - 1))]; if (row) setFocusKey(row.key); };

	const activate = (i: number) => {
		const row = rows[i];
		if (!row || busy) return;
		if (row.kind === 'restart') {
			if (confirm) { setConfirm(false); onRestart(); } else setConfirm(true);
			return;
		}
		setConfirm(false);
		if (row.kind === 'network') { onNetwork(); return; }
		if (row.choice && !row.current) onChoose(row.choice.id);
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		const last = Math.max(0, rows.length - 1);
		switch (key) {
			case 'up': setConfirm(false); focusAt(clamp(index - 1, 0, last)); break;
			case 'down': setConfirm(false); focusAt(clamp(index + 1, 0, last)); break;
			// the list of apps can be long: ← → jump a page
			case 'left': setConfirm(false); focusAt(clamp(index - VISIBLE_ROWS, 0, last)); break;
			case 'right': setConfirm(false); focusAt(clamp(index + VISIBLE_ROWS, 0, last)); break;
			case 'enter': activate(index); break;
			case 'back': if (confirm) setConfirm(false); else onClose(); break;
			default: break;
		}
		return true;
	}, [rows.length, index, focusKey, confirm, busy, chosen, network, choices, restartNeeded]);   // eslint-disable-line react-hooks/exhaustive-deps

	useKeys(handleKey, true);

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">When the TV turns on, open…</h1>
				<p class="settings__hint">OK chooses · ← → jump a page · Back returns to settings</p>
				<div class="picker__path">{chosen && network
					? 'When you switch it on, also from a phone or Home Assistant. HDMI-CEC still goes where it asks'
					: 'Only when you switch it on yourself: casting, HDMI-CEC and network wake-ups still go where they ask'}</div>
				<div class="picker">
					{visible.map((row, n) => {
						const i = start + n;
						const dim = busy;
						return (
							<div
								key={row.key}
								class={`picker__row${i === index ? ' picker__row--focused' : ''}${dim ? ' picker__row--disabled' : ''}`}
								onMouseEnter={() => { if (row.kind !== 'restart') setConfirm(false); focusAt(i); }}
								onClick={() => { focusAt(i); activate(i); }}
							>
								<PickerIcon kind={row.kind === 'restart' ? 'power' : row.kind === 'network' ? 'info' : row.current ? 'pin' : row.choice && row.choice.id === '' ? 'default' : 'app'} />
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
