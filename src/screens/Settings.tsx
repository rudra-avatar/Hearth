import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
import {Grid} from '../components/Grid';
import {OptionList, type OptionItem} from '../components/OptionList';
import type {TileModel} from '../components/Tile';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {moveItem} from '../lib/order';
import {LAYOUT} from '../theme/tokens';
import {t as tt} from '../i18n';

export interface SettingsTab {
	id: string;
	label: string;
	/** noun for the re-order button, e.g. "apps" → "Re-order apps" */
	noun: string;
	/** everything available */
	items: TileModel[];
	/** what's on the home screen, in home-screen order */
	shown: TileModel[];
	/** a "Refresh list" button next to the re-order button */
	refresh?: boolean;
	/** an "Order by last opened" switch next to the re-order button; while on, re-ordering is greyed out */
	recent?: {on: boolean};
	/** a "Favourites" button: pick which of the shown items are favourites */
	fav?: boolean;
	/** 2.0.2: an "Uninstall apps" button: OK on a tile asks to uninstall that app */
	remove?: boolean;
	/** present on option tabs (a list of settings instead of a grid of tiles) */
	options?: OptionItem[];
	/** text pages instead of tiles or options (the Debug tab); ↑ ↓ change page */
	pages?: {title: string; lines: string[]; dense?: boolean; right?: {title: string; lines: string[]}}[];
	/** grid sub-tabs under this tab (Apps & Sources): each one is a grid tab of its own */
	subs?: SettingsTab[];
	/** Hold OK on a tile opens its name and icon editor */
	edit?: boolean;
	/** a line of explanation under the buttons (grid tabs) */
	note?: string;
}

interface Props {
	tabs: SettingsTab[];
	active: boolean;
	onToggle: (tabId: string, key: string) => void;
	onReorder: (tabId: string, keys: string[]) => void;
	/** the "Order by last opened" switch */
	onRecent?: () => void;
	onOption: (optionId: string) => void;
	/** the "Refresh list" button on the Apps tab */
	onRefresh?: () => void;
	/** tile keys marked as favourites (checked while the Favourites button is on) */
	favourites?: string[];
	/** OK on a tile while picking favourites */
	onFavourite?: (tabId: string, key: string) => void;
	/** OK on a tile while the Uninstall apps button is on */
	onUninstallPick?: (key: string) => void;
	/** Hold OK on a tile (Apps, Sources): the key of that tile, to edit its name and icon */
	onEdit?: (key: string) => void;
	/** ← or → on a stepper option: -1 or +1 */
	onAdjust: (optionId: string, direction: -1 | 1) => void;
	onClose: () => void;
	/** the tab now showing (the app writes the debug report file when Debug opens) */
	onTab?: (id: string) => void;
	/** closes the open group of one tab, or of every tab when no id is given */
	onCollapse?: (id?: string) => void;
	/** small print at the bottom right (versions, root state) */
	about?: string;
}

/** Focus is on the tabs row (a tab, or a button) or in the tab's content. */
type Zone = 'tabs' | 'subs' | 'refresh' | 'fav' | 'remove' | 'button' | 'recent' | 'content';

/** A tile that has been picked up in re-order mode, and the order to restore on Back. */
interface Held {
	index: number;
	original: string[];
}

const HINT = {
	get select () { return tt('settings.okAddsOrRemovesAn'); },
	get edit () { return tt('settings.okAddsOrRemovesAn'); },
	get reorder () { return tt('settings.okPicksUpAnItem'); },
	get holding () { return tt('settings.arrowsMoveItOkPuts'); },
	get picking () { return tt('settings.okMarksOrUnmarksA'); },
	get removing () { return tt('settings.okUninstallsTheApp'); },
	get options () { return tt('settings.okChangesASettingAdjust'); }
};

/** Settings: pick which apps and sources appear on the home row and their order, plus the
 *  wallpaper and other options.
 *
 *  Tabs: grid tabs (Apps, Sources) and option tabs (Look, Clock, Wallpaper, Options).
 *  Grid tabs, select mode: everything available; OK adds/removes an item.
 *  Grid tabs: hold OK on a tile to edit its name and icon (Apps, Sources).
 *  Grid tabs, re-order mode (the Re-order button): only what's on the home screen, in order;
 *  OK picks an item up, arrows move it, OK puts it down. Hold OK or press Done to leave. */
