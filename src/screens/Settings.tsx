import type {ComponentChildren} from 'preact';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
import {Grid} from '../components/Grid';
import {OptionList, type OptionItem} from '../components/OptionList';
import {HelpPanel} from '../components/HelpPanel';
import {homePreviewFor, widgetPositionRow} from '../lib/homepreview';
import {helpForTab, helpForOption} from '../lib/helptext';
import type {TileModel} from '../components/Tile';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {LAYOUT} from '../theme/tokens';
import {t as tt} from '../i18n';
import {edgeDirection, edgeDepth} from '../lib/pointer';

export interface SettingsTab {
	id: string;
	label: string;
	/** everything available */
	items: TileModel[];
	/** what's on the home screen, in home-screen order */
	shown: TileModel[];
	/** a "Refresh list" button */
	refresh?: boolean;
	/** a "Most used" switch (while on, the home row's move mode is not offered) */
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
	/** p22c: a live preview sits in the room right of the list (Widget tab, widget on); p23c: help shows with it too */
	preview?: boolean;
}

interface Props {
	tabs: SettingsTab[];
	active: boolean;
	onToggle: (tabId: string, key: string) => void;
	/** the "Most used" switch */
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
	/** p23b: draws the home preview (called only while a preview row is highlighted, so nothing is mounted otherwise) */
	homePreview?: () => ComponentChildren;
}

/** p14: the option list and the tab bar are this wide on every tab, so the room right of them (the Widget tab's preview) is always reserved. */
/** p20 (user): a share of the Settings area instead of 1325 px (the area is 1640 px wide at 1920, so 80.8% is the same size there; old: 1325 px) */
/** p23a (user): the Settings area is 3.125% (60 px at 1920) from both screen edges (old: 140 px, list 80.8% of 1640 = 1325 px); the list is 73.33% of the area (1320 px at 1920), the help/preview column takes the rest. */
const EDGE_PCT = 3.125;
const LIST_PCT = 73.3333;
const GAP_PCT = 1.0417;      // 20 px at 1920
const PANEL_W = `${LIST_PCT}%`;
/** left edge of the help panel, as a share of the whole screen (the panel is positioned in the padded Settings box) */
const HELP_LEFT = `${(EDGE_PCT + LIST_PCT * (100 - 2 * EDGE_PCT) / 100 + GAP_PCT).toFixed(3)}%`;

/** p29 (user): the tab bar scrolls with the Magic Remote pointer in its outer 20% (same zone as the home row), slowly: window widths per second, MIN at the inner border, MAX at the very edge. */
const TAB_EDGE_SPEED_MIN = 0.12;
const TAB_EDGE_SPEED_MAX = 0.45;

/** Focus is on the tabs row (a tab, or a button) or in the tab's content. */
type Zone = 'tabs' | 'subs' | 'refresh' | 'fav' | 'remove' | 'recent' | 'content';

const HINT = {
	get select () { return tt('settings.okAddsOrRemovesAn'); },
	get edit () { return tt('settings.okAddsOrRemovesAn'); },
	get picking () { return tt('settings.okMarksOrUnmarksA'); },
	get removing () { return tt('settings.okUninstallsTheApp'); },
	get options () { return tt('settings.okChangesASettingAdjust'); }
};

/** Settings: pick which apps and sources appear on the home row, plus the
 *  wallpaper and other options. (The order is changed on the home row itself: hold OK, Reorder home row.)
 *
 *  Tabs: grid tabs (Apps, Sources) and option tabs (Look, Clock, Wallpaper, Options).
 *  Grid tabs, select mode: everything available; OK adds/removes an item.
 *  Grid tabs: hold OK on a tile to edit its name and icon (Apps, Sources).
 */
