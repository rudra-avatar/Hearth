import {useLayoutEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {ROOT_OPTIONS, essentialChoices, findPref, prefTab, type PrefTab} from '../lib/prefs';
import {rootState} from '../lib/failure';
import {t as tt, td} from '../i18n';

// S3: "Edit Essentials". The rows chosen for the Essentials tab come first, in their order (tick); every other row that can be
// added follows in the order of the Settings tabs (circle). OK adds or removes a row; ← → moves a chosen row up or down.
// Every change is saved at once (`onChange`; null = back to the default list).

interface Props {
	/** the chosen row ids, in order (already cleaned: `essentialIds`) */
	chosen: string[];
	onChange: (list: string[] | null) => void;
	onClose: () => void;
}

/** p20 (user): the list uses the room down to the bottom edge (old: 7 rows fixed, about 30% empty). Same measure as the file picker: a row is 96 px with its gap. */
const MAX_ROWS = 12;
const MIN_ROWS = 3;
const ROW_PX = 96;
const RESET_ID = '@reset';

const TAB_TEXT: Record<PrefTab, string> = {
	essentials: 'app.essentials', look: 'app.look', clock: 'app.widget', wallpaper: 'app.wallpaper', saver: 'app.screenSaver', system: 'app.system'
};

export function EssentialsEdit ({chosen, onChange, onClose}: Props) {
	const [focusId, setFocusId] = useState(chosen.length ? chosen[0] : RESET_ID);
	const areaRef = useRef<HTMLDivElement>(null);
	const [fit, setFit] = useState(7);

	const noRoot = rootState() === 'no';
	/** the list as drawn: the chosen rows, then the rows that can still be added (Settings order), then the reset row */
	const layout = (list: string[]): string[] => list.concat(essentialChoices().filter((id) => list.indexOf(id) === -1 && !(noRoot && ROOT_OPTIONS.indexOf(id) !== -1)), [RESET_ID]);
	const ids = layout(chosen);
	const found = ids.indexOf(focusId);
	const at = found === -1 ? 0 : found;

	const labelOf = (id: string): string => {
		if (id === RESET_ID) return tt('ess.reset');
		const p = findPref(id);
		return p ? p.label : id;
	};
	const detailOf = (id: string): string => {
		if (id === RESET_ID) return tt('ess.resetDetail');
		const tab = prefTab(id);
		return tab ? td(TAB_TEXT[tab]) : '';
	};

	const handleKey = (key: NavKey): boolean => {
		if (key === 'up') setFocusId(ids[clamp(at - 1, 0, ids.length - 1)]);
		else if (key === 'down') setFocusId(ids[clamp(at + 1, 0, ids.length - 1)]);
		else if (key === 'enter') choose(ids[at]);
		else if (key === 'left' || key === 'right') {
			const i = chosen.indexOf(ids[at]);
			const j = i + (key === 'left' ? -1 : 1);
			if (i !== -1 && j >= 0 && j < chosen.length) {
				const next = chosen.slice();
				next[i] = chosen[j];
				next[j] = chosen[i];
				onChange(next);
			}
		} else if (key === 'back') onClose();
		return true;
	};
	useKeys(handleKey, true);

	function choose (id: string): void {
		if (id === RESET_ID) { onChange(null); setFocusId(RESET_ID); return; }
		const i = chosen.indexOf(id);
		if (i === -1) { onChange(chosen.concat([id])); return; }            // added: the row moves to the end of the chosen rows and the focus follows it
		const next = chosen.slice(0, i).concat(chosen.slice(i + 1));       // removed: the focus stays at the same place in the list
		const after = layout(next);
		onChange(next);
		setFocusId(after[Math.min(i, after.length - 1)]);
	}

	useLayoutEffect(() => {
		const el = areaRef.current;
		const box = el ? el.parentElement : null;
		if (!el || !box) return;
		const n = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor((box.clientHeight - el.offsetTop) / ROW_PX)));
		if (n !== fit) setFit(n);
	}, [fit]);

	const start = clamp(at - Math.floor(fit / 2), 0, Math.max(0, ids.length - fit));
	const visible = ids.slice(start, start + fit);

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('ess.title')}</h1>
				<p class="settings__hint">{tt('ess.hint')}</p>
				<div class="picker" ref={areaRef}>
					{visible.map((id, n) => {
						const i = start + n;
						const isChosen = chosen.indexOf(id) !== -1;
						return (
							<div
								key={id}
								class={`picker__row${i === at ? ' picker__row--focused' : ''}`}
								onMouseEnter={() => setFocusId(id)}
								onClick={() => { setFocusId(id); choose(id); }}
							>
								<PickerIcon kind={id === RESET_ID ? 'search' : isChosen ? 'tick' : 'circle'} />
								<div class="picker__text">
									<div class="picker__label">{labelOf(id)}</div>
									<div class="picker__detail">{detailOf(id)}</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
