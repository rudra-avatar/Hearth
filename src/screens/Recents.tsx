import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {varScope} from '../lib/cssvars';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {launchApp} from '../lib/launch';
import {isWebOS} from '../lib/luna';
import {cachedRecents, closeRecents, listRecents, noteOpened, type RecentApp} from '../lib/recents';
import {followFocus, sameRecents, withoutApps} from '../lib/recentcache';
import {recentTile} from '../lib/tiles';
import {LAYOUT} from '../theme/tokens';

interface Props {
	/** every app's and input's tile by id, with the user's names and icons (the home row's) */
	tiles: Record<string, TileModel>;
	/** panel size, % of the screen */
	width: number;
	height: number;
	onClose: () => void;
	onToast: (text: string, kind?: 'error') => void;
}

/** The panel Back opens on the home screen: the TV's recent apps along the bottom. OK opens one, holding OK closes it,
 *  Up reaches "Close all", Back closes the panel. */
export function Recents ({tiles, width, height, onClose, onToast}: Props) {
	// the list as last read is drawn at once (reading the TV's list takes a shell command); it is read again just after
	const [apps, setApps] = useState<RecentApp[] | null>(() => (isWebOS() ? cachedRecents() : null));
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [onButton, setOnButton] = useState(false);
	const [index, setIndex] = useState(0);
	const live = useRef(true);
	useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
	const shown = useRef(apps);       // the list on screen, for the loads below
	const moved = useRef(false);      // the user has moved along the row (the highlight then stays on its app)
	const loads = useRef(0);          // only the latest load's answer is used (an older one can come back later)

	const show = useCallback((list: RecentApp[]) => {
		const before = shown.current;
		if (before && sameRecents(before, list)) return;   // an unchanged list redraws nothing
		shown.current = list;
		setApps(list);
		setIndex((i) => followFocus(before || [], list, i, moved.current));
		if (!list.length) setOnButton(false);
	}, []);

	const load = useCallback((): Promise<RecentApp[] | null> => {
		const n = ++loads.current;
		return listRecents().then(
			(list) => { if (live.current && n === loads.current) { show(list); setError(''); } return list; },
			(e: Error) => {
				// a list already on screen stays (a slow or busy Homebrew service is no reason to blank it); the reason is shown
				// in the hint line instead
				if (live.current && n === loads.current) {
					if (!shown.current) { shown.current = []; setApps([]); }
					setError(e && e.message ? e.message : "Couldn't read the recent apps");
				}
				return null;
			}
		);
	}, []);

	useEffect(() => {
		if (!isWebOS()) { setApps([]); setError('Recent apps works on the TV, with the Homebrew Channel'); return; }
		load();
	}, []);

	const count = apps ? apps.length : 0;
	const current = apps ? apps[clamp(index, 0, Math.max(0, count - 1))] : undefined;
	// drawn as on the home row; the names in messages are the drawn ones too
	const items: TileModel[] = useMemo(() => (apps || []).map((a) => recentTile(a.id, a.title, tiles)), [apps, tiles]);
	const nameOf = (a: RecentApp) => recentTile(a.id, a.title, tiles).label;

	const close = (ids: string[], label: string) => {
		if (!ids.length || busy) return;
		setBusy(true);
		closeRecents(ids).then(() => null, (e: Error) => e).then((fail) => load().then((list) => {
			if (live.current) setBusy(false);
			// closed, but the list could not be read again: take them off the list on screen
			if (!fail && !list && live.current && shown.current) show(withoutApps(shown.current, ids));
			// closeRecents only succeeds once the apps are gone, so a list that could not be read again does not undo that
			const still = list ? list.filter((a) => ids.indexOf(a.id) !== -1).length : fail ? ids.length : 0;
			if (fail || still > 0) onToast(ids.length > 1 ? 'Some apps did not close' : `The TV would not close ${label}`, 'error');
			else onToast(ids.length > 1 ? `Closed ${ids.length} apps` : `Closed ${label}`);
		}));
	};
	const open = (a?: RecentApp) => { if (a) launchApp(a.id).then(() => { noteOpened(a.id, nameOf(a)); onClose(); }, () => onToast(`Couldn't open ${nameOf(a)}`, 'error')); };

	const handleKey = useCallback((key: NavKey): boolean => {
		if (key === 'back') { onClose(); return true; }
		if (busy) return true;
		if (onButton) { if (key === 'down' && count) setOnButton(false); return true; }
		if (key === 'left') { moved.current = true; setIndex((i) => clamp(i - 1, 0, Math.max(0, count - 1))); }
		else if (key === 'right') { moved.current = true; setIndex((i) => clamp(i + 1, 0, Math.max(0, count - 1))); }
		else if (key === 'up' && count) setOnButton(true);
		return true;
	}, [busy, onButton, count, onClose]);
	useKeys(handleKey, true);
	useOkPress({
		onPress: () => { if (busy) return; if (onButton) { if (count && apps) close(apps.map((a) => a.id), ''); } else open(current); },
		onLongPress: () => { if (!busy && !onButton && current) close([current.id], nameOf(current)); }
	}, true);

	const k = height / 30;
	const tileSize = Math.round(112 * k);
	const tileGap = Math.round(24 * k);
	const status = apps === null ? 'Loading…' : count ? '' : error || 'No recent apps';
	const hint = busy ? 'Closing…' : error && count ? error : onButton ? 'OK closes all · ↓ apps · Back returns' : 'OK open · Hold OK close · ↑ Close all';
	const side = (100 - width) / 2;
	const rowVars = varScope('recents', {
		'--layout-tile-size': `${tileSize}px`, '--layout-tile-gap': `${tileGap}px`,
		'--layout-tile-radius': `${Math.round(tileSize * 0.2)}px`, '--font-tile-label': `${Math.min(26, Math.round(17 * k))}px`
	});

	return (
		<div class="screen screen--recents">
			<div class="recents" style={`left:${side}%;right:${side}%;height:${height}%`}>
				<div class="recents__head">
					<div class="recents__titles">
						<h1 class="recents__title">Recent apps</h1>
						<p class="recents__hint">{hint}</p>
					</div>
					<div
						class={`settings__button recents__closeall${onButton ? ' settings__button--focused' : ''}${count ? '' : ' recents__closeall--off'}`}
						onMouseEnter={() => { if (count) setOnButton(true); }}
						onClick={() => { if (count && apps && !busy) close(apps.map((a) => a.id), ''); }}
					>Close all</div>
				</div>
				{status
					? <div class="recents__status">{status}</div>
					: <div class={rowVars.cls || undefined} style={rowVars.css || undefined}>
						<Row
							items={items}
							focused={!onButton}
							selected={clamp(index, 0, Math.max(0, count - 1))}
							onSelect={(i) => { moved.current = true; setIndex(i); setOnButton(false); }}
							onActivate={(i) => open(apps ? apps[i] : undefined)}
							tileSize={tileSize}
							tileGap={tileGap}
							viewportWidth={Math.round(LAYOUT.screenWidth * width / 100) - 56}
						/>
					</div>}
			</div>
		</div>
	);
}