export function Settings ({tabs, active, onToggle, onRecent, onOption, onRefresh, favourites, onFavourite, onUninstallPick, onEdit, onAdjust, onClose, onTab, onCollapse, about, homePreview}: Props) {
	const [tabIndex, setTabIndex] = useState(0);
	const [subIndex, setSubIndex] = useState(0);
	const [zone, setZone] = useState<Zone>('tabs');
	const [gridIndex, setGridIndex] = useState(0);
	const [optionIndex, setOptionIndex] = useState(0);
	const [pickKind, setPickKind] = useState<'' | 'fav' | 'remove'>('');          // the Favourites or the Uninstall apps button is on
	const picking = pickKind !== '';
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
	const bar: Zone[] = picking ? [pickKind === 'remove' ? 'remove' : 'fav'] : ([hasRefresh && 'refresh', hasFav && 'fav', hasRemove && 'remove', hasRecent && 'recent'] as (Zone | false)[]).filter((z): z is Zone => !!z);
	const items = tab ? (pickKind === 'fav' ? tab.shown : tab.items) : [];
	const count = onPages ? pages.length : onOptions ? options.length : items.length;
	const cols = LAYOUT.gridColumns;
	const keysOf = (list: TileModel[]) => list.map((t) => t.key);

	const selectTab = (i: number) => {
		if (picking) return;          // tab is locked while picking favourites
		const at = ((i % tabCount) + tabCount) % tabCount;          // the tab bar loops
		if (at !== tabIndex && onCollapse) onCollapse();          // a new tab always shows its groups closed
		setTabIndex(at);
		setPageIndex(0);
		if (onTab && tabs[at]) onTab(tabs[at].id);
		setGridIndex(0);
		setOptionIndex(0);
	};

	const selectSub = (i: number) => {
		if (picking || !hasSubs) return;
		setSubIndex(((i % subs.length) + subs.length) % subs.length);
		setGridIndex(0);
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

	const activateGridItem = (i: number) => {
		if (!tab || !items[i]) return;
		if (picking) { if (pickKind === 'remove') { if (onUninstallPick) onUninstallPick(items[i].key); } else if (onFavourite) onFavourite(tab.id, items[i].key); return; }
		onToggle(tab.id, items[i].key);
	};

	const onPress = () => {
		if (zone === 'refresh') { if (onRefresh) onRefresh(); return; }
		if (zone === 'fav') { setPickMode(!picking); return; }
		if (zone === 'remove') { setPickMode(!picking, 'remove'); return; }
		if (zone === 'recent') { if (onRecent) onRecent(); return; }
		if (zone === 'tabs') { if (hasSubs) setZone('subs'); else if (count > 0) setZone('content'); return; }
		if (zone === 'subs') { if (count > 0) setZone('content'); return; }
		if (onPages) return;
		if (onOptions) { if (options[optionIndex]) onOption(options[optionIndex].id); return; }
		activateGridItem(gridIndex);
	};

	// Hold OK: on a tile, edit that app or source
	const onLongPress = () => {
		if (!tab) return;
		if (picking) { setPickMode(false); return; }
		if (zone === 'content' && hasEdit && onEdit && items[gridIndex]) onEdit(items[gridIndex].key);
	};

	useOkPress({onPress, onLongPress}, active);

	const handleKey = useCallback((key: NavKey): boolean => {
		if (key === 'enter') return true;           // handled by useOkPress (press vs hold)

		if (key === 'back') {
			if (picking) setPickMode(false);
			else if (zone === 'content' && onOptions && onCollapse && options.some((o) => o.header && o.open)) onCollapse(current ? current.id : undefined);          // first Back closes the open group
			else onClose();
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
		if (zone === 'refresh' || zone === 'fav' || zone === 'remove' || zone === 'recent') {
			const at = bar.indexOf(zone);
			if (key === 'left' && at > 0) setZone(bar[at - 1]);
			else if (key === 'right' && at < bar.length - 1) setZone(bar[at + 1]);
			else if (key === 'up' && !picking) setZone(hasSubs ? 'subs' : 'tabs');
			else if (key === 'down' && count > 0) setZone('content');
			return true;
		}

		if (onPages) {
			if (key === 'up') { if (pageIndex === 0) setZone('tabs'); else setPageIndex(pageIndex - 1); }
			else if (key === 'down') setPageIndex(clamp(pageIndex + 1, 0, count - 1));
			return true;
		}

		if (onOptions) {
			const loops = !!current && current.id === 'tests';          // p14: the Tests rows loop (Up on the first = the last, Down on the last = the first)
			if (key === 'up') { if (optionIndex === 0) { if (loops && count > 1) setOptionIndex(count - 1); else setZone('tabs'); } else setOptionIndex(optionIndex - 1); }
			else if (key === 'down') setOptionIndex(loops && count > 1 && optionIndex >= count - 1 ? 0 : clamp(optionIndex + 1, 0, count - 1));
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
	}, [pageIndex, onPages, zone, tabIndex, subIndex, subs, hasSubs, tabCount, gridIndex, optionIndex, count, tab, onOptions, options, picking, items, hasRefresh, hasEdit, hasRecent, recentOn, onRecent, onAdjust, onClose, onCollapse, current]);

	useKeys(handleKey, active);

	const hint = onPages ? tt('settings.photographThePageChangePage') : onOptions ? (current && current.id === 'tests' ? tt('settings.testsLeaveHint') : HINT.options) : pickKind === 'remove' ? HINT.removing : picking ? HINT.picking : hasEdit ? HINT.edit : HINT.select;
	const labels = tabs.map((t) => t.label);
	const focusedId = useRef('');
	// p14: the tab bar is a window of fixed width; the pills slide so the focused one is always whole in view, pills that do not fit are hidden
	const tabsRef = useRef<HTMLDivElement>(null);
	const winRef = useRef<HTMLDivElement>(null);
	const tabShiftRef = useRef(0);
	const [, setTabShift] = useState(0);
	const labelKey = labels.join('|');
	// p29: pointer edge scroll of the tab bar (free pixels, no tile selects; pills clip at the window edge)
	const edgeRef = useRef({dir: 0, depth: 0});
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const pointerSelRef = useRef(-1);          // p33f (F2): the tab a pointer pick moved to (-1 = none), so a stale pick cannot swallow a later key-driven slide
	const stopTabScroll = () => {
		edgeRef.current.dir = 0;
		if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
		const track = tabsRef.current;
		if (track) { track.style.transition = ''; track.style.webkitTransition = ''; }
		setTabShift(tabShiftRef.current);
	};
	const tabScrollFrame = (now: number) => {
		rafRef.current = 0;
		const win = winRef.current;
		const track = tabsRef.current;
		const e = edgeRef.current;
		if (!win || !track || !e.dir) return;
		const kids = track.children;
		const first = kids[0] as HTMLElement | undefined;
		const last = kids[kids.length - 1] as HTMLElement | undefined;
		if (!first || !last) return;
		const room = win.clientWidth - 16;
		const max = Math.max(0, last.offsetLeft - first.offsetLeft + last.offsetWidth - room);
		const dt = Math.max(0, Math.min(0.1, (now - lastRef.current) / 1000));   // clamp: a rAF time can precede the event time
		lastRef.current = now;
		const speed = (TAB_EDGE_SPEED_MIN + (TAB_EDGE_SPEED_MAX - TAB_EDGE_SPEED_MIN) * e.depth) * win.clientWidth;
		const next = Math.max(0, Math.min(max, tabShiftRef.current + e.dir * speed * dt));
		if (next !== tabShiftRef.current) {
			tabShiftRef.current = next;
			const v = `translateX(${-next}px)`;
			track.style.transform = v; track.style.webkitTransform = v;
		}
		if ((e.dir > 0 && next < max) || (e.dir < 0 && next > 0)) rafRef.current = requestAnimationFrame(tabScrollFrame);
	};
	const onTabsMove = (ev: MouseEvent) => {
		if (picking) return;
		const win = winRef.current;
		if (!win) return;
		const r = win.getBoundingClientRect();
		const dir = edgeDirection(ev.clientX, r);
		const e = edgeRef.current;
		e.dir = dir; e.depth = edgeDepth(ev.clientX, r);
		if (!dir) { if (rafRef.current) stopTabScroll(); return; }
		if (!rafRef.current) {
			const track = tabsRef.current;
			if (track) {          // no slide animation while the pointer drives it; every pill shows (clipped by the window)
				track.style.transition = 'none'; track.style.webkitTransition = 'none';
				for (let i = 0; i < track.children.length; i++) { const k = track.children[i] as HTMLElement; k.style.opacity = ''; k.style.pointerEvents = ''; }
			}
			lastRef.current = performance.now();
			rafRef.current = requestAnimationFrame(tabScrollFrame);
		}
	};
	useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
	useLayoutEffect(() => {
		const win = winRef.current;
		const track = tabsRef.current;
		const kids = track ? track.children : null;
		const first = kids && kids[0] as HTMLElement | undefined;
		const el = kids && kids[tabIndex] as HTMLElement | undefined;
		if (!win || !kids || !first || !el) return;
		const byPointer = pointerSelRef.current === tabIndex; pointerSelRef.current = -1;
		if (byPointer) return;          // p29: a pill picked with the pointer keeps the bar where it is
		const room = win.clientWidth - 16;          // 8 px padding each side (room for the focus border)
		const at = (e: HTMLElement) => e.offsetLeft - first.offsetLeft;
		const l = at(el);
		const r = l + el.offsetWidth;
		let next = tabShiftRef.current;
		if (tabIndex === 0 || r <= room) next = 0;
		else if (l < next) next = l;
		else if (r > next + room) next = r - room;
		for (let i = 0; i < kids.length; i++) {
			const k = kids[i] as HTMLElement;
			const whole = at(k) >= next - 1 && at(k) + k.offsetWidth <= next + room + 1;
			k.style.opacity = whole ? '' : '0';
			k.style.pointerEvents = whole ? '' : 'none';
		}
		if (next !== tabShiftRef.current) { tabShiftRef.current = next; setTabShift(next); }
	}, [tabIndex, labelKey]);
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

	// p22c: help for what is highlighted (the tab pill, or the row or group in the list). p23c (user): also while a preview shows (Widget tab), the texts are short.
	let helpTitle = '';
	let helpBody = '';
	if (onOptions && current) {
		if (zone === 'tabs') { helpTitle = current.label; helpBody = helpForTab(current.id); }
		else if (zone === 'content') {
			const o = options[optionIndex];
			if (o) { helpTitle = o.label; helpBody = helpForOption(o.id); }
		}
	}
	// p23b: the home preview under the help text, only while a row listed in lib/homepreview.ts is highlighted in the list
	const previewOn = !!(homePreview && onOptions && current && zone === 'content' && options[optionIndex] && homePreviewFor(options[optionIndex].id));
	const fullPrev = previewOn && widgetPositionRow(options[optionIndex].id);
	useEffect(() => {          // p30: the Widget tab's widget-only strip hides while the full preview shows (CSS on <html>)
		const cl = document.documentElement.classList;
		if (fullPrev) cl.add('hearth-fullprev'); else cl.remove('hearth-fullprev');
		return () => { cl.remove('hearth-fullprev'); };
	}, [fullPrev]);

	return (
		<div class="screen screen--settings">
			<div class="settings">
				<h1 class="settings__title">{tt('settings.settings')}</h1>
				<p class="settings__hint">{hint} · {tt('settings.homeLeaveHint')}</p>
				<div class="settings__tabwin" ref={winRef} style={{width: PANEL_W}} onMouseMove={onTabsMove} onMouseLeave={() => { if (rafRef.current || edgeRef.current.dir) stopTabScroll(); }}>
					<div class="settings__tabs" ref={tabsRef} style={{transform: `translateX(${-tabShiftRef.current}px)`, WebkitTransform: `translateX(${-tabShiftRef.current}px)`}}>
						{labels.map((label, i) => (
							<div
								key={label}
								class={['tab', i === tabIndex && 'tab--active', picking && i !== tabIndex && 'tab--locked', zone === 'tabs' && i === tabIndex && 'tab--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => { if (!picking && !edgeRef.current.dir) { if (i !== tabIndex) pointerSelRef.current = i; setZone('tabs'); selectTab(i); } }}
							>
								{label}
							</div>
						))}
					</div>
				</div>
				{hasSubs && (
					<div class="settings__tabs settings__tabs--sub">
						{subs.map((t, i) => (
							<div
								key={t.id}
								class={['tab', t === tab && 'tab--active', picking && t !== tab && 'tab--locked', zone === 'subs' && t === tab && 'tab--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => { if (!picking) { setZone('subs'); selectSub(i); } }}
							>
								{t.label}
							</div>
						))}
					</div>
				)}
				{tab && (
					<div class="settings__toolbar">
						{hasRefresh && !picking && (
							<div
								class={['settings__button', zone === 'refresh' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('refresh')}
								onClick={() => { if (onRefresh) onRefresh(); }}
							>
								{tt('settings.refreshList')}</div>
						)}
						{hasFav && pickKind !== 'remove' && (
							<div
								class={['settings__button', picking && 'settings__button--active', zone === 'fav' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('fav')}
								onClick={() => setPickMode(!picking)}
							>
								{picking ? tt('preloadcmd.done') : tt('group.Favourites')}
							</div>
						)}
						{hasRemove && pickKind !== 'fav' && (
							<div
								class={['settings__button', picking && 'settings__button--active', zone === 'remove' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('remove')}
								onClick={() => setPickMode(!picking, 'remove')}
							>
								{picking ? tt('preloadcmd.done') : tt('settings.uninstallApps')}
							</div>
						)}
						{hasRecent && !picking && (
							<div
								class={['settings__button', recentOn && 'settings__button--active', zone === 'recent' && 'settings__button--focused'].filter(Boolean).join(' ')}
								onMouseEnter={() => setZone('recent')}
								onClick={() => { if (onRecent) onRecent(); }}
							>
								{recentOn ? tt('settings.mostUsedOn') : tt('settings.mostUsedOff')}
							</div>
						)}
						{tab.note && !picking && <p class="settings__note">{tab.note}</p>}
					</div>
				)}
				{tab && (
					<Grid
						items={items}
						checkedKeys={pickKind === 'fav' ? (favourites || []) : pickKind === 'remove' ? [] : keysOf(tab.shown)}
						focused={zone === 'content'}
						selected={gridIndex}
						onSelect={(i) => { setZone('content'); setGridIndex(i); }}
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
				{(helpBody || previewOn) && <HelpPanel title={helpTitle} body={helpBody} left={HELP_LEFT}>{previewOn && homePreview ? homePreview() : null}</HelpPanel>}
				{onOptions && (
					<OptionList
						options={options}
						focused={zone === 'content'}
						selected={optionIndex}
						onSelect={(i) => { setZone('content'); setOptionIndex(i); }}
						onActivate={(i) => { setZone('content'); onOption(options[i].id); }}
						width={PANEL_W}
					/>
				)}
				{about && <p class="settings__about">{about}</p>}
				{pickKind === 'fav' && count === 0 && <p class="settings__hint">{tt('settings.nothingOnTheHome')}</p>}
			</div>
		</div>
	);
}
