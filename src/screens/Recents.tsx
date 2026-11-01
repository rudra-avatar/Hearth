import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {varScope} from '../lib/cssvars';
import {Row} from '../components/Row';
import type {TileModel} from '../components/Tile';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {launchApp} from '../lib/launch';
import {isWebOS} from '../lib/luna';
import {appTile, inputTile} from '../lib/tiles';
import type {InputSource} from '../lib/inputs';
import {themeIcon} from '../lib/themeicons';
import type {AppEntry} from '../lib/apps';
import type {SourceEdits} from '../lib/sourceicons';
import {cachedRecents, closeRecents, listRecents, type RecentApp} from '../lib/recents';
import {log} from '../lib/log';
import {LAYOUT} from '../theme/tokens';
import {t as tt} from '../i18n';

interface Props {
	/** known icons by app id (the home row's list) */
	icons: Record<string, string | undefined>;
	/** the user's own names and icons for apps (Settings -> Apps -> edit); shown here as on the home row */
	edits?: SourceEdits;
	/** the TV inputs and the user's edits of them (B2): an input in the list shows its own name and drawn icon, as on the home row */
	inputs?: InputSource[];
	sourceEdits?: SourceEdits;
	/** panel size, % of the screen */
	width: number;
	height: number;
	onClose: () => void;
	/** an app is being opened from the panel (noted for Settings -> Look -> When Home is pressed) */
	onOpen?: (id: string) => void;
	onToast: (text: string, kind?: 'error') => void;
}

/** The panel Back opens on the home screen: the TV's recent apps along the bottom. OK opens one, holding OK closes it,
 *  Up reaches "Close all", Back closes the panel. */
export function Recents ({icons, edits, inputs, sourceEdits, width, height, onClose, onOpen, onToast}: Props) {
	const [apps, setApps] = useState<RecentApp[] | null>(() => cachedRecents());       // L1b: the last list draws at once, the fresh one replaces it
	const opened = useRef(performance.now());
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [onButton, setOnButton] = useState(false);
	const [index, setIndex] = useState(0);
	const live = useRef(true);
	useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

	const load = useCallback((): Promise<RecentApp[] | null> => listRecents().then(
		(list) => { log(`recents: list read +${Math.round(performance.now() - opened.current)} ms`); if (live.current) { setApps(list); setError(''); setIndex((i) => clamp(i, 0, Math.max(0, list.length - 1))); if (!list.length) setOnButton(false); } return list; },
		(e: Error) => { if (live.current) { setApps([]); setError(e && e.message ? e.message : tt('recents.couldnTReadTheRecent')); } return null; }
	), []);

	useEffect(() => {
		if (!isWebOS()) { setApps([]); setError(tt('recents.recentAppsWorksOnThe')); return; }
		log(`recents: opened, ${cachedRecents() ? 'drawn from the last list' : 'no last list'}`);
		load();
	}, []);

	const count = apps ? apps.length : 0;
	const current = apps ? apps[clamp(index, 0, Math.max(0, count - 1))] : undefined;
	const inputOf = (id: string): InputSource | undefined => (inputs || []).filter((i) => i.appId === id)[0];
	const nameOf = (a: RecentApp): string => { const inp = inputOf(a.id); return inp ? inputTile(inp, sourceEdits || {}).label : (edits && edits[a.id] && edits[a.id].label) || a.title; };

	const close = (ids: string[], label: string, hideAfter = false) => {
		if (!ids.length || busy) return;
		setBusy(true);
		closeRecents(ids).then(() => null, (e: Error) => e).then((fail) => load().then((list) => {
			if (live.current) setBusy(false);
			const still = list ? list.filter((a) => ids.indexOf(a.id) !== -1).length : ids.length;
			if (fail || still > 0) onToast(ids.length > 1 ? tt('recents.someAppsDidNot') : tt('recents.theTvWouldNot', {label}), 'error');
			else { onToast(ids.length > 1 ? tt('recents.closedApps', {length: ids.length}) : tt('recents.closed', {label})); if (hideAfter) onClose(); }
		}));
	};
	const open = (a?: RecentApp) => { if (a && onOpen) onOpen(a.id); if (a) launchApp(a.id).then(() => onClose(), () => onToast(tt('recents.couldnTOpen', {title: nameOf(a)}), 'error')); };

	const handleKey = useCallback((key: NavKey): boolean => {
		if (key === 'back') { onClose(); return true; }
		if (busy) return true;
		if (onButton) { if (key === 'down' && count) setOnButton(false); return true; }
		if (key === 'left') setIndex((i) => clamp(i - 1, 0, Math.max(0, count - 1)));
		else if (key === 'right') setIndex((i) => clamp(i + 1, 0, Math.max(0, count - 1)));
		else if (key === 'up' && count) setOnButton(true);
		return true;
	}, [busy, onButton, count, onClose]);
	useKeys(handleKey, true);
	useOkPress({
		onPress: () => { if (busy) return; if (onButton) { if (count && apps) close(apps.map((a) => a.id), '', true); } else open(current); },
		onLongPress: () => { if (!busy && !onButton && current) close([current.id], nameOf(current)); }
	}, true);

	const k = height / 30;
	const tileSize = Math.round(112 * k);
	const tileGap = Math.round(24 * k);
	// the user's own name and picture win, as on the home row (appTile); apps without an edit keep the TV's title
	const items: TileModel[] = (apps || []).map((a) => inputOf(a.id)
		? inputTile(inputOf(a.id) as InputSource, sourceEdits || {})
		: edits && edits[a.id]
		? appTile({id: a.id, title: a.title, iconUrl: icons[a.id]} as AppEntry, edits)
		: {key: a.id, label: a.title, imageUrl: themeIcon(a.id) || icons[a.id]});
	const status = apps === null ? tt('picker.loading') : error || (count ? '' : tt('recents.noRecentApps'));
	const hint = busy ? tt('recents.closing') : onButton ? tt('recents.okClosesAllAppsBack') : tt('recents.okOpenHoldOkClose');
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
						<h1 class="recents__title">{tt('recents.recentApps')}</h1>
						<p class="recents__hint">{hint}</p>
					</div>
					<div
						class={`settings__button recents__closeall${onButton ? ' settings__button--focused' : ''}${count ? '' : ' recents__closeall--off'}`}
						onMouseEnter={() => { if (count) setOnButton(true); }}
						onClick={() => { if (count && apps && !busy) close(apps.map((a) => a.id), '', true); }}
					>{tt('recents.closeAll')}</div>
				</div>
				{status
					? <div class="recents__status">{status}</div>
					: <div class={rowVars.cls || undefined} style={rowVars.css || undefined}>
						<Row
							items={items}
							focused={!onButton}
							selected={clamp(index, 0, Math.max(0, count - 1))}
							onSelect={(i) => { setIndex(i); setOnButton(false); }}
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