export function Settings ({tabs, active, onToggle, onReorder, onRecent, onOption, onRefresh, favourites, onFavourite, onUninstallPick, onEdit, onAdjust, onClose, onTab, onCollapse, about}: Props) {
	const [tabIndex, setTabIndex] = useState(0);
	const [subIndex, setSubIndex] = useState(0);
	const [zone, setZone] = useState<Zone>('tabs');
	const [gridIndex, setGridIndex] = useState(0);
	const [optionIndex, setOptionIndex] = useState(0);
	const [reordering, setReordering] = useState(false);
	const [pickKind, setPickKind] = useState<'' | 'fav' | 'remove'>('');          // the Favourites or the Uninstall apps button is on
	const picking = pickKind !== '';
	const [held, setHeld] = useState<Held | null>(null);
	const [pageIndex, setPageIndex] = useState(0);

	const tabCount = tabs.length;
	const current: SettingsTab | undefined = tabs[tabIndex];
	const options: OptionItem[] = (current && current.options) || [];
	const onOptions = !!(current && current.options);
	const pages = (current && current.pages) || [];
	const onPages = pages.length > 0;
	const subs = (current && current.subs) || [];
	const hasSubs = subs.length > 0;
	const tab: SettingsTab | undefined = hasSubs ? subs[Math.min(subIndex, subs.length - 1)] : onOptions || onPages ? undefined : current;     // grid tab, if any
	const hasRefresh = !!(tab && tab.refresh && onRefresh);
	const hasEdit = !!(tab && tab.edit && onEdit);
	// the buttons under the tabs, left to right
	const hasFav = !!(tab && tab.fav && onFavourite);
	const hasRemove = !!(tab && tab.remove && onUninstallPick);
	const hasRecent = !!(tab && tab.recent && onRecent);
	const recentOn = !!(tab && tab.recent && tab.recent.on);
	const bar: Zone[] = picking ? [pickKind === 'remove' ? 'remove' : 'fav'] : ([hasRefresh && !reordering && 'refresh', hasFav && !reordering && 'fav', hasRemove && !reordering && 'remove', 'button', hasRecent && !reordering && 'recent'] as (Zone | false)[]).filter((z): z is Zone => !!z);
	const items = tab ? (reordering || pickKind === 'fav' ? tab.shown : tab.items) : [];
	const count = onPages ? pages.length : onOptions ? options.length : items.length;
	const cols = LAYOUT.gridColumns;
	const keysOf = (list: TileModel[]) => list.map((t) => t.key);

	const selectTab = (i: number) => {
		if (reordering || picking) return;          // tab is locked while re-ordering or picking favourites
		const at = ((i % tabCount) + tabCount) % tabCount;          // the tab bar loops
		if (at !== tabIndex && onCollapse) onCollapse();          // a new tab always shows its groups closed
		setTabIndex(at);
		setPageIndex(0);
		if (onTab && tabs[at]) onTab(tabs[at].id);
		setGridIndex(0);
		setOptionIndex(0);
	};

	const selectSub = (i: number) => {
		if (reordering || picking || !hasSubs) return;
		setSubIndex(((i % subs.length) + subs.length) % subs.length);
		setGridIndex(0);
	};

	/** Switch re-order mode, keeping focus on the same item where it exists in both lists. */
	const setMode = (next: boolean) => {
		if (!tab || next === reordering) return;
		if (next && recentOn) return;                                  // the row follows the last opened apps: nothing to re-order
		const focusedKey = items[gridIndex] && items[gridIndex].key;
		const target = next ? tab.shown : tab.items;
		const i = focusedKey ? keysOf(target).indexOf(focusedKey) : -1;
		setGridIndex(Math.max(0, i));
		setHeld(null);
		setReordering(next);
		if (next && (zone === 'tabs' || target.length === 0)) setZone('button');
	};

	/** Switch the Favourites button on or off (the grid then shows what is on the home screen, favourites ticked). */
	const setPickMode = (next: boolean, kind: 'fav' | 'remove' = 'fav') => {
		if (!tab || next === picking) return;
		const focusedKey = items[gridIndex] && items[gridIndex].key;
		const target = next && kind === 'fav' ? tab.shown : tab.items;
		const i = focusedKey ? keysOf(target).indexOf(focusedKey) : -1;
		setGridIndex(Math.max(0, i));
		setPickKind(next ? kind : '');
		setZone(kind === 'remove' ? 'remove' : 'fav');
	};

	/** Move the held tile to `to`, updating the home screen as it goes. */
	const moveHeld = (to: number) => {
		if (!tab || !held) return;
		const dest = clamp(to, 0, count - 1);
		if (dest === held.index) return;
		onReorder(tab.id, moveItem(keysOf(tab.shown), held.index, dest));
		setHeld({...held, index: dest});
		setGridIndex(dest);
	};

	const activateGridItem = (i: number) => {
		if (!tab || !items[i]) return;
		if (picking) { if (pickKind === 'remove') { if (onUninstallPick) onUninstallPick(items[i].key); } else if (onFavourite) onFavourite(tab.id, items[i].key); return; }
		if (!reordering) { onToggle(tab.id, items[i].key); return; }
		if (held) {                                                   // put down (pointer: at the clicked tile)
			if (i !== held.index) moveHeld(i);
			setHeld(null);
			return;
		}
		setHeld({index: i, original: keysOf(tab.shown)});             // pick up
		setGridIndex(i);
	};

	const onPress = () => {
		if (zone === 'refresh') { if (onRefresh) onRefresh(); return; }
		if (zone === 'fav') { setPickMode(!picking); return; }
		if (zone === 'remove') { setPickMode(!picking, 'remove'); return; }
		if (zone === 'button') { setMode(!reordering); return; }
		if (zone === 'recent') { if (onRecent) onRecent(); return; }
		if (zone === 'tabs') { if (hasSubs) setZone('subs'); else if (count > 0) setZone('content'); return; }
		if (zone === 'subs') { if (count > 0) setZone('content'); return; }
		if (onPages) return;
		if (onOptions) { if (options[optionIndex]) onOption(options[optionIndex].id); return; }
		activateGridItem(gridIndex);
	};

	// Hold OK: on a tile, edit that app or source; while re-ordering, finish re-ordering
	const onLongPress = () => {
		if (!tab) return;
		if (picking) { setPickMode(false); return; }
		if (reordering) { setMode(false); return; }
		if (zone === 'content' && hasEdit && onEdit && items[gridIndex]) onEdit(items[gridIndex].key);
	};

	useOkPress({onPress, onLongPress}, active);

	const handleKey = useCallback((key: NavKey): boolean => {
		if (key === 'enter') return true;           // handled by useOkPress (press vs hold)

		if (key === 'back') {
			if (held && tab) { onReorder(tab.id, held.original); setGridIndex(held.index); setHeld(null); }
			else if (reordering) setMode(false);
			else if (picking) setPickMode(false);
			else if (zone === 'content' && onOptions && onCollapse && options.some((o) => o.header && o.open)) onCollapse(current ? current.id : undefined);          // first Back closes the open group
			else onClose();
			return true;
		}

		if (held) {
			if (key === 'left') moveHeld(held.index - 1);
			else if (key === 'right') moveHeld(held.index + 1);
			else if (key === 'up') moveHeld(held.index - cols);
			else if (key === 'down') moveHeld(held.index + cols);
			return true;
		}

		if (zone === 'tabs') {
			if (key === 'left') selectTab(tabIndex - 1);
			else if (key === 'right') selectTab(tabIndex + 1);
			else if (key === 'down') { if (hasSubs) setZone('subs'); else if (tab) setZone(bar[0]); else if (count > 0) setZone('content'); }
			return true;
		}
		if (zone === 'subs') {
			if (key === 'left') selectSub(subIndex - 1);
			else if (key === 'right') selectSub(subIndex + 1);
			else if (key === 'up') setZone('tabs');
			else if (key === 'down' && tab) setZone(bar[0]);
			return true;
		}
		// The buttons sit in a row under the tabs: Down from the tabs reaches them, Down again reaches the tiles.
		if (zone === 'refresh' || zone === 'fav' || zone === 'remove' || zone === 'button' || zone === 'recent') {
			const at = bar.indexOf(zone);
			if (key === 'left' && at > 0) setZone(bar[at - 1]);
			else if (key === 'right' && at < bar.length - 1) setZone(bar[at + 1]);
			else if (key === 'up' && !reordering && !picking) setZone(hasSubs ? 'subs' : 'tabs');
			else if (key === 'down' && count > 0) setZone('content');
			return true;
		}

		if (onPages) {
			if (key === 'up') { if (pageIndex === 0) setZone('tabs'); else setPageIndex(pageIndex - 1); }
			else if (key === 'down') setPageIndex(clamp(pageIndex + 1, 0, count - 1));
			return true;
		}

		if (onOptions) {
			if (key === 'up') { if (optionIndex === 0) setZone('tabs'); else setOptionIndex(optionIndex - 1); }
			else if (key === 'down') setOptionIndex(clamp(optionIndex + 1, 0, count - 1));
			else if ((key === 'left' || key === 'right') && options[optionIndex] && options[optionIndex].stepper) {
				onAdjust(options[optionIndex].id, key === 'left' ? -1 : 1);
			}
			return true;
		}

		switch (key) {
			case 'left': setGridIndex((i) => clamp(i - 1, 0, count - 1)); break;
			case 'right': setGridIndex((i) => clamp(i + 1, 0, count - 1)); break;
			case 'up':
				if (gridIndex >= cols) setGridIndex((i) => i - cols);
				// the buttons are the row above the tiles
				else setZone(gridIndex % cols < cols / 2 ? bar[0] : bar[bar.length - 1]);
				break;
			case 'down': setGridIndex((i) => (i + cols < count ? i + cols : i)); break;
		}
		return true;
	}, [pageIndex, onPages, zone, tabIndex, subIndex, subs, hasSubs, tabCount, gridIndex, optionIndex, count, tab, onOptions, options, reordering, picking, held, items, hasRefresh, hasEdit, hasRecent, recentOn, onRecent, onReorder, onAdjust, onClose, onCollapse, current]);

	useKeys(handleKey, active);

	const hint = onPages ? tt('settings.photographThePageChangePage') : onOptions ? HINT.options : held ? HINT.holding : reordering ? HINT.reorder : pickKind === 'remove' ? HINT.removing : picking ? HINT.picking : hasEdit ? HINT.edit : HINT.select;
	const labels = tabs.map((t) => t.label);
	const focusedId = useRef('');
	// The rows panel is as wide as the tab bar (first tab's left edge to the last tab's right edge, plus the focus border).
	const tabsRef = useRef<HTMLDivElement>(null);
	const [panelWidth, setPanelWidth] = useState<number | undefined>(undefined);
	const labelKey = labels.join('|');
	const [snug, setSnug] = useState(false);          // LF1b: the tab labels (a longer language) do not fit one row: use the tighter spacing
	useLayoutEffect(() => { setSnug(false); }, [labelKey]);
	useLayoutEffect(() => {
		const bar = tabsRef.current;
		const first = bar && bar.children[0] as HTMLElement | undefined;
		const last = bar && bar.children[bar.children.length - 1] as HTMLElement | undefined;
		if (!first || !last) return;
		const room = bar && bar.parentElement ? bar.parentElement.clientWidth : 1700;          // never wider than the settings area (the extra Debug and Tests tabs made the bar too wide)
		if (bar && !snug && tabCount <= 7 && bar.scrollWidth > room + 1) { setSnug(true); return; }          // measured with normal spacing first; the next pass measures the tight one
		const w = Math.min(last.offsetLeft + last.offsetWidth - first.offsetLeft + 16, room);
		if (w >= 600) setPanelWidth((p) => (p === w ? p : w));
	}, [labelKey, snug]);          // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {          // a group opening or closing moves rows: keep the focus on the same row
		const was = focusedId.current;
		if (!was || !onOptions) return;
		const i = options.map((o) => o.id).indexOf(was);
		if (i >= 0 && i !== optionIndex) setOptionIndex(i);
	}, [options]);              // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => { focusedId.current = options[optionIndex] ? options[optionIndex].id : ''; }, [optionIndex, options]);
	useEffect(() => {          // a group closes as soon as the focus leaves it (another group, a tab, a button)
		if (!onOptions || !onCollapse || !current || !options.some((o) => o.header && o.open)) return;
		const f = options[optionIndex];
		if (!(zone === 'content' && f && ((f.header && f.open) || f.grouped))) onCollapse(current.id);
	}, [zone, optionIndex, options, tabIndex]);          // eslint-disable-line react-hooks/exhaustive-deps
	const buttonClass = ['settings__button', reordering && 'settings__button--active', recentOn && 'settings__button--off', zone === 'button' && 'settings__button--focused'].filter(Boolean).join(' ');

	return (
		<div class="screen screen--settings">
			<div class="settings">
				<h1 class="settings__title">{tt('settings.settings')}</h1>
				<p class="settings__hint">{hint}</p>
				<div class={tabCount > 7 ? 'settings__tabs settings__tabs--tight' : snug ? 'settings__tabs settings__tabs--snug' : 'settings__tabs'} ref={tabsRef}>
					{labels.map((label, i) => (
						<div
							key={label}
							class={['tab', i === tabIndex && 'tab--active', (reordering || picking) && i !== tabIndex && 'tab--locked', zone === 'tabs' && i === tabIndex && 'tab--focused'].filter(Boolean).join(' ')}
							onMouseEnter={() => { if (!reordering && !picking) { setZone('tabs'); selectTab(i); } }}
						>
							{label}
						</div>
					))}
				</div>
				{hasSubs && (
					<div class="settings__tabs settings__tabs--sub">
						{subs.map((t, i) => (
							<div
								key={t.id}
								class={['tab', t === tab && 'tab--active', (reordering || picking) && t !== tab && 'tab--locked', zone === 'subs' && t === tab && 'tab--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => { if (!reordering && !picking) { setZone('subs'); selectSub(i); } }}
							>
								{t.label}
							</div>
						))}
					</div>
				)}
				{tab && (
					<div class="settings__toolbar">
						{hasRefresh && !reordering && !picking && (
							<div
								class={['settings__button', zone === 'refresh' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('refresh')}
								onClick={() => { if (onRefresh) onRefresh(); }}
							>
								{tt('settings.refreshList')}</div>
						)}
						{hasFav && !reordering && pickKind !== 'remove' && (
							<div
								class={['settings__button', picking && 'settings__button--active', zone === 'fav' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('fav')}
								onClick={() => setPickMode(!picking)}
							>
								{picking ? tt('preloadcmd.done') : tt('group.Favourites')}
							</div>
						)}
						{hasRemove && !reordering && pickKind !== 'fav' && (
							<div
								class={['settings__button', picking && 'settings__button--active', zone === 'remove' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('remove')}
								onClick={() => setPickMode(!picking, 'remove')}
							>
								{picking ? tt('preloadcmd.done') : tt('settings.uninstallApps')}
							</div>
						)}
						{!picking && (
							<div
								class={buttonClass}
								onMouseEnter={() => setZone('button')}
								onClick={() => setMode(!reordering)}
							>
								{reordering ? tt('preloadcmd.done') : tt('settings.reOrderNoun', {noun: tab.noun})}
							</div>
						)}
						{hasRecent && !reordering && !picking && (
							<div
								class={['settings__button', recentOn && 'settings__button--active', zone === 'recent' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('recent')}
								onClick={() => { if (onRecent) onRecent(); }}
							>
								{recentOn ? tt('settings.orderByLastOpenedOn') : tt('settings.orderByLastOpenedOff')}
							</div>
						)}
						{tab.note && !reordering && !picking && <p class="settings__note">{tab.note}</p>}
					</div>
				)}
				{tab && (
					<Grid
						items={items}
						mode={reordering ? 'reorder' : 'select'}
						checkedKeys={pickKind === 'fav' ? (favourites || []) : pickKind === 'remove' ? [] : keysOf(tab.shown)}
						liftedIndex={held ? held.index : -1}
						focused={zone === 'content'}
						selected={gridIndex}
						onSelect={(i) => { if (!held) { setZone('content'); setGridIndex(i); } }}
						onActivate={(i) => { setZone('content'); activateGridItem(i); }}
					/>
				)}
				{onPages && pages[pageIndex] && (
					<div class={pages[pageIndex].dense ? 'settings__log settings__log--dense' : 'settings__log'}>
						<div class="settings__log-title">{pages[pageIndex].title}</div>
						<div class="settings__log-cols">
							<div class="settings__log-col settings__log-col--main">
								{pages[pageIndex].lines.map((l, i) => <div key={i} class="settings__log-line">{l || '\u00a0'}</div>)}
							</div>
							{pages[pageIndex].right && (
								<div class="settings__log-col settings__log-col--side">
									<div class="settings__log-sub">{pages[pageIndex].right!.title}</div>
									{pages[pageIndex].right!.lines.map((l, i) => <div key={i} class="settings__log-line">{l || '\u00a0'}</div>)}
								</div>
							)}
						</div>
					</div>
				)}
				{onOptions && (
					<OptionList
						options={options}
						focused={zone === 'content'}
						selected={optionIndex}
						onSelect={(i) => { setZone('content'); setOptionIndex(i); }}
						onActivate={(i) => { setZone('content'); onOption(options[i].id); }}
						width={panelWidth}
					/>
				)}
				{about && <p class="settings__about">{about}</p>}
				{(reordering || pickKind === 'fav') && count === 0 && <p class="settings__hint">{tt('settings.nothingOnTheHome')}</p>}
			</div>
		</div>
	);
}
