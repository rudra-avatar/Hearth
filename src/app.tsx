import {HomeKey} from './screens/HomeKey';
import {Updates} from './screens/Updates';
import {ExtraKeys} from './screens/ExtraKeys';
import {setMonoIcons} from './lib/monoicon';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Home, type Appearance} from './screens/Home';
import {Settings, type SettingsTab} from './screens/Settings';
import {WidgetPreview} from './components/WidgetPreview';
import {HomePreview} from './components/HomePreview';
import {PowerOnPicker, type PowerOnChoice} from './screens/PowerOnPicker';
import {activateSavedTheme, deleteTheme, ensureThemeFonts, loadThemeZip, removeLoadedTheme, readLoadedTheme, saveLoadedTheme, type LoadOutcome} from './lib/theme';
import {themeSlug} from './lib/themeslug';
import type {ThemeData} from './lib/themefile';
import {applyWholeTheme, mismatchText, removeThemeParts, themeMismatch} from './lib/themeapply';
import {activeSlug, savedIndex} from './lib/themelist';
import {isThemeFont} from './lib/clockfont';
import {Picker, type WallpaperChoice} from './screens/Picker';
import {CityPicker} from './screens/CityPicker';
import {Recents} from './screens/Recents';
import {lazyTab} from './lib/lazytab';
import {SourceEditor} from './screens/SourceEditor';
import {iconFromFile} from './lib/customicon';
import {log, logLines, allLogLines} from './lib/log';
import {noteLife, previousLife} from './lib/lifemark';
import {startDelay, TIER2_MS, TIER3_MS} from './lib/startup';
import {debugPages, reportText} from './lib/debuginfo';
import {HEARTH_VERSION} from './config/version';
import {autoIcon, setEdit, type SourceEdit} from './lib/sourceicons';
import {Toast, type ToastMessage} from './components/Toast';
import {PhotoShow, Wallpaper} from './components/Wallpaper';
import type {TileModel} from './components/Tile';
import {forgetTv, pairWithTv} from './lib/ssap';
import {NOROOT_MOCK} from './config/features';
import {cacheApps, cachedApps, listApps, probeRoot, type AppEntry} from './lib/apps';
import {failureText, lastFailure, lastFailureDetail, rootState, whySuffix} from './lib/failure';
import {keepKnownIcons, sameApps} from './lib/appcache';
import type {TimeFormat} from './lib/clock';
import {listInputs, MOCK_INPUTS, readCecDevices, withDeviceNames, type CecDevice, type InputSource} from './lib/inputs';
import {launchApp, launchLgHome, launchSystemSettings} from './lib/launch';
import {lgHomeLearnRequested, openLgHomeByKey} from './lib/lghome';
import {exportThemeBase} from './lib/themeexport';
import {isWebOS} from './lib/luna';
import {listening, resumeListening} from './lib/keydetect';
import {hearthCodes, keyLabel, readRecord, type AutoResult} from './lib/homekeycore';
import {retirePointerBlock} from './lib/pointergone';
import {setEngineAtBoot} from './lib/homeengine';
import {readBinds, syncKeepBind} from './lib/homekey';
import {Notice, type NoticeButton} from './components/Notice';
import {Preload} from './screens/Preload';
import {EssentialsEdit} from './screens/EssentialsEdit';
import {homeAppMessage, readHomeApp, restoreHomeApp, setHearthAsHome} from './lib/homeapp';
import {clearPowerOnApp, powerOnMessage, readPowerOn, restartTv, setPowerOnApp} from './lib/poweron';
import {needsRestart, powerOnName} from './lib/poweroncmd';
import {applyPreload} from './lib/preload';
import {applyKeepReady, readKeepList, readKeepStatus} from './lib/keepready';
import {cleanupDone, cleanupOldBlock} from './lib/noupdate';
import {KEEP_WARNING, keepMessage, keepProblemText, statusMatches} from './lib/keepreadycmd';
import {askKeepAlive, askedRecently} from './lib/keepalive';
import {hidePointerOnForeground, startPointerGuard} from './lib/pointer';
import {startLogFile, writeReport, previousRunLines} from './lib/logfile';
import {readStats, type SystemStats, getLogo, setLogo, closeLgHome} from './lib/system';
import {readInputHookInUse} from './lib/hookguard';
import {getHookStatus, hookMessage, installHomeHook, launchParams, logLine, markAliveSoon, reapplyHomeHook, removeHomeHook, stockHome} from './lib/homehook';
import {SAVER_PHOTOS, SAVER_VIDEO} from './lib/saverconfig';
import {installSaver, reapplySaver, removeSaver, saverMessage, saverSettings, showSaver} from './lib/screensaver';
import {cleanupMessage, removeTakeover} from './lib/takeover';
import {getSamStatus, installSamHome, reapplySamHome, removeSamHome, samMessage, stockSam} from './lib/samhome';
import {t as tt} from './i18n';
import {applyLanguage, removePack, bundledReady, loadBundled, reapply} from './i18n/pack';
import {loadPackFile} from './lib/langpack';
import {PACK_ID, isBundledLanguage} from './lib/languages';
import {applyPref, disabledReason, essentialIds, findPref, homeReplacementOn, GROUP_PREFIX, optionsFor, resetLook, type Press, type PrefTab, type SystemInfo} from './lib/prefs';
import {storeReport} from './lib/storeguard';
import {setProbeContext} from './lib/probecontext';
import {loadConfig, saveConfig, saveConfigVerified, setSaveFailHandler, isMonoStyle, effectiveIconStyle, hasLightTile, toggleId, DEFAULT_WALLPAPER, withBackedUpLook, dropPrefsBackup, type UserConfig} from './lib/storage';
import {readLastOpened, writeLastOpened} from './lib/homefocus';
import {checkColdBoot, markOpened, openedThisPage} from './lib/coldstart';
import {applyTheme, THEMES} from './theme/tokens';
import {setRootVars} from './lib/cssvars';
import {iconInkVars} from './lib/clockcolor';
import {applyBackground, PHOTO_SHOW} from './lib/backgrounds';
import {mark, startupSplit} from './lib/perfmarks';
import {noteFirstScreen} from './lib/firstscreen';
import {aboutText, readHomebrewVersion, readIp, readVersions, type Versions} from './lib/about';
import {useTimeFormat} from './hooks/useTimeFormat';
import {AppMenu} from './components/AppMenu';
import {extendOrder, hiddenAfterUpgrade, toggleHidden, visibleApps} from './lib/apporder';
import {buildTargets, type RemapTarget} from './lib/maptargets';
import {keyFilterRetired, retireKeyFilter} from './lib/remapgone';
import {noteRecent, noteUsage, orderByUsage, readRecent, readUsage, writeRecent, writeUsage} from './lib/recency';
import {addTvInput, removeTvInput, TV_INPUT_LOG} from './lib/tvinput';
import {guardAtStart, noteGuardChange, readBootTrace} from './lib/bootguard';
import {uninstallApp, uninstallVerdict, UNINSTALL_LOG} from './lib/uninstall';
import {undoAll, UNDO_LOG} from './lib/undoallcmd';
import {appTile, inputTile, pickInOrder} from './lib/tiles';
import {orderTiles, orderUpdate, stepKeys} from './lib/tileorder';
import {APP_ID, TIMING} from './config/constants';
import {LEGACY, PLEX_ENABLED, PROBE_ENABLED, WEATHER_ENABLED} from './config/features';
import {PLEX_SOURCE_ID, plexSource} from './lib/plexsource';
import {forgetSet} from './lib/shelves';
import {useShelves} from './hooks/useShelves';
import {readAuth, type PlexAuth} from './lib/plexstore';
import {PlexSignIn} from './screens/PlexSignIn';
import {PROBE_TESTS, RUN_ALL_ID, bad as probeBad, probeOptions, runAll, withLimit, type ProbeState} from './lib/probe';
import {fetchWeather} from './lib/weathernet';
import {FRESH_MS, isFresh, readWeatherCache, usableCached, weatherView, writeWeatherCache, type City, type WeatherData} from './lib/weather';
import {CONNECT_APPS_NOTE} from './config/connectapps';

type Screen = 'home' | 'settings' | 'picker' | 'saverpicker' | 'cities' | 'source' | 'iconpicker' | 'homekey' | 'preload' | 'poweron' | 'extrakeys' | 'themes' | 'languages' | 'updates' | 'essedit' | 'plexsignin';

const TAB = {apps: 'apps', sources: 'sources', appsSources: 'appsources', essentials: 'essentials', look: 'look', clock: 'clock', wallpaper: 'wallpaper', saver: 'saver', system: 'system', debug: 'debug', tests: 'tests'} as const;
const HOME_KEY_MS = 1000;               // p33e: a Home key seen this long before a relaunch makes it a Home press
const DOUBLE_HOME_MIN_MS = 150;        // p33e: two relaunches between these two gaps = Home pressed twice (fallback)
const DOUBLE_HOME_MS = 800;
const HIDDEN_GRACE_MS = 3000;           // p24: hidden for less than this does not close Settings or the other screens
const MISC = {lgHome: 'lg-home', settings: 'settings', system: 'system-settings'} as const;

/** The three tiles that always end the row. */
const MISC_TILES: TileModel[] = [
	{key: MISC.lgHome, get label () { return tt('app.lgHome'); }, glyph: 'house'},          // LF1: getters, the text follows a language change
	{key: MISC.system, get label () { return tt('app.systemSettings'); }, glyph: 'tv'},
	{key: MISC.settings, get label () { return tt('app.hearthSettings'); }, glyph: 'gear'}
];

export function App () {
	// W2: Hearth was left while listening for buttons (the user pressed Home) and starts again within the window: back to the button screen, which finishes the mapping and shows its pop-up
	const [screen, setScreen] = useState<Screen>(() => (listening(resumeListening()) ? 'homekey' : 'home'));
	const settingsOpen = screen !== 'home';   // Settings stays open under its sub-screens (editor, pickers)
	const [config, setConfig] = useState<UserConfig>(loadConfig);
	applyLanguage(config.language);       // T2b: the texts follow the saved language (cheap when nothing changed; a loaded pack was already applied at start-up)
	const [apps, setApps] = useState<AppEntry[]>(cachedApps);      // last known list: the row is drawn at once
	const statsRef = useRef<SystemStats | null>(null);
	const [debugTick, setDebugTick] = useState(0);                    // bumped when the Debug tab opens, so it shows fresh events
	const listInfo = useRef<{source: string; count: number; at: number} | null>(null);
	const weatherNote = useRef('off');
	const [editKey, setEditKey] = useState<string | null>(null);      // the source being edited (Settings → Apps or Sources → hold OK on a tile)
	const [versions, setVersions] = useState<Versions>({});          // shown at the bottom right of Settings (read when Settings opens)
	const [probe, setProbe] = useState<ProbeState>({});            // Tests tab (probe builds only): answers shown in the rows
	const [asleep, setAsleep] = useState(document.hidden);
	const [wakes, setWakes] = useState(0);                    // counts each return to the front and each relaunch (list refresh, screens close)
	const [homeResets, setHomeResets] = useState(0);          // p22b: counts only the genuine returns (back from another app, TV start); only these put the highlight back at its start
	const wasHidden = useRef(document.hidden);
	const screenRef = useRef<Screen>(screen);                // p24: the effect below runs once, so it reads the open screen here
	screenRef.current = screen;
	const homeKeyAt = useRef(0);                              // p33e: when a Home key last reached the page
	const lastRelaunchAt = useRef(0);                         // p33e: when the last relaunch in front came
	const hiddenAt = useRef(0);                               // p24: when the page was first seen hidden (0 = visible)
	const [recents, setRecents] = useState(false);          // the Recent apps panel (Back on the home screen)
	const openRecents = useCallback(() => setRecents(true), []);
	const closeRecents = useCallback(() => setRecents(false), []);
	const [applied] = useState(() => { const l = readLoadedTheme(); return {t: (l ? l.theme : null) as ThemeData | null}; });          // P82: the theme whose parts are in the settings now
	const prevSel = useRef(config.themeSel);
	const [themeRev, setThemeRev] = useState(0);          // P81: bumped when the theme's pictures change, so the tiles are drawn again
	const [notice, setNotice] = useState<{title: string; text: string; buttons: NoticeButton[]; onBack?: () => void} | null>(null);       // a pop-up (warning or question)
	const [hidePractice, setHidePractice] = useState(false);     // R10: the person is trying the Hold OK way before the Settings tile is hidden
	const [tileBack, setTileBack] = useState(false);               // R10: Down x5 showed the hidden Settings tile again, until the next start
	const [menu, setMenu] = useState<{key: string; title: string; app: AppEntry | null; direct?: boolean} | null>(null);   // the tile whose Move / Hide / Uninstall menu is open
	const [focus, setFocus] = useState<{key: string; seq: number} | undefined>(undefined);               // asks Home to follow a moved tile
	const [moveMode, setMoveMode] = useState<{picked: string | null} | null>(null);                     // 2.0.3 T2: the home row's move mode (`picked` = the tile held up)
	const keysRef = useRef<string[]>([]);                                                               // the saved order as it is right now (a second key press before the redraw builds on it)
	const bootFirst = useRef(false);                                   // H1: this page started with the TV: the highlight starts on the first app
	const keyedSinceStart = useRef(false);
	const lastOpened = useRef<string | null>(readLastOpened());       // the app or input opened last (Settings -> Look -> When Home is pressed)
	const recentRef = useRef<string[] | null>(null);                  // the opened tiles, newest first (tie-break of Most used); read when first needed
	const usageRef = useRef<Record<string, number> | null>(null);     // open counts per tile (Settings -> Apps -> Most used); read when first needed
	const noteOpened = useCallback((key: string) => {
		if (lastOpened.current !== key) { lastOpened.current = key; writeLastOpened(key); }
		bootFirst.current = false;          // H3a: until an app is opened after the TV started, the first app stays the highlight
		markOpened();                       // H3a: /tmp/hearth-opened, once per page start
		log(`home: opened tile noted ${key}`);
		const next = noteRecent(recentRef.current || readRecent(), key);
		recentRef.current = next;
		writeRecent(next);          // the row itself reorders when Hearth next comes to the front (see orderedTiles)
		const counts = noteUsage(usageRef.current || readUsage(), key);
		usageRef.current = counts;
		writeUsage(counts);
	}, []);
	const [settingsTab, setSettingsTab] = useState('');            // the Settings tab showing (Widget tab: live preview, P76)
	useEffect(() => { if (screen === 'home' && settingsTab) setSettingsTab(''); }, [screen]);        // Settings opens on its first tab again
	// p22d (user): the Widget preview does not tick; its time is read when the tab opens and again when a clock setting changes
	const [previewNow, setPreviewNow] = useState(() => new Date());
	useEffect(() => { if (screen === 'settings' && settingsTab === TAB.clock) setPreviewNow(new Date()); }, [screen, settingsTab, config.clock, config.clockFormat]);
	const remoteWarned = useRef(false);
	/** R6: once per session, before a remote-button screen opens: what to do if the remote stops answering. */
	const askRemoteWarning = useCallback((go: () => void) => {
		if (remoteWarned.current) { go(); return; }
		setNotice({
			title: tt('app.beforeYouMapButtons'),
			text: tt('app.mappingButtonsChangesHow'),
			buttons: [
				{label: tt('app.proceed'), run: () => { remoteWarned.current = true; setNotice(null); go(); }},
				{label: tt('appmenu.cancel'), tone: 'light', run: () => setNotice(null)}
			],
			onBack: () => setNotice(null)
		});
	}, []);
	const replaceRef = useRef(config.replaceHome || config.samHome);
	const [allInputs, setInputs] = useState<InputSource[]>([]);
	// the launcher itself may be in the TV's input list (see Options): it is not offered as a source
	const inputs = useMemo(() => allInputs.filter((i) => i.appId !== APP_ID), [allInputs]);
	const tvInput: boolean | null = allInputs.length === 0 ? null : allInputs.some((i) => i.appId === APP_ID);
	const [weather, setWeather] = useState<WeatherData | null>(() => (WEATHER_ENABLED ? readWeatherCache() : null));
	const weatherRef = useRef(weather);
	weatherRef.current = weather;
	// PlxNative shelves: the Plex sign-in (lib/plexstore.ts, apart from the settings); the shelves themselves are further down (useShelves)
	const [plexAuth, setPlexAuth] = useState<PlexAuth>(() => (PLEX_ENABLED ? readAuth() : {clientId: '', token: '', account: '', server: null}));
	const [plexStart, setPlexStart] = useState<'account' | 'servers'>('account');
	const plexInfo = {signedIn: !!plexAuth.token, account: plexAuth.account, server: plexAuth.server ? plexAuth.server.name : ''};
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastTimer = useRef(0);
	const closedAt = useRef(0);
	const [systemInfo, setSystemInfo] = useState<SystemInfo>({homeHook: null});
	const [powerOnBusy, setPowerOnBusy] = useState(false);       // "When the TV turns on" is being changed (P55b)
	const tvFormat = useTimeFormat();

	// H3a: no app opened since the TV started (no marker file in /tmp) puts the highlight on the first app until one is opened.
	useEffect(() => {
		if (!isWebOS() || config.homeFocus !== 'last' || rootState() === 'no') return undefined;
		let off = false;
		const onKey = () => { keyedSinceStart.current = true; };
		document.addEventListener('keydown', onKey, true);
		checkColdBoot((opened) => {
			const skip = openedThisPage();          // an app was opened from this page while the answer was pending
			log(`home: no app opened since boot: ${opened ? 'no (marker found)' : skip ? 'yes, but one was opened just now' : 'yes, first app'} (page age ${Math.round(performance.now() / 1000)} s)${!opened && !skip && keyedSinceStart.current ? ' (a key was pressed already: highlight left)' : ''}`);
			if (opened || skip) return;
			bootFirst.current = true;
			if (!keyedSinceStart.current) { setWakes((n) => n + 1); setHomeResets((n) => n + 1); }          // put the highlight on the first app now (nothing has been pressed yet)
		}, () => off);
		return () => { off = true; document.removeEventListener('keydown', onKey, true); };
	}, []);

	// With the hand-over helper on, note in its log how long this launcher took to show its first screen.
	useEffect(() => {
		if (!isWebOS()) return undefined;
		const noHelper = !config.replaceHome && !config.samHome;
		const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
			const began = window.performance && window.performance.timing ? window.performance.timing.navigationStart : 0;
			if (noHelper) {          // P94: no helper (non-root): the line goes to the Debug tab and the last starts are kept
				if (began) noteFirstScreen(`${Date.now() - began} ms after the page started (hidden: ${document.hidden}) launch: ${launchParams()} | ${previousLife()} | ${startupSplit()}`);
				return;
			}
			markAliveSoon(began ? `launcher: first screen ${Date.now() - began} ms after the page started (hidden: ${document.hidden}) launch: ${launchParams()} | keep: ${config.keepReady ? 'on' : 'off'} | ${previousLife()} | ${startupSplit()}` : undefined);
		}));
		return () => window.cancelAnimationFrame(frame);
	}, []);

	// While LG preloaded apps are switched off (Settings -> System -> Memory): tell the TV's preload manager again, a few seconds
	// after the start (it forgets the live change when it restarts; the start-up link does the same at every boot).
	useEffect(() => {
		if (!config.preloadOff || !isWebOS()) return undefined;
		const timer = window.setTimeout(() => { log(`startup: preload at page +${Math.round(performance.now())} ms`); applyPreload(); }, startDelay(TIER3_MS, 6000));
		return () => window.clearTimeout(timer);
	}, []);

	// The helper watcher and the key engine's start-up job are started from main.tsx (lib/earlystart.ts) after the first frame (P56).

	// Colours follow the theme setting.
	useEffect(() => {
		const a = config.fadeStrength / 100;
		setRootVars({'--fade-display': a > 0 ? 'block' : 'none', '--fade-height': `${config.fadeHeight}%`, '--fade-a': String(a), '--fade-b': (a * 0.55).toFixed(3), '--fade-c': (a * 0.2).toFixed(3)});
	}, [config.fadeStrength, config.fadeHeight]);
	useEffect(() => { applyTheme(config.theme); applyBackground(config.background, THEMES[config.theme], config.wallpaper.mode === 'gradient'); }, [config.theme, config.background, config.wallpaper.mode]);
	// P77 Icon colour: overrides the shape colours of the mono styles after the theme's own; Follow theme re-applies the theme (once, only after an override).
	const inkOverridden = useRef(false);
	useEffect(() => {
		const vars = isMonoStyle(effectiveIconStyle(config.iconStyle, config.theme)) ? iconInkVars(config.iconColor, config.iconLight) : null;
		if (!vars && !inkOverridden.current) return;
		applyTheme(config.theme);
		inkOverridden.current = !!vars;
		if (vars) setRootVars(vars);
	}, [config.theme, config.iconColor, config.iconStyle, config.iconLight]);

	// P80: a font of the loaded theme is read from the TV only when the widget or the names use it (nothing otherwise)
	useEffect(() => { if (isThemeFont(config.clock.font) || isThemeFont(config.labelFont)) ensureThemeFonts([config.clock.font, config.labelFont]); }, [config.clock.font, config.labelFont]);
	// P81: a saved theme picked under Current theme (← →) is brought back and applied; the theme already in use is left alone
	useEffect(() => {
		const sel = config.themeSel;
		if (!sel || sel === activeSlug() || !savedIndex().some((t) => t.slug === sel)) return;
		activateSavedTheme(sel, apps.map((a) => a.id)).then((o) => { if (o.ok) afterTheme(o, tt('app.themeSwitched')); else showToast(o.reason, 'error'); });
	}, [config.themeSel]);   // eslint-disable-line react-hooks/exhaustive-deps
	// P82: stepping to a built-in theme takes the loaded theme off: what it set goes back to the defaults, the chosen built-in theme stays
	useEffect(() => {
		const was = prevSel.current;
		prevSel.current = config.themeSel;
		const t = applied.t;
		if (config.themeSel || !was || !t) return;
		applied.t = null;
		const unsaved = !savedIndex().some((x) => x.slug === was);
		removeLoadedTheme().then(() => {
			setConfig((c) => { const next = {...removeThemeParts(c, t), theme: c.theme}; saveConfig(next); return next; });
			setThemeRev((n) => n + 1);
			showToast(unsaved ? tt('app.themeTakenOffIt') : tt('app.themeTakenOff'));
		});
	}, [config.themeSel]);   // eslint-disable-line react-hooks/exhaustive-deps
	const iconStyle = effectiveIconStyle(config.iconStyle, config.theme);          // Accent mono is not offered in OLED black
	useEffect(() => { document.documentElement.classList.toggle('look-minimal', config.minimal || iconStyle === 'glyph'); }, [config.minimal, iconStyle]);   // W1: Glyph uses Minimal's focus (larger only, no ring)
	// Dark mono icons: the tile background and the shape colour come from the theme (OLED black: pure #000, pixels off)
	useEffect(() => {
		const el = document.documentElement.classList;
		el.toggle('mono', isMonoStyle(iconStyle));
		for (const k of ['soft', 'accent', 'gradient', 'glyph']) el.toggle(`mono-${k}`, iconStyle === k);
		el.toggle('tinted', iconStyle === 'tinted');
		el.toggle('mono-light', config.iconLight && hasLightTile(iconStyle));          // P59b: light tile, dark shape
	}, [iconStyle, config.iconLight]);

	useEffect(() => { log(`Hearth ${HEARTH_VERSION} started${NOROOT_MOCK ? ' (MOCK NON-ROOT TEST BUILD: root calls are disabled)' : ''}`); return startLogFile(TIMING.backgroundWorkMs + 1000); }, []);

	const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
		window.clearTimeout(toastTimer.current);
		if (kind === 'error') log('Problem shown: ' + text);
		setToast({text, kind});
		toastTimer.current = window.setTimeout(() => setToast(null), TIMING.toastMs);
	}, []);

	// Phase 3a: the LG Home button job found no key device and opened Hearth with a request to learn it (lghome.ts); also read once at page start
	const lgLearning = useRef(false);
	const lgLearnRef = useRef<() => void>(() => undefined);
	lgLearnRef.current = () => {
		if (lgLearning.current) return;
		lgLearning.current = true;
		openLgHomeByKey(() => showToast(tt('app.pressHomeOnYour')))
			.then((r) => { if (r === 'learned') showToast(tt('app.homeKeyLearned')); else if (r !== 'sent') showToast(tt('app.couldnTOpenLg'), 'error'); })
			.then(() => { lgLearning.current = false; }, () => { lgLearning.current = false; });
	};
	useEffect(() => { if (lgHomeLearnRequested(undefined, true)) lgLearnRef.current(); }, []);

	// I2: a save that fails even after freeing caches tells the user once per start; the Debug report gets the store sizes (Debug tab on only, after the 30 s tier)
	useEffect(() => { setSaveFailHandler(() => showToast(tt('app.settingsNotSaved'), 'error')); return () => setSaveFailHandler(null); }, [showToast]);
	useEffect(() => {
		if (!config.showDebug) return;
		const timer = window.setTimeout(() => { try { storeReport(localStorage).forEach((l) => log(l)); } catch { /* no figures */ } }, startDelay(TIER3_MS, 3000));
		return () => window.clearTimeout(timer);
	}, [config.showDebug]);

	// J: state line written with tests 37 and 44 (the latest settings are read through a ref; nothing runs until a test asks)
	const ctxRef = useRef({config, systemInfo});
	ctxRef.current = {config, systemInfo};
	useEffect(() => {
		setProbeContext(() => {
			const {config: c, systemInfo: si} = ctxRef.current;
			return `state: theme ${c.theme}, backdrop ${c.clock.show ? (c.clock.scrim || 'off') : 'widget off'}, wallpaper ${c.wallpaper.mode}/${c.wallpaper.intervalSec}s bg ${c.background}, helper ${si.homeHook && si.homeHook.running ? 'on' : 'off'}, SAM ${c.samHome ? 'on' : 'off'}, keep-ready ${c.keepReady ? 'on' : 'off'}, ${storeReport(localStorage)[0]}`;
		});
		return () => setProbeContext(null);
	}, []);

	// T4: a bundled language is copied from the app folder the first time it is picked (and once after an update); no root needed.
	const [langTick, setLangTick] = useState(0);      // LF1: part of the memo lists below, so a language that finishes loading rebuilds every text kept in them
	useEffect(() => {
		const id = config.language;
		if (!isBundledLanguage(id) || bundledReady(id)) return;
		let live = true;
		loadBundled(id).then((ok) => {
			if (!live) return;
			if (ok) { reapply(); setLangTick((n) => n + 1); return; }
			showToast(tt('app.languageCouldNotLoad'), 'error');
			setConfig((c) => { if (c.language !== id) return c; const next = {...c, language: 'en'}; saveConfig(next); return next; });
		});
		return () => { live = false; };
	}, [config.language]);

	// P69/P73/P74 Keep Hearth ready (experimental, one switch). A change in Settings is applied 1.5 s after the last press.
	const keepSeen = useRef(config.keepReady);
	const relaunchSeen = useRef(config.keepRelaunch);
	// A failure (from the TV script or at the start-up check): the switch goes back to Off, the TV is cleaned up, the reason is shown.
	const keepFailed = useCallback((why: string) => {
		keepSeen.current = false;
		setConfig((c) => { const next = {...c, keepReady: false}; saveConfig(next); return next; });
		log(`keep: failed, switched off: ${why}`);
		syncKeepBind(false).then(() => applyKeepReady(false));
		showToast(tt('app.keepHearthReadyIs', {why}), 'error');
	}, [showToast]);
	useEffect(() => {
		if ((config.keepReady === keepSeen.current && config.keepRelaunch === relaunchSeen.current) || !isWebOS()) return undefined;
		const turned = config.keepReady !== keepSeen.current;
		keepSeen.current = config.keepReady;
		relaunchSeen.current = config.keepRelaunch;
		const on = config.keepReady;
		const relaunch = config.keepRelaunch;
		if (!on && !turned) return undefined;
		const timer = window.setTimeout(() => {
			// P71: the Home button's form follows the switch (script with keepAlive on; plain launch before everything is removed)
			(on ? Promise.resolve('') : syncKeepBind(false).then(() => '')).then(() => {
				if (on) showToast(tt('app.turningOnThisTakes'));
				return applyKeepReady(on, relaunch);
			}).then((why) => {
				if (why && on) { keepFailed(why); return; }
				showToast(keepMessage(on, !why, why), why ? 'error' : 'info');
				if (!why && on && turned) { askKeepAlive(); syncKeepBind(true).then((bad) => { if (bad) log(`keep: Home button not changed: ${bad}`); }); }
			});
		}, 1500);
		return () => window.clearTimeout(timer);
	}, [config.keepReady, config.keepRelaunch]);
	// At every start with the switch on: ask the TV to keep this page alive (a page the TV started itself has no keepAlive), and
	// read what the TV script did (a failure switches the setting off, a script that is still working is left alone, a TV
	// that lost the setting gets it again).
	useEffect(() => {
		if (!config.keepReady || !isWebOS()) return undefined;
		// P70c: the switch is read when the timer fires (keepSeen follows Settings), not the value of the page start
		const first = window.setTimeout(() => { if (keepSeen.current) askKeepAlive(); }, startDelay(8000, 3000));
		const second = window.setTimeout(() => {
			if (!keepSeen.current) return;
			readKeepStatus().then((status) => {
				if (!keepSeen.current) return;
				const bad = status ? keepProblemText(status.state) : null;
				if (bad) { keepFailed(bad); return; }
				if (status && status.state === 'working') return;
				if (!statusMatches(status, true, relaunchSeen.current)) applyKeepReady(true, relaunchSeen.current).then((why) => { if (why) keepFailed(why); });
			});
			syncKeepBind(true).then((bad) => { if (bad) log(`keep: Home button not changed: ${bad}`); });
		}, startDelay(TIER3_MS, 6000));
		return () => { window.clearTimeout(first); window.clearTimeout(second); };
	}, []);

	// Start in remote (5-way) mode: hide the Magic Remote pointer whenever we come to the
	// front. Shaking the remote still brings it back.
	useEffect(() => hidePointerOnForeground(), []);
	useEffect(() => { startPointerGuard(); }, []);
	// 2.1.6: once per TV, take away what the removed update-block row and the pop-up probes left behind (nothing runs when it is already done)
	useEffect(() => {
		if (!isWebOS() || cleanupDone()) return undefined;
		const t = window.setTimeout(() => { cleanupOldBlock(); }, startDelay(TIER3_MS, 9000));
		return () => window.clearTimeout(t);
	}, []);
	// p33g: the removed *Block the Magic Remote pointer* row: a leftover ignore entry for button 1198 (test builds only) is given back once, silently
	useEffect(() => {
		if (!isWebOS()) return undefined;
		const t = window.setTimeout(() => { retirePointerBlock(); }, startDelay(TIER3_MS, 9000));
		return () => window.clearTimeout(t);
	}, []);
	// A button maps to Hearth: make sure the key engine's own start-up link is in place (repairs TVs set up before the engine had its own link).
	useEffect(() => {
		if (!isWebOS() || !readRecord()) return undefined;
		const t = window.setTimeout(() => { log(`startup: engine link check at page +${Math.round(performance.now())} ms`); setEngineAtBoot(true, true); }, startDelay(TIER3_MS, 8000));
		return () => window.clearTimeout(t);
	}, []);

	// Load apps at start and whenever the Homebrew option changes. With a saved list on screen the real one is
	// fetched a few seconds later, off the critical path. It is fetched again each time the launcher comes back to
	// the front (at most every 10 s), so a newly installed app shows up without restarting the launcher.
	//
	// The saved list is the full Homebrew list (with its icons), and it is only ever replaced by a newer full list.
	// Just after the TV starts the Homebrew service is often not up yet: the saved list then stays on screen, and
	// the read is tried again a little later, quietly. The small built-in catalogue is used only when there is no
	// saved list at all (the very first start).
	const hadCache = useRef(apps.length > 0);
	const haveFull = useRef(apps.length > 0);           // the list on screen is a full Homebrew list
	const appsRef = useRef(apps);
	appsRef.current = apps;
	const lastLoad = useRef(0);
	const tvAppsRef = useRef(false);
	tvAppsRef.current = config.tvApps;
	const seenWakes = useRef(0);
	const [reloads, setReloads] = useState(0);        // the "Refresh list" button in Settings → Apps
	const manualLoad = useRef(false);
	useEffect(() => {
		const woke = wakes !== seenWakes.current;
		seenWakes.current = wakes;
		const manual = manualLoad.current;               // asked for with the button: now, and say what happened
		manualLoad.current = false;
		if (woke && !manual && Date.now() - lastLoad.current < 10000) return undefined;
		let cancelled = false;
		let timer = 0;
		const retryAfter = [15000, 45000, 120000, 300000];      // quiet retries when the Homebrew service does not answer
		let told = false;
		// Settings from an older version listed the apps to show: now the real list is known, keep those apps hidden.
		// Apps not in the saved order yet (newly installed) go after the last app of the row, and stay there.
		const rememberApps = (list: AppEntry[]) => {
			if (list.length === 0) return;
			setConfig((c) => {
				if (c.hiddenIds === null) { const next = {...c, hiddenIds: hiddenAfterUpgrade(list, c.appIds)}; saveConfig(next); return next; }
				const order = extendOrder(list, c.appIds);
				if (order === c.appIds) return c;
				const next = {...c, appIds: order};
				saveConfig(next);
				return next;
			});
		};
		const load = (attempt: number) => {
			if (cancelled) return;
			const keepSaved = haveFull.current;
			const retry = () => { if (!cancelled && attempt < retryAfter.length) timer = window.setTimeout(() => { if (document.hidden) return; load(attempt + 1); }, retryAfter[attempt]); };
			listApps(keepSaved, tvAppsRef.current)
				.then(({apps: fresh, source}) => {
					if (cancelled) return;
					mark(`apps (${source})`);
					if (source !== 'catalog') {
						const list = keepKnownIcons(fresh, appsRef.current);
						if (manual) {
							const added = list.filter((a) => !appsRef.current.some((p) => p.id === a.id)).length;
							showToast(added > 0 ? (added === 1 ? tt('app.oneNewApp') : tt('app.newApps', {added})) : tt('app.theAppListIs'));
						}
						lastLoad.current = Date.now();       // counted only once a full list has been read, so a failed load is tried again
						haveFull.current = true;
						setApps((previous) => (sameApps(previous, list) ? previous : list));
						cacheApps(list);
						// settings from an older version listed the apps to show: now the real list is known, keep those apps hidden
						rememberApps(list);
						listInfo.current = {source, count: list.length, at: Date.now()};
						log(`App list: ${list.length} apps from ${source === 'tv' ? "the TV's remote-control service (experimental)" : 'the Homebrew Channel'}`);
						return;
					}
					// only the built-in catalogue was available (nothing saved yet, or the TV is not rooted)
					setApps((previous) => (sameApps(previous, fresh) ? previous : fresh));
					listInfo.current = {source: 'catalog', count: fresh.length, at: Date.now()};
					log(`App list: ${fresh.length} apps from the built-in list (the live list was not available)`);
					if (rootState() === 'no') rememberApps(fresh);      // a settled list (not a stop-gap while the service starts)
					offerNoRoot();                                       // P83: once per start, only while root has failed
					lastLoad.current = 0;
					if ((manual || !told) && rootState() !== 'no') { told = true; showToast(tt('app.builtInList', {why: whySuffix() || tt('app.homebrewNotYet')}), 'error'); }
					retry();
				})
				.catch(() => {
					if (cancelled) return;
					// the saved full list stays on screen; try again later without a word
					if (haveFull.current) retry();
					else if (manual || !told) { told = true; showToast(tt('app.couldNotReadThe', {why: whySuffix()}), 'error'); }
				});
		};
		// Not needed to draw the home screen, and it is a lot of work for the TV (a shell command and the icons), so
		// it waits until the launcher has been up for a few seconds (at once only when there is no saved list to show).
		timer = window.setTimeout(() => { if (woke && document.hidden) return; log(`startup: app list at page +${Math.round(performance.now())} ms`); load(0); }, hadCache.current || woke ? (woke ? TIMING.backgroundWorkMs : startDelay(TIER2_MS, TIMING.backgroundWorkMs)) : 0);
		hadCache.current = false;
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [wakes, reloads, showToast]);

	// In the background the launcher lets go of its wallpaper (the big bitmap) and stops its clock, but it
	// keeps its screen: if the TV ever reports "hidden" wrongly, the launcher must still be visible,
	// not a black screen. The state is also re-read every second as a safety net.
	replaceRef.current = config.replaceHome || config.samHome;
	// X1: Home pressed while the key mapper listens: it stays open (and keeps reading the key log) when Hearth comes back; every other screen goes home
	const keepKeyMapper = (s: Screen): Screen => (s === 'homekey' && listening(resumeListening()) ? s : 'home');
	useEffect(() => {
		let hiddenTimer = 0;
		const leaveScreens = (why: string) => {
			if (screenRef.current !== 'home') log(`screen: ${screenRef.current} closed, ${why}`);
			setScreen(keepKeyMapper); setMenu(null); setRecents(false);
		};
		// timers may stand still while hidden, so the decision is also taken on return (above); this one frees the screen if the page stays hidden
		const armHiddenClose = () => { window.clearTimeout(hiddenTimer); hiddenTimer = window.setTimeout(() => { if (document.hidden) leaveScreens('hidden, timer'); }, HIDDEN_GRACE_MS + 250); };
		const sync = (why: string) => {
			const before = wasHidden.current;
			const hidden = document.hidden;
			if (hidden && !hiddenAt.current) { hiddenAt.current = Date.now(); armHiddenClose(); }
			const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
			if (!hidden) { hiddenAt.current = 0; window.clearTimeout(hiddenTimer); }
			if (wasHidden.current && !hidden) {
				setWakes((n) => n + 1);
				setHomeResets((n) => n + 1);          // p22b: back from another app: the highlight starts again as *When Home is pressed* says
				log('home: highlight reset (back from another app)');
				// W1 probe: how long the first frames after a return take (the Debug report shows it)
				const t0 = performance.now();
				window.requestAnimationFrame(() => window.requestAnimationFrame(() => log(`wallpaper: return, second frame after ${Math.round(performance.now() - t0)} ms`)));
			}
			if (wasHidden.current !== hidden) { noteLife(hidden); try { document.dispatchEvent(new Event('hearth-visibility')); } catch (e) { /* old web view: the real event still reaches the wallpaper */ } }
			wasHidden.current = hidden;
			setAsleep((was) => {
				if (was !== hidden && replaceRef.current) {
					// the helper checks for the "alive" mark after opening the launcher
					if (hidden) logLine(`launcher: hidden (${why})`);
					else markAliveSoon(`launcher: visible (${why})`);
				}
				return hidden;
			});
			// p24: screens close only when the person really went elsewhere (hidden for HIDDEN_GRACE_MS or more), not on a short "hidden"
			// flicker of the TV (an overlay, an input change, a helper relaunch): such a flicker used to throw the person out of Settings
			if (hidden ? Date.now() - hiddenAt.current >= HIDDEN_GRACE_MS : before && away >= HIDDEN_GRACE_MS) leaveScreens(`hidden ${hidden ? 'for good' : away + ' ms, back'} (${why})`);
			else if (before && !hidden && screenRef.current !== 'home') log(`screen: hidden for only ${away} ms (${why}), ${screenRef.current} kept`);
		};
		const onVisibility = () => sync('event');
		document.addEventListener('visibilitychange', onVisibility);
		const poll = window.setInterval(() => sync('check'), 1000);
		// Home pressed while the launcher is already in front: the TV relaunches it without hiding it first.
		let lastRelaunchNote = 0;
		const onHomeKey = (e: KeyboardEvent) => { if (e.keyCode === 773 || e.keyCode === 774 || e.keyCode === 125) homeKeyAt.current = Date.now(); };
		window.addEventListener('keydown', onHomeKey, true);
		const onRelaunch = (ev?: Event) => {
			if (lgHomeLearnRequested(ev && (ev as CustomEvent).detail)) lgLearnRef.current();    // the LG Home button job found no key device (lghome.ts)
			if (askedRecently()) { log('keep: relaunch event from the keepAlive request ignored'); return; }
			const inFront = !document.hidden && !wasHidden.current;
			// p24: a relaunch while Hearth is in front and a screen (Settings, a picker) is open does not close it: the TV, the helper or an update send
			// such relaunches by themselves, nothing tells them from a Home press, and they threw the person out of Settings (Back still leaves it)
			// p33e (user 2026-11-11): Home leaves an open screen when it is a real Home press. A: a Home key (773/774/125) reached the page within 1 s
			// before the relaunch; C (fallback, when the key never reaches the page): two relaunches 150-800 ms apart = Home pressed twice.
			const nowT = Date.now();
			const homeKey = nowT - homeKeyAt.current < HOME_KEY_MS;
			const twice = lastRelaunchAt.current > 0 && nowT - lastRelaunchAt.current >= DOUBLE_HOME_MIN_MS && nowT - lastRelaunchAt.current <= DOUBLE_HOME_MS;
			lastRelaunchAt.current = nowT;
			const homePress = inFront && screenRef.current !== 'home' && (homeKey || twice);
			if (homePress) log(`screen: Home press (${homeKey ? 'key seen' : 'pressed twice'}), ${screenRef.current} left`);
			if (inFront && screenRef.current !== 'home' && !homePress) log(`screen: relaunch while in front, ${screenRef.current} kept`);
			else { setScreen(keepKeyMapper); setMenu(null); setRecents(false); setWakes((n) => n + 1); }
			// p22b: Hearth was in front already, so nobody came back: the highlight stays where the person put it (the TV, the helper or an update
			// send such relaunches in bursts, and each one used to put the highlight back on the first app while the person was browsing)
			if (inFront && screenRef.current === 'home') log('home: relaunch while in front, highlight kept');
			// a burst of presses makes one note and one touch set per 2.5 s
			const now = Date.now();
			if (now - lastRelaunchNote < 2500) return;
			lastRelaunchNote = now;
			// Home pressed while in front: the launcher never became hidden, so tell the helper it is here
			// (otherwise its check could think the launcher failed to show and open it again and again)
			if (replaceRef.current) markAliveSoon('launcher: relaunched while in front');
		};
		document.addEventListener('webOSRelaunch', onRelaunch);
		return () => { document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('webOSRelaunch', onRelaunch); window.removeEventListener('keydown', onHomeKey, true); window.clearInterval(poll); };
	}, []);

	const recentIcons = useMemo(() => { const m: Record<string, string | undefined> = {}; apps.forEach((a) => { m[a.id] = a.iconUrl; }); return m; }, [apps]);

	// The bundled-photo slideshow is drawn (and timed) by PhotoShow; it pauses while the launcher is in the background.
	const photoShow = config.background === PHOTO_SHOW && config.wallpaper.mode === 'gradient';

	// W1 (user 2026-11-07): the wallpaper is never released while Hearth runs (one decoded photo, about 8 MB), so coming back from an app
	// finds it ready: no rebuild, no second decode, no wipe. The slideshow only pauses its timer while hidden (`PhotoShow paused`).
	// Inputs are only read when they're needed: some are on the home row, or Settings is open.
	const needInputs = config.sourceIds.length > 0 || screen === 'settings';
	const cecNames = config.inputStatus;
	useEffect(() => {
		if (!needInputs) return undefined;
		let stopped = false;
		let retry = 0;
		let cecTimer = 0;
		let cecSeen: CecDevice[] = [];   // device names read earlier, so a refresh does not blink them away
		const DELAYS = [2500, 6000, 15000, 30000];   // the TV's input service can answer late right after a boot: ask again quietly
		const refresh = () => {
			if (!isWebOS()) { setInputs(MOCK_INPUTS); return; }
			const again = (why: string) => {
				log(`inputs: ${why} (try ${retry + 1})`);
				if (stopped || retry >= DELAYS.length) return;
				retry++;
				window.setTimeout(() => { if (!stopped) refresh(); }, DELAYS[retry - 1]);
			};
			listInputs().then((list) => {
				if (stopped) return;
				setInputs(cecNames ? withDeviceNames(list, cecSeen) : list);
				if (list.length === 0) again('empty list'); else retry = 0;
				// P62: device names need one root command; it waits for the late start-up tier, is read only when something is plugged in, and is not repeated on a timer
				if (cecNames && list.some((i) => i.connected && i.id.indexOf('HDMI') === 0)) {
					window.clearTimeout(cecTimer);
					cecTimer = window.setTimeout(() => { readCecDevices().then((cec) => { if (stopped || !cec.length) return; cecSeen = cec; setInputs(withDeviceNames(list, cec)); }); }, startDelay(TIER3_MS, 1500));
				}
			}, (e) => { again(`read failed: ${e && e.message ? e.message : e}`); });
		};
		refresh();
		const onVisibility = () => { if (!document.hidden) { retry = 0; refresh(); } };
		document.addEventListener('visibilitychange', onVisibility);
		return () => { stopped = true; window.clearTimeout(cecTimer); document.removeEventListener('visibilitychange', onVisibility); };
	}, [needInputs, cecNames, showToast]);

	// Status reads for the Settings rows. L1b: they start after the first paint (not while Settings opens, when several root shell
	// commands would compete with the drawing) and land in one update each, so Settings is redrawn once or twice, not five times.
	useEffect(() => {
		if (!settingsOpen) return undefined;
		const t0 = performance.now();
		const since = () => Math.round(performance.now() - t0);
		log('settings: opened');
		let live = true;
		let timer = 0;
		const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
			if (!live) return;
			log(`settings: first paint +${since()} ms`);
			timer = window.setTimeout(() => {
				if (!live) return;
				if (isWebOS()) {
					// note the real size of the screen in the helper's log: this is what to look at if a list ever looks wrong on some TV
					const chrome = /Chrome\/([0-9.]+)/.exec(navigator.userAgent);
					logLine(`launcher: settings opened, window ${window.innerWidth}x${window.innerHeight}, pixel ratio ${window.devicePixelRatio}, screen ${window.screen.width}x${window.screen.height}, web view ${chrome ? chrome[1] : 'unknown'}`);
				}
				// One tiny command first: can this TV run commands at all? If not, the rows that need that are greyed out
				// with the reason, and the other status reads (which would only fail) are skipped.
				const plain = Promise.all([readVersions(), readIp()]).then(([v, ip]) => { if (live) setVersions((p) => ({...p, ...v, ...(ip ? {ip} : {})})); });
				const rooted = probeRoot().then((root) => {
					const rootDetail = lastFailureDetail();
					log(root === 'yes' ? 'Root check: the Homebrew Channel answered' : `Root check: not available (${rootDetail || 'no answer'})`);
					log(`settings: root check answered +${since()} ms`);
					if (!live) return undefined;
					if (root === 'no') { setSystemInfo({homeApp: null, homeHook: null, logo: null, powerOn: null, root, rootDetail}); return undefined; }
					return Promise.all([getHookStatus(), getLogo(), readPowerOn(), readHomeApp(), readInputHookInUse(), root === 'yes' ? readHomebrewVersion() : Promise.resolve(undefined), getSamStatus()]).then(([homeHook, logo, powerOn, homeApp, inputHook, homebrew, samHome]) => {
						if (!live) return;
						setSystemInfo((previous) => ({homeApp, homeHook, samHome, logo, powerOn, root, rootDetail, inputHook, keepList: previous.keepList, samBusy: previous.samBusy}));
						readKeepList().then((keepList) => { if (live && keepList !== null) setSystemInfo((previous) => ({...previous, keepList})); });     // K2: apart, so the other rows never wait for it
						if (homebrew) setVersions((p) => ({...p, homebrew}));
						log(`settings: status reads done +${since()} ms`);
					});
				});
				Promise.all([plain, rooted]).then(() => { if (live) log(`settings: all reads answered +${since()} ms`); });
			}, 250);
		}));
		return () => { live = false; window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
	}, [settingsOpen]);

	// One-time clean-up of the removed SAM method ("Replace LG Home with a script and SAM", gone since P28r): a TV whose saved
	// settings say it was on gets it switched off a few seconds after start (LG Home's own place is given back, the old files
	// and the start-up link are deleted). It never turns anything else on: the helper script is the user's choice.
	useEffect(() => {
		if (!config.takeoverHome || config.samHome || !isWebOS()) return undefined;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			showToast(tt('app.removingTheOldSam'));
			removeTakeover().then((freed) => {
				if (freed) setConfig((c) => { const next = {...c, takeoverHome: false}; saveConfig(next); return next; });
				if (!cancelled || freed) showToast(cleanupMessage(freed), freed ? 'info' : 'error');
			});
		}, startDelay(TIER3_MS, 5000));
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [config.takeoverHome, config.samHome, showToast]);

	// Screen saver (when on): a few seconds after start, and whenever what it plays or how it plays changes, make sure the files
	// on the TV are current and mounted. A change is sent after a short pause so stepping through values sends only the last one.
	const saverKey = config.screensaver ? JSON.stringify(saverSettings(config)) : '';
	const saverFirst = useRef(true);
	useEffect(() => {
		if (!saverKey || !isWebOS()) return undefined;
		const first = saverFirst.current;
		saverFirst.current = false;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			reapplySaver(config).then((r) => {
				if (cancelled || r.unreachable) return;
				if (r.fatal) { setConfig((c) => { const next = {...c, screensaver: false}; saveConfig(next); return next; }); showToast(saverMessage(r.result, r.detail), 'error'); }
				else if (r.result === 'failed') showToast(saverMessage(r.result, r.detail), 'error');
			});
		}, first ? startDelay(TIER3_MS, 4000) : 1500);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [saverKey, showToast]);

	// Shortly after we come to the front (not at the very first moment, while the TV is still switching
	// apps): make sure the hand-over helper is running (if it is switched on), and end LG's home app to
	// free memory. If we are pushed to the back again within seconds, LG Home has come back in front of
	// us, so "Close LG Home" turns itself off (not needed when the helper is on: it hands straight back).
	useEffect(() => {
		if (!isWebOS()) return undefined;
		let timer = 0;
		let retryTimer = 0;
		const arm = () => {
			window.clearTimeout(timer);
			window.clearTimeout(retryTimer);
			if (document.hidden) return;
			timer = window.setTimeout(() => {
				if (config.closeHome) closedAt.current = Date.now();
				if (config.replaceHome) {
					// The Homebrew service is often not up yet just after the TV starts: then nothing is changed
					// (the setting stays on) and it is tried again a little later.
					const tryHelper = (attempt: number) => reapplyHomeHook().then(({result, detail, fatal, unreachable}) => {
						if (unreachable) {
							if (attempt < 4) retryTimer = window.setTimeout(() => { if (!document.hidden) tryHelper(attempt + 1); }, [10000, 30000, 90000, 240000][attempt]);
							return;
						}
						if (!fatal) return;
						setConfig((c) => { const next = {...c, replaceHome: false}; saveConfig(next); return next; });
						removeHomeHook();
						showToast(hookMessage(result, detail), 'error');
					});
					tryHelper(0);
				}
				if (config.samHome) {
					// 2.0.3 (R3): the SAM stand-in is kept in place the same way (files from an older Hearth are rewritten, nothing is switched)
					const trySam = (attempt: number) => reapplySamHome().then(({result, detail, fatal, unreachable}) => {
						if (unreachable) {
							if (attempt < 4) retryTimer = window.setTimeout(() => { if (!document.hidden) trySam(attempt + 1); }, [10000, 30000, 90000, 240000][attempt]);
							return;
						}
						if (!fatal) return;
						setConfig((c) => { const next = {...c, samHome: false}; saveConfig(next); return next; });
						removeSamHome();
						showToast(samMessage(result, detail), 'error');
					});
					trySam(0);
				}
				if (config.closeHome || config.replaceHome) closeLgHome().catch(() => undefined);      // the Homebrew service may not be up yet: nothing to do then
			}, TIMING.backgroundWorkMs);
		};
		const onVisibility = () => {
			if (config.closeHome && !config.replaceHome && document.hidden && Date.now() - closedAt.current < 2500) {
				setConfig((c) => { const next = {...c, closeHome: false}; saveConfig(next); return next; });
				try { localStorage.setItem('customlauncher-homekill-off', '1'); } catch { /* ignore */ }
			}
			arm();
		};
		arm();
		document.addEventListener('visibilitychange', onVisibility);
		return () => { window.clearTimeout(timer); window.clearTimeout(retryTimer); document.removeEventListener('visibilitychange', onVisibility); };
	}, [config.closeHome, config.replaceHome, config.samHome, showToast]);

	// 2.0.3 (S3c, webOS 3 only): Hearth reached its screen, so the boot guard (on while the TV input or the power-on app
	// is on) sets its count of boots without Hearth back to 0. If the guard switched the rows off by itself after boots that
	// never reached Hearth, say so once. The Homebrew service is often not up yet just after the TV starts: tried again later.
	useEffect(() => {
		if (!LEGACY || !isWebOS() || rootState() === 'no') return undefined;
		let timer = 0;
		let done = false;
		let running = false;
		const attempt = (n: number) => {
			window.clearTimeout(timer);
			if (done || running || document.hidden) return;
			timer = window.setTimeout(() => {
				if (done || running || document.hidden) return;
				running = true;
				guardAtStart().then((state) => {
					running = false;
					if (state === 'unreachable') {
						if (n < 4) timer = window.setTimeout(() => attempt(n + 1), [10000, 30000, 90000, 240000][n]);
						return;
					}
					done = true;
					if (state !== 'reverted') return;
					log('bootguard: the guard switched the TV input / power-on app off after boots that never reached Hearth');
					showToast(tt('app.bootGuardReverted'), 'error');
					readPowerOn().then((status) => {       // the saved power-on choice follows what the TV has now
						if (status) setConfig((c) => { const next = {...c, powerOnApp: status.chosen, powerOnNetwork: status.network}; saveConfig(next); return next; });
					});
				});
			}, n === 0 ? TIMING.backgroundWorkMs : 0);
		};
		const onVisibility = () => { if (!document.hidden) attempt(0); };
		attempt(0);
		document.addEventListener('visibilitychange', onVisibility);
		return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
	}, [showToast]);

	// The weather line: read from the saved copy at once (nothing is fetched to draw the home screen), refreshed in
	// the background a few seconds after the launcher appears, and then every 30 minutes while it is in front.
	const wx = config.weather;
	const wxCity: City | null = WEATHER_ENABLED && wx.on ? wx.city : null;
	const wxLat = wxCity ? wxCity.lat : 0;
	const wxLon = wxCity ? wxCity.lon : 0;
	useEffect(() => {
		if (!wxCity) return undefined;
		const city = wxCity;
		const allowShell = isWebOS();
		const backoff = [120000, 600000, 1800000];
		let cancelled = false;
		let timer = 0;
		let failures = 0;
		const run = () => {
			if (cancelled || document.hidden) return;        // coming back to the front starts this over
			fetchWeather(city, allowShell).then(
				(data) => {
					if (cancelled) return;
					failures = 0;
					weatherNote.current = 'updated ' + new Date().toTimeString().slice(0, 5);
					log('Weather updated');
					writeWeatherCache(data);
					setWeather(data);
					timer = window.setTimeout(run, FRESH_MS);
				},
				() => {
					if (cancelled) return;
					weatherNote.current = 'could not be fetched';
					log('Weather could not be fetched');
					if (failures === 0 && !usableCached(weatherRef.current, city.lat, city.lon, Date.now())) showToast(tt('app.couldnTGetThe'), 'error');
					timer = window.setTimeout(run, backoff[Math.min(failures, backoff.length - 1)]);
					failures++;
				}
			);
		};
		const now = Date.now();
		const known = weatherRef.current;
		const wait = isFresh(known, city.lat, city.lon, now) && known
			? Math.max(0, FRESH_MS - (now - known.at))
			: (usableCached(known, city.lat, city.lon, now) ? startDelay(TIER2_MS, TIMING.backgroundWorkMs) : 1500);
		timer = window.setTimeout(run, wait);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [wxCity !== null, wxLat, wxLon, wakes, showToast]);

	const weatherLine = useMemo(() => {
		if (!wxCity) return null;
		const data = usableCached(weather, wxCity.lat, wxCity.lon, Date.now());
		return data ? weatherView(data, wx.unit, wx.showRange, wx.showCity ? wxCity.name : '') : null;
	}, [weather, wxCity, wx.unit, wx.showRange, wx.showCity, config.language, langTick]);

	// The PlxNative shelves: the Plex source (lib/plexsource.ts) behind the shared shelves (hooks/useShelves.ts, lib/shelves.ts).
	// Another app's shelves would add its own source here and append its views to `shelves`.
	const plexSrc = useMemo(() => plexSource(plexAuth, PLEX_ENABLED ? config.plex : {...config.plex, continueOn: false, recentOn: false}, setPlexAuth),
		[plexAuth, config.plex, config.language, langTick]);       // eslint-disable-line react-hooks/exhaustive-deps
	const onShelfOpenError = useCallback((why: 'missing' | 'failed', app: string) => showToast(tt(why === 'missing' ? 'shelves.notInstalled' : 'shelves.openFailed', {app}), 'error'), [showToast]);
	const onPlexExpired = useCallback(() => showToast(tt('plex.expired'), 'error'), [showToast]);
	const plexViews = useShelves(plexSrc, {wakes, onExpired: onPlexExpired, onOpenError: onShelfOpenError});
	const shelfViews = plexViews;
	const onPlexDone = useCallback((auth: PlexAuth, message: string) => {
		setPlexAuth(auth);
		if (!auth.token) forgetSet(PLEX_SOURCE_ID);
		setScreen('settings');
		showToast(message);
	}, [showToast]);

	// Tell the user once if the safety switch-off fired.
	useEffect(() => {
		const onVisibility = () => {
			if (document.hidden) return;
			try {
				if (localStorage.getItem('customlauncher-homekill-off')) {
					localStorage.removeItem('customlauncher-homekill-off');
					showToast(tt('app.closingLgHomeWas'), 'error');
				}
			} catch { /* ignore */ }
		};
		onVisibility();
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [showToast]);

	// P81: a theme was loaded or switched: put its parts into the settings, redraw the tiles, say what differs from this TV's apps
	const afterTheme = (outcome: LoadOutcome & {ok: true}, title: string) => {
		const old = applied.t;
		applied.t = outcome.theme;
		setConfig((c) => { const next = applyWholeTheme(old ? removeThemeParts(c, old) : c, outcome.theme, c.wallpaper.path); if (next !== c) saveConfig(next); return next; });          // P82: the earlier theme's parts go first
		setThemeRev((n) => n + 1);
		const titles: Record<string, string> = {};
		apps.forEach((a) => { titles[a.id] = a.title; });
		const diff = mismatchText(themeMismatch(outcome.theme, apps.map((a) => a.id)), (id) => titles[id] || id);
		const notes = [`${outcome.name}: ${outcome.summary}.`];
		if (diff) notes.push(`The theme does not match this TV's apps: ${diff}. It was applied anyway.`);
		if (outcome.iconsFailed) notes.push(`${outcome.iconsFailed} icons could not be read or kept.`);
		setNotice({title: diff || outcome.iconsFailed ? tt('app.withDifferences', {title}) : title, text: notes.join(' '), buttons: [{label: tt('app.ok'), tone: 'light', run: () => setNotice(null)}], onBack: () => setNotice(null)});
	};
	const updateConfig = (next: UserConfig) => { setConfig(next); saveConfig(next); };
	// I2: for callbacks that run later (after an await): applies the change to the CURRENT settings, never to the copy from click time
	const patchConfig = (patch: Partial<UserConfig> | ((c: UserConfig) => Partial<UserConfig>)) => setConfig((c) => { const next = {...c, ...(typeof patch === 'function' ? patch(c) : patch)}; saveConfig(next); return next; });

	// ----- Root has failed (P83) -----
	// Turns on the experimental app list through the TV's remote-control service (SSAP); no root needed.
	const startTvApps = () => {
		showToast(tt('app.lookAtTheTv'));
		pairWithTv().then(() => {
			tvAppsRef.current = true;
			setConfig((c) => { const next = {...c, tvApps: true}; saveConfig(next); return next; });
			manualLoad.current = true;
			setReloads((n) => n + 1);
			showToast(tt('app.pairedReadingTheApp'));
		}, (e) => showToast(tt('app.couldNotPair', {why: e && e.message ? e.message : e}), 'error'));
	};
	// K1: an automatic Home button mapping ended: the pop-up comes at once (it waits on screen if Hearth is hidden) and the row shows the button
	const onAutoMap = (result: AutoResult) => {
		log(`homekey: auto map pop-up and row (${result.ok ? 'mapped ' + result.code : 'not mapped: ' + result.why})`);
		if (result.ok) setSystemInfo((previous) => ({...previous, homeKey: result.code}));
		const close = () => setNotice(null);
		const vars = {keyLabel: keyLabel(result.code), why: result.why, tab: tt('app.system'), row: tt('pref.homeKey.label')};
		setNotice({
			title: result.ok ? tt('app.homeKeyMapped') : tt('app.homeKeyNotMapped'),
			text: result.ok ? tt('app.homeKeyMappedText', vars) : tt('app.homeKeyNotMappedText', vars),
			buttons: [{label: tt('app.ok'), tone: 'light', run: close}],
			onBack: close
		});
	};
	const rootNoticed = useRef(false);
	const bootWarned = useRef(false);        // L1: the webOS 3 start-up warning for the power-on row shows once per start
	const offerNoRoot = () => {
		if (rootNoticed.current || rootState() !== 'no' || tvAppsRef.current) return;
		rootNoticed.current = true;
		const close = () => setNotice(null);
		setNotice({
			title: tt('app.rootAccessFailed'),
			text: tt('app.hearthCouldNotUse') + CONNECT_APPS_NOTE,
			buttons: [
				{label: tt('app.turnOnSsapApp'), detail: tt('app.noRootNeededThe'), tone: 'light', run: () => { close(); startTvApps(); }},
				{label: tt('app.myTvIsRooted'), detail: tt('app.howToGetRoot'), run: () => setNotice({
					title: tt('app.getRootAccessBack'),
					text: tt('app.firstRunOnceOver'),
					buttons: [{label: tt('app.ok2'), tone: 'light', run: close}],
					onBack: close
				})},
				{label: tt('app.close'), run: close}
			],
			onBack: close
		});
	};
	const onRemoteModel = (m: UserConfig['remoteModel']) => setConfig((c) => { const next = {...c, remoteModel: m}; saveConfig(next); return next; });

	// ----- derived lists -----
	const shownApps = useMemo(
		() => visibleApps(apps, config.appIds, config.hiddenIds),
		[apps, config.appIds, config.hiddenIds]
	);
	const shownInputs = useMemo(() => pickInOrder(inputs, config.sourceIds, (s) => s.appId), [inputs, config.sourceIds]);

	// an app that is also an input (Live TV) takes the edits made to the input, so its new name and icon show in the Apps tab and on Home (P39a)
	const appEditsShown = useMemo(() => {
		const merged = {...config.appEdits};
		inputs.forEach((i) => { if (config.sourceEdits[i.appId]) merged[i.appId] = config.sourceEdits[i.appId]; });
		return merged;
	}, [inputs, config.appEdits, config.sourceEdits]);

	// apps and inputs share one order (Move to start / left / right / end); LG Home and Settings always end the row
	// With "Most used" the row follows the open counts (favourites keep their places); it is rebuilt when Hearth comes
	// back to the front, so a tile never jumps while its app is opening. The manual order stays saved underneath.
	const recentWake = config.orderByRecent ? wakes : 0;
	const orderedTiles: TileModel[] = useMemo(
		() => {
			const manual = orderTiles(shownApps.map((a) => appTile(a, appEditsShown)).concat(shownInputs.map((i) => inputTile(i, config.sourceEdits, config.inputStatus))), (t) => t.key, config.tileOrder);
			if (!config.orderByRecent) return manual;
			if (!recentRef.current) recentRef.current = readRecent();
			if (!usageRef.current) usageRef.current = readUsage();
			return orderByUsage(manual, (t) => t.key, usageRef.current, recentRef.current, config.favourites);
		},
		[shownApps, shownInputs, config.tileOrder, config.sourceEdits, config.inputStatus, appEditsShown, config.orderByRecent, config.favourites, recentWake, themeRev]
	);
	const homeItems: TileModel[] = useMemo(
		() => orderedTiles.concat(MISC_TILES.filter((t) => (t.key === MISC.lgHome ? config.showLgHome : t.key === MISC.system ? config.showSystem : !config.hideSettings || tileBack))),
		[orderedTiles, config.showLgHome, config.showSystem, config.hideSettings, tileBack, config.language, langTick]
	);

	const timeFormat: TimeFormat = config.clockFormat === 'tv' ? tvFormat : config.clockFormat;

	/** What the Debug tab shows (built when it opens, not while Hearth runs). */
	const buildDebug = () => {
		const li = listInfo.current;
		const mins = li ? Math.round((Date.now() - li.at) / 60000) : 0;
		return debugPages({
			about: aboutText(versions, rootState(), lastFailure()),
			rootDetail: lastFailureDetail(),
			appList: li ? {source: li.source, count: li.count, ago: mins < 1 ? 'just now' : mins + ' min ago'} : null,
			weather: config.weather.on ? weatherNote.current : 'off',
			config,
			events: logLines(),
			stats: statsRef.current,
			userAgent: navigator.userAgent
		});
	};
	const debugPagesNow = useMemo(buildDebug, [debugTick, versions]);       // eslint-disable-line react-hooks/exhaustive-deps
	const onCollapse = useCallback((id?: string) => setOpenGroups((g) => {
		if (id) return g[id] ? {...g, [id]: ''} : g;
		return Object.keys(g).some((k) => !!g[k]) ? {} : g;
	}), []);
	const onTab = useCallback((id: string) => {
		setSettingsTab(id);
		if (id !== TAB.debug) return;
		setDebugTick((n) => n + 1);
		if (rootState() !== 'yes') return;
		const save = () => (LEGACY ? readBootTrace() : Promise.resolve([] as string[])).then((trace) => writeReport(reportText(buildDebug(), allLogLines(), previousRunLines(), trace)));
		readStats().then((st) => { statsRef.current = st; setDebugTick((n) => n + 1); save(); });
	}, [config, versions]);                                                  // eslint-disable-line react-hooks/exhaustive-deps

	// which group is open on each option tab (none stored: the first one; '': all closed)
	const [openGroups, setOpenGroups] = useState<Record<string, string>>({});
	const noRoot = rootState() === 'no';                       // the Screen saver tab is for rooted TVs only
	const groupsOf = (tab: PrefTab, info?: SystemInfo) => optionsFor(tab, config, info, openGroups[tab] || '');
	// ----- When the TV turns on, open... (P55b; from PR #25 by Obednal97, adapted) -----
	// The choices: the TV's own default, Hearth, then every app by name.
	const powerOnChoices: PowerOnChoice[] = useMemo(() => {
		const list: PowerOnChoice[] = [
			{id: '', label: tt('app.liveTvOrThe'), detail: tt('app.whatTheTvDoes')},
			{id: APP_ID, label: tt('app.hearth'), detail: tt('app.thisHomeScreen')}
		];
		apps.filter((a) => a.id !== APP_ID).slice().sort((a, b) => a.title.localeCompare(b.title))
			.forEach((a) => list.push({id: a.id, label: a.title, detail: tt('app.app')}));
		return list;
	}, [apps, config.language, langTick]);
	const powerOnTitle = useCallback((id: string): string => {
		if (!id) return '';
		const choice = powerOnChoices.filter((c) => c.id === id)[0];
		return choice ? choice.label : id;
	}, [powerOnChoices]);
	const powerOnNames = useMemo(() => {
		const status = systemInfo.powerOn;
		return {chosen: powerOnTitle(status ? status.chosen : config.powerOnApp), loaded: powerOnTitle(status ? status.loaded : '')};
	}, [systemInfo.powerOn, config.powerOnApp, powerOnTitle]);

	/** Puts a choice on the TV: `id` ('' = the TV's default), with or without network wake-ups. */
	const applyPowerOn = useCallback((id: string, network: boolean, done: string) => {
		setPowerOnBusy(true);
		showToast(tt('app.saving'));
		(id ? setPowerOnApp(id, network) : clearPowerOnApp()).then(({result, detail, status}) => {
			setPowerOnBusy(false);
			setSystemInfo((previous) => ({...previous, powerOn: status}));
			const ok = result === 'applied' || result === 'removed';
			if (ok && LEGACY) noteGuardChange(id ? 'powerOnSet' : 'powerOnCleared').then((done) => log(`bootguard: power-on app ${id ? 'set' : 'cleared'}, guard ${done ? 'updated' : 'NOT updated'}`));      // S3c: webOS 3 boot guard
			// the saved choice follows what the TV has now (a failed change leaves the earlier one in place)
			const now = status ? {app: status.chosen, network: status.network} : (ok ? {app: id, network} : null);
			if (now) setConfig((c) => { const next = {...c, powerOnApp: now.app, powerOnNetwork: now.network}; saveConfig(next); return next; });
			if (ok && !needsRestart(status)) showToast(done);
			else if (ok) showToast(powerOnMessage(result, powerOnTitle(id)));
			else showToast(powerOnMessage(result, status ? powerOnName(status.chosen, powerOnTitle(status.chosen)) : '', detail), 'error');
		}).catch((error: Error) => {
			setPowerOnBusy(false);
			showToast(powerOnMessage('failed', '', error && error.message ? error.message : ''), 'error');
		});
	}, [showToast, powerOnTitle]);

	const powerOnNetwork = systemInfo.powerOn ? systemInfo.powerOn.network : config.powerOnNetwork;
	const onPowerOnChoose = useCallback((id: string) => {
		applyPowerOn(id, !!id && powerOnNetwork, tt('app.doneTheTvOpensV1', {v1: powerOnName(id, powerOnTitle(id))}));
	}, [applyPowerOn, powerOnNetwork, powerOnTitle]);
	const onPowerOnNetwork = useCallback(() => {
		const app = systemInfo.powerOn ? systemInfo.powerOn.chosen : config.powerOnApp;
		if (app) applyPowerOn(app, !powerOnNetwork, powerOnNetwork ? tt('app.doneNetworkWakeUpsGo') : tt('app.doneNetworkWakeUpsOpen'));
	}, [applyPowerOn, powerOnNetwork, systemInfo.powerOn, config.powerOnApp]);
	const onPowerOnRestart = useCallback(() => {
		showToast(tt('app.restartingTheTv'));
		restartTv().then((started) => { if (!started) showToast(tt('app.theTvDidNot', {why: whySuffix()}), 'error'); });
	}, [showToast]);

	const tabs: SettingsTab[] = useMemo(() => [
		{id: TAB.appsSources, label: tt('app.appsSources'), items: [], shown: [], subs: [
			lazyTab({id: TAB.apps, label: tt('app.apps'), refresh: true, fav: true, remove: rootState() !== 'no', recent: {on: config.orderByRecent}, items: [], shown: [], edit: true}, {
				items: () => orderTiles(apps.map((a) => appTile(a, appEditsShown)), (t) => t.key, config.appIds),
				shown: () => shownApps.map((a) => appTile(a, appEditsShown))
			}),
			lazyTab({id: TAB.sources, label: tt('app.sources'), fav: true, recent: {on: config.orderByRecent}, items: [], shown: [], edit: true}, {
				items: () => inputs.map((i) => inputTile(i, config.sourceEdits, config.inputStatus)),
				shown: () => shownInputs.map((i) => inputTile(i, config.sourceEdits, config.inputStatus))
			})
		]},
		lazyTab({id: TAB.essentials, label: tt('app.essentials'), items: [], shown: []}, {options: () => groupsOf('essentials', {...systemInfo, plex: plexInfo})}),
		lazyTab({id: TAB.look, label: tt('app.look'), items: [], shown: []}, {options: () => groupsOf('look', systemInfo)}),
		lazyTab({id: TAB.clock, label: tt('app.widget'), items: [], shown: [], preview: config.clock.show}, {options: () => groupsOf('clock', {...systemInfo, plex: plexInfo})}),
		lazyTab({id: TAB.wallpaper, label: tt('app.wallpaper'), items: [], shown: []}, {options: () => groupsOf('wallpaper')}),
		...(noRoot ? [] : [lazyTab({id: TAB.saver, label: tt('app.screenSaver'), items: [], shown: []}, {options: () => groupsOf('saver', systemInfo)})]),
		lazyTab({id: TAB.system, label: tt('app.system'), items: [], shown: []}, {options: () => groupsOf('system', {...systemInfo, tvInput, powerOnNames})}),
		...(config.showDebug ? [{id: TAB.debug, label: tt('app.debug'), items: [], shown: [], pages: debugPagesNow}] : []),
		...(PROBE_ENABLED && config.showDebug ? [{id: TAB.tests, label: tt('app.tests'), items: [], shown: [], options: probeOptions(probe)}] : [])
	], [apps, inputs, shownApps, shownInputs, config, systemInfo, tvInput, probe, debugPagesNow, openGroups, noRoot, powerOnNames, themeRev, langTick, plexAuth]);    // eslint-disable-line react-hooks/exhaustive-deps

	const editedSource = editKey ? inputs.filter((i) => i.appId === editKey)[0] : undefined;
	const editedApp = editKey && !editedSource ? apps.filter((a) => a.id === editKey)[0] : undefined;
	const editedKey = editedSource ? editedSource.appId : editedApp ? editedApp.id : '';
	const storeKey: 'sourceEdits' | 'appEdits' = editedSource ? 'sourceEdits' : 'appEdits';
	const changeEdit = (patch: SourceEdit) => setConfig((c) => { const next = {...c, [storeKey]: setEdit(c[storeKey], editedKey, patch)}; saveConfig(next); return next; });

	setMonoIcons(isMonoStyle(iconStyle));
	const appearance: Appearance = useMemo(
		() => ({iconScale: config.iconScale, iconOpacity: config.iconOpacity, labelColor: config.labelColor, labelFont: config.labelFont, labelSize: config.labelSize, labelWeight: config.labelWeight, scrollSpeed: config.scrollSpeed, iconGap: config.iconGap, tileShape: config.tileShape, iconStyle, quietSec: config.quietSec, quietDimSec: config.quietDimSec, quietDimLevel: config.quietDimLevel, quietPowerOff: config.quietPowerOff, oledShift: config.oledShift, sideMargin: config.sideMargin, bottomMargin: config.bottomMargin, favSideMargin: config.favSideMargin, favBottomMargin: config.favBottomMargin, showLabels: config.showLabels, rows: config.rows, clock: config.clock}),
		[config.iconScale, config.iconOpacity, config.labelColor, config.labelFont, config.labelSize, config.labelWeight, config.scrollSpeed, config.iconGap, config.tileShape, iconStyle, config.quietSec, config.quietDimSec, config.quietPowerOff, config.quietDimLevel, config.oledShift, config.sideMargin, config.bottomMargin, config.favSideMargin, config.favBottomMargin, config.showLabels, config.rows, config.clock, config.theme]
	);

	// ----- actions -----
	const onActivate = useCallback((item: TileModel) => {
		if (item.key === MISC.settings) { setHidePractice(false); setScreen('settings'); return; }
		if (item.key === MISC.system) { launchSystemSettings().catch(() => showToast(tt('app.couldnTOpenThe'), 'error')); return; }
		if (item.key === MISC.lgHome) {
			// webOS 3 has no LG Home app: when the launch is refused, the Home key is sent to the TV instead (lghome.ts; needs root)
			const open = () => launchLgHome().catch(() => openLgHomeByKey(() => showToast(tt('app.pressHomeOnYour'))).then((r) => { if (r === 'learned') showToast(tt('app.homeKeyLearned')); else if (r !== 'sent') showToast(tt('app.couldnTOpenLg'), 'error'); }));
			// With the helper on, the real LG Home is let through first (the helper takes over again once LG Home is left)
			if (config.replaceHome) stockHome().then(() => window.setTimeout(open, 1200));
			else if (config.samHome) stockSam().then(() => window.setTimeout(open, 1200));
			else open();
			return;
		}
		// With the helper on: say the launcher is alive and note what is being opened, so the helper's check
		// can never mistake this moment for a failure, and its log shows what happened if an app does not open.
		if (config.replaceHome || config.samHome) markAliveSoon(`launcher: opening ${item.key}`, false);
		noteOpened(item.key);
		launchApp(item.key).catch(() => {
			if (config.replaceHome || config.samHome) logLine(`launcher: the TV refused to open ${item.key}`);
			showToast(tt('app.couldnTOpen', {label: item.label}), 'error');
		});
	}, [showToast, config.replaceHome, config.samHome]);

	const onToggle = useCallback((tabId: string, key: string) => {
		if (tabId === TAB.apps) {
			// apps are shown unless hidden: OK adds the app to the hide-list, or takes it off
			const hidden = config.hiddenIds !== null ? config.hiddenIds : hiddenAfterUpgrade(apps, config.appIds);
			updateConfig({...config, hiddenIds: toggleHidden(hidden, key)});
		} else {
			updateConfig({...config, sourceIds: toggleId(config.sourceIds, key)});
		}
	}, [config, apps]);

	/** OK on a tile while picking favourites (Settings → Apps or Sources → Favourites). */
	const onFavourite = useCallback((_tabId: string, key: string) => {
		updateConfig({...config, favourites: toggleId(config.favourites, key)});
	}, [config]);

	const changeOption = useCallback((optionId: string, press: Press) => {
		if (PROBE_ENABLED && optionId.indexOf('probe:') === 0) {
			if (press !== 'ok') return;
			const start = (id: string) => setProbe((p) => ({...p, [id]: {state: 'running'}}));
			const done = (id: string, result: {ok: boolean; text: string}) => { log(`probe ${id}: ${result.ok ? 'ok' : 'failed'}: ${result.text}`); setProbe((p) => ({...p, [id]: {state: 'done', result}})); };
			if (optionId === RUN_ALL_ID) { runAll(PROBE_TESTS, start, done); return; }
			const test = PROBE_TESTS.filter((t) => 'probe:' + t.id === optionId)[0];
			if (!test) return;
			start(test.id);
			withLimit(test).then((r) => done(test.id, r), (e) => done(test.id, probeBad(e)));
			return;
		}
		if (optionId.indexOf(GROUP_PREFIX) === 0) {          // a group header: open it (closing the others) or close it
			const tabId = optionId.slice(GROUP_PREFIX.length).split(':')[0] as PrefTab;
			const name = optionId.slice(GROUP_PREFIX.length + tabId.length + 1);
			const header = optionsFor(tabId, config, tabId === 'system' ? {...systemInfo, tvInput, powerOnNames} : tabId === 'saver' || tabId === 'look' || tabId === 'essentials' ? systemInfo : undefined, openGroups[tabId] || '').filter((o) => o.id === optionId)[0];
			setOpenGroups((g) => ({...g, [tabId]: header && header.open ? '' : name}));
			return;
		}
		const pref = findPref(optionId);
		if (!pref) return;
		const blocked = disabledReason(optionId, systemInfo, config);
		if (blocked) { showToast(blocked, 'error'); return; }
		if (optionId === 'weatherOn' && !config.weather.city) { showToast(tt('app.chooseACityFirst')); setScreen('cities'); return; }
		// a Plex shelf switched on before signing in: it is turned on and the sign-in opens at once
		if ((optionId === 'plexContinue' || optionId === 'plexRecent') && press === 'ok' && !plexAuth.token && pref.on && !pref.on(config)) {
			updateConfig(applyPref(config, optionId, press));
			setPlexStart('account');
			setScreen('plexsignin');
			return;
		}
		if (optionId === 'plexAccount' || optionId === 'plexServer') {
			if (press === 'ok') { setPlexStart(optionId === 'plexServer' ? 'servers' : 'account'); setScreen('plexsignin'); }
			return;
		}
		if (optionId === 'keepReady' && press === 'ok' && !config.keepReady) {       // P73: a warning before it is turned on
			setNotice({
				title: tt('app.keepHearthReady'),
				text: KEEP_WARNING,
				buttons: [
					{label: tt('app.keepItOff'), tone: 'light', run: () => setNotice(null)},
					{label: tt('app.turnOnExperimental'), detail: tt('app.usesTvRamOff'), tone: 'danger', run: () => { setNotice(null); updateConfig({...config, keepReady: true}); }}
				],
				onBack: () => setNotice(null)
			});
			return;
		}
		if (optionId === 'hideSettings' && press === 'ok' && !config.hideSettings) {       // R10: the tile is hidden only after the Hold OK way was used once
			setNotice({
				title: tt('app.hidePracticeTitle'),
				text: tt('app.hidePracticeText'),
				buttons: [
					{label: tt('app.hidePracticeGo'), tone: 'light', run: () => { setNotice(null); setHidePractice(true); setScreen('home'); }},
					{label: tt('appmenu.cancel'), run: () => setNotice(null)}
				],
				onBack: () => setNotice(null)
			});
			return;
		}
		if (optionId === 'theme' && press === 'ok' && systemInfo.root === 'yes') { setScreen('themes'); return; }       // OK (rooted TVs): load a theme zip; ← → step the built-in themes
		if (optionId === 'language' && press === 'ok' && systemInfo.root === 'yes') { setScreen('languages'); return; }       // OK (rooted TVs): load a language file; ← → switch
		if (optionId === 'essentialsEdit') { if (press === 'ok') setScreen('essedit'); return; }       // S3: edit and reorder the Essentials rows
		if (optionId === 'wallpaper' && press === 'ok') { setScreen('picker'); return; }       // OK: pick a picture or folder; ← → step the built-in backgrounds
		if (pref.kind === 'action') {
			if (optionId === 'weatherCity') setScreen('cities');
			else if (optionId === 'restoreLook') {
				const back = withBackedUpLook(config);
				if (back) { setConfig(back); if (saveConfigVerified(back)) { dropPrefsBackup(); showToast(tt('app.yourEarlierSettingsAre')); } else showToast(tt('app.restoreNotSaved'), 'error'); }          // I2: the backup goes only after a save that read back
				else { dropPrefsBackup(); showToast(tt('app.noEarlierSettingsFound'), 'error'); }
			}
			else if (optionId === 'languageRemove') { removePack(); updateConfig({...config, language: 'en'}); showToast(tt('app.languageRemoved')); }
			else if (optionId === 'resetLook') { updateConfig(resetLook(config)); showToast(tt('app.visualSettingsResetTo')); }
			else if (optionId === 'undoAll') {       // U1: takes every Hearth change on the TV back, writes one log, then uninstalls Hearth
				setNotice({
					title: tt('undoall.title'),
					text: tt('undoall.text', {log: UNDO_LOG}),
					buttons: [
						{label: tt('app.ok'), tone: 'danger', run: () => {
							// p17: this pop-up has no buttons and ignores Back; it stays until the TV has removed Hearth (a failed start closes it)
							setNotice({title: tt('undoall.working'), text: tt('undoall.workingText', {log: UNDO_LOG}), buttons: [], onBack: () => undefined});
							undoAll().catch(() => { setNotice(null); showToast(tt('undoall.failed'), 'error'); });
						}},
						{label: tt('appmenu.cancel'), tone: 'light', run: () => setNotice(null)}
					],
					onBack: () => setNotice(null)
				});
			}
			else if (optionId === 'themeExport') {
				showToast(tt('app.writingTheThemeBase'));
				// S1b: every app, hidden ones too, in the Apps-tab order
				exportThemeBase(orderTiles(apps.map((a) => appTile(a, appEditsShown)), (t) => t.key, config.appIds).map((t) => ({id: t.key, name: t.label, image: t.imageUrl}))).then((r) => {
					showToast(r.ok ? tt('app.savedThemeBaseZip', {apps: r.apps, icons: r.icons}) : (r.reason || tt('app.notSaved')), r.ok ? 'info' : 'error');
				});
			}
			else if (optionId === 'themeSave') saveLoadedTheme().then((r) => { showToast(r.ok ? tt('app.themeSavedInHearth') : (r.reason || tt('app.notSaved')), r.ok ? 'info' : 'error'); patchConfig({}); });
			else if (optionId === 'themeRemove') {
				const slug = config.themeSel;
				const t = applied.t && themeSlug(applied.t.name) === slug ? applied.t : null;
				if (t) applied.t = null;
				deleteTheme(slug).then(() => { setConfig((c) => { const next = t ? removeThemeParts(c, t) : {...c, themeSel: ''}; saveConfig(next); return next; }); setThemeRev((n) => n + 1); showToast(tt('app.themeDeleted')); });
			}
			else if (optionId === 'homeKey') askRemoteWarning(() => setScreen('homekey'));
			else if (optionId === 'remap') askRemoteWarning(() => setScreen('extrakeys'));
			else if (optionId === 'preload') setScreen('preload');
			else if (optionId === 'updates') setScreen('updates');
			else if (optionId === 'powerOnApp') {
				if (systemInfo.powerOn && systemInfo.powerOn.foreign) showToast(powerOnMessage('foreign'), 'error');
				else if (LEGACY && !bootWarned.current) {       // L1: webOS 3 only (legacy bundle)
					setNotice({
						title: tt('app.bootLoopTitle'),
						text: tt('app.bootLoopPowerOn'),
						buttons: [
							{label: tt('app.keepItOff'), tone: 'light', run: () => setNotice(null)},
							{label: tt('app.bootLoopGo'), detail: tt('app.bootLoopGoDetail'), tone: 'danger', run: () => { bootWarned.current = true; setNotice(null); setScreen('poweron'); }}
						],
						onBack: () => setNotice(null)
					});
				}
				else setScreen('poweron');
			}
			else if (optionId === 'screensaver') {
				if (config.screensaver) {
					removeSaver().then(() => { patchConfig({screensaver: false}); showToast(tt('app.turnedOffTheTv')); });
				} else {
					showToast(tt('app.settingUp'));
					installSaver(config).then(({result, detail}) => {
						if (result === 'applied') patchConfig({screensaver: true});
						showToast(saverMessage(result, detail), result === 'applied' ? 'info' : 'error');
					});
				}
			}
			else if (optionId === 'screensaverPictures') setScreen('saverpicker');
			else if (optionId === 'screensaverShow') {
				showToast(tt('app.startingTheScreenSaver'));
				showSaver().then((ok) => { if (!ok) showToast(tt('app.theTvDidnT'), 'error'); });
			}
			else if (optionId === 'tvApps') {
				if (config.tvApps) { forgetTv(); updateConfig({...config, tvApps: false}); showToast(tt('app.turnedOffTheBuilt')); }
				else startTvApps();
			}
			else if (optionId === 'noRootGuide') {
				const close = () => setNotice(null);
				setNotice({
					title: tt('app.openHearthWithoutRoot'),
					text: tt('app.withoutRootNothingCan') + CONNECT_APPS_NOTE + tt('app.detailsReadme'),
					buttons: [{label: tt('app.ok3'), tone: 'light', run: close}],
					onBack: close
				});
			}
			else if (optionId === 'homeApp') {
				const refresh = () => readHomeApp().then((homeApp) => setSystemInfo((previous) => ({...previous, homeApp})));
				const on = typeof systemInfo.homeApp === 'string' ? systemInfo.homeApp === APP_ID : config.homeApp;
				if (on) {
					showToast(tt('app.puttingTheTvS'));
					restoreHomeApp(config.homeAppPrevious).then(({result, detail}) => {
						if (result === 'restored') patchConfig({homeApp: false, homeAppPrevious: ''});
						refresh();
						showToast(homeAppMessage(result, detail), result === 'restored' ? 'info' : 'error');
					});
				} else {
					showToast(tt('app.settingUp2'));
					setHearthAsHome().then(({result, detail}) => {
						if (result === 'applied') patchConfig({homeApp: true, homeAppPrevious: detail});
						refresh();
						showToast(homeAppMessage(result, detail), result === 'applied' ? 'info' : 'error');
					});
				}
			}
			else if (optionId === 'replaceHome') {
				const refresh = () => getHookStatus().then((homeHook) => setSystemInfo((previous) => ({...previous, homeHook})));
				const running = !!(systemInfo.homeHook && systemInfo.homeHook.running);
				if (running) {
					// off: only the helper goes; the Home button mapping is separate (System -> Remote control -> Map home button)
					removeHomeHook().then(() => {
						patchConfig({replaceHome: false});
						refresh();
						showToast(tt('app.turnedOffLgHome'));
					});
				} else {
					// on (P61h): the helper only; it no longer binds the Home button. Without a Hearth Home binding the user is warned first.
					const proceed = () => {
						setNotice(null);
						showToast(tt('app.settingUp3'));
						installHomeHook().then(({result, detail}) => {
							if (result !== 'applied') { refresh(); showToast(hookMessage(result, detail), 'error'); return; }
							patchConfig({replaceHome: true});
							refresh();
							showToast(tt('app.lgHomeIsReplaced'));
						});
					};
					readBinds().then((read) => (read.ok ? hearthCodes(read.binds).length > 0 : false), () => false).then((bound) => {
						if (bound) { proceed(); return; }
						setNotice({
							title: tt('app.replaceLgHomeAnyway'),
							text: tt('app.hearthWillOpenInstead'),
							buttons: [
								{label: tt('app.bindHomeKeyTo'), detail: tt('app.nothingIsReplacedNow'), tone: 'light', run: () => { setNotice(null); askRemoteWarning(() => setScreen('homekey')); }},
								{label: tt('app.replaceLgHomeWithout'), detail: tt('app.lgHomeMayFlash'), tone: 'danger', run: proceed}
							],
							onBack: () => setNotice(null)
						});
					});
				}
			}
			else if (optionId === 'samHome') {
				// 2.0.3 (R3): experimental. On: a pop-up first (it explains the restart of SAM), then install + switch on. Off: LG Home gets its place back.
				const refresh = () => getSamStatus().then((samHome) => setSystemInfo((previous) => ({...previous, samHome})));
				if (systemInfo.samBusy) return;          // F2: a set-up or switch-off is already running
				const busy = (v: boolean) => setSystemInfo((previous) => ({...previous, samBusy: v}));
				const on = !!(systemInfo.samHome && (systemInfo.samHome.enabled || systemInfo.samHome.linked)) || config.samHome;
				if (on) {
					busy(true);
					showToast(tt('app.samSettingUp'));
					removeSamHome().then((freed) => {
						patchConfig({samHome: false});
						busy(false);
						refresh();
						showToast(freed ? tt('app.turnedOffLgHome') : tt('app.samNeedsRestart'));
					});
				} else {
					setNotice({
						title: tt('app.replaceLgHomeWithSam'),
						text: tt('app.samExplain'),
						buttons: [
							{label: tt('app.keepItOff'), tone: 'light', run: () => setNotice(null)},
							{label: tt('app.turnOnExperimental'), detail: tt('app.samMayRestart'), tone: 'danger', run: () => {
								setNotice(null);
								busy(true);
								showToast(tt('app.samSettingUp'));
								patchConfig({samHome: true});          // saved first: SAM may restart under this page before the answer comes
								installSamHome().then(({result, detail}) => {
									if (result !== 'applied' && result !== 'busy') patchConfig({samHome: false});
									busy(false);
									refresh();
									showToast(samMessage(result, detail), result === 'applied' ? 'info' : 'error');
								});
							}}
						],
						onBack: () => setNotice(null)
					});
				}
			}
			else if (optionId === 'tvInput') {
				const adding = tvInput !== true;          // 2.0.2 (D1): one toggle: add when not listed, remove when listed
				const changeInput = () => {
					showToast(tt(adding ? 'app.addingHearthToThe' : 'app.removingHearthFromThe'));
					(adding ? addTvInput() : removeTvInput())
						.then((accepted) => (isWebOS() ? listInputs() : Promise.resolve(MOCK_INPUTS)).then((list) => {
							setInputs(list);
							const listed = list.some((i) => i.appId === APP_ID);
							if (listed === adding) {
								showToast(tt(adding ? 'app.addedToTheTv' : 'app.removedFromTheTv'));
								if (LEGACY) noteGuardChange(adding ? 'inputAdded' : 'inputRemoved').then((ok) => log(`bootguard: input ${adding ? 'added' : 'removed'}, guard ${ok ? 'updated' : 'NOT updated'}`));      // S3c: webOS 3 boot guard
							}
							else showToast(accepted ? tt('app.theTvAcceptedThat') : tt('app.theTvDidnT2', {TV_INPUT_LOG}), 'error');
						}))
						.catch((error) => showToast(failureText(error, tt('app.changeTheTvInput')), 'error'));
				};
				if (adding && LEGACY) {       // L1: webOS 3 only (legacy bundle); removing needs no warning
					setNotice({
						title: tt('app.bootLoopTitle'),
						text: tt('app.bootLoopInput'),
						buttons: [
							{label: tt('app.keepItOff'), tone: 'light', run: () => setNotice(null)},
							{label: tt('app.bootLoopGo'), detail: tt('app.bootLoopGoDetail'), tone: 'danger', run: () => { setNotice(null); changeInput(); }}
						],
						onBack: () => setNotice(null)
					});
				}
				else changeInput();
			}
			else if (optionId === 'lgLogo') {
				const wantOn = systemInfo.logo !== 'on';
				showToast(tt('app.changing'));
				setLogo(wantOn).then((ok) => getLogo().then((logo) => {
					setSystemInfo((previous) => ({...previous, logo}));
					showToast(ok ? (wantOn ? tt('app.theLgLogoWill') : tt('app.theLgLogoIs')) : tt('app.theTvDidnT3', {why: whySuffix()}), ok ? 'info' : 'error');
				}));
			}
			return;
		}
		const next = applyPref(config, optionId, press);
		if (next !== config) updateConfig(next);
	}, [config, showToast, systemInfo, tvInput, openGroups, plexAuth]);

	const onRefresh = useCallback(() => {
		manualLoad.current = true;
		showToast(tt('app.checkingForNewApps'));
		setReloads((n) => n + 1);
	}, [showToast]);

	const onOption = useCallback((optionId: string) => changeOption(optionId, 'ok'), [changeOption]);
	const onRecent = useCallback(() => { updateConfig({...config, orderByRecent: !config.orderByRecent}); }, [config]);          // eslint-disable-line react-hooks/exhaustive-deps
	const onAdjust = useCallback((optionId: string, direction: -1 | 1) => changeOption(optionId, direction < 0 ? 'left' : 'right'), [changeOption]);

	const onChooseWallpaper = useCallback((choice: WallpaperChoice) => {
		const keep = {intervalSec: config.wallpaper.intervalSec, shuffle: config.wallpaper.shuffle, fit: config.wallpaper.fit};
		const wallpaper = choice.mode === 'gradient' || choice.mode === 'photos'
			? {...DEFAULT_WALLPAPER, ...keep}
			: {mode: choice.mode, path: choice.path, ...keep, recursive: choice.mode === 'folder' && !!choice.recursive};
		updateConfig({...config, wallpaper, background: choice.mode === 'photos' ? PHOTO_SHOW : config.background});
		setScreen('settings');
		showToast(choice.mode === 'photos' ? tt('app.startingThePhotoSlideshow') : choice.mode === 'gradient' ? tt('app.builtInBackgroundRestored') : choice.mode === 'image' ? tt('app.loadingWallpaper') : tt('app.startingSlideshow'));
	}, [config, showToast]);

	const onChooseSaver = useCallback((choice: WallpaperChoice) => {
		// a folder or the built-in photos (a slideshow) turn the saver's shuffle on
		const source = choice.mode === 'image' || choice.mode === 'folder' ? choice.path : choice.mode === 'photos' ? SAVER_PHOTOS : '';
		updateConfig({...config, screensaverSource: source, screensaverRecursive: choice.mode === 'folder' && !!choice.recursive, screensaverShuffle: choice.mode === 'folder' || choice.mode === 'photos' ? true : config.screensaverShuffle});
		setScreen('settings');
		showToast(choice.mode === 'photos' ? tt('app.screenSaverPhotoSlideshow') : source ? tt('app.screenSaverPicturesSet') : tt('app.theScreenSaverFollows'));
	}, [config, showToast]);

	const onChooseSaverVideo = useCallback(() => {
		updateConfig({...config, screensaverSource: SAVER_VIDEO});
		setScreen('settings');
		showToast(tt('app.screenSaverBuiltIn'));
	}, [config, showToast]);

	const onChooseCity = useCallback((city: City) => {
		updateConfig({...config, weather: {...config.weather, city, on: true}});
		setScreen('settings');
		showToast(tt('app.weatherSetTo', {name: city.name}));
	}, [config, showToast]);

	// Hold OK on an app or input: its Move / Hide (/ Uninstall) menu. LG Home and Settings have no menu.
	const onLongPress = useCallback((item: TileModel) => {
		if (item.key === MISC.lgHome || item.key === MISC.settings || item.key === MISC.system) return;
		const app = apps.find((a) => a.id === item.key) || null;
		setMenu({key: item.key, title: item.label, app});
	}, [apps]);

	// R10: the menu entry that opens Hearth Settings; during the practice it also hides the tile for good
	const onMenuSettings = useCallback(() => {
		setMenu(null);
		if (hidePractice) {
			setHidePractice(false);
			updateConfig({...config, hideSettings: true});
			showToast(tt('app.settingsTileHidden'));
		}
		setScreen('settings');
	}, [hidePractice, config, showToast]);       // eslint-disable-line react-hooks/exhaustive-deps

	const showTileAgain = useCallback(() => { setTileBack(true); showToast(tt('app.settingsTileBack')); }, [showToast]);

	const hideTile = useCallback((tile: {key: string; title: string; app: AppEntry | null}) => {
		onToggle(tile.app ? TAB.apps : TAB.sources, tile.key);
		setMenu(null);
		showToast(tt('app.tileHidden', {title: tile.title, tab: tile.app ? tt('app.tabApps') : tt('app.tabSources')}));
	}, [onToggle, showToast]);

	// T2 move mode: OK on the long-press menu's *Reorder home row* starts it with that tile picked up.
	const startMoveMode = useCallback((key: string) => { setMenu(null); setMoveMode({picked: key}); }, []);
	const configLive = useRef(config);                                    // U2: the newest config, for the delayed save of the move mode
	configLive.current = config;
	const moveDirty = useRef(false);
	const moveTimer = useRef(0);
	const flushMoveSave = useCallback(() => {
		window.clearTimeout(moveTimer.current);
		if (!moveDirty.current) return;
		moveDirty.current = false;
		saveConfig(configLive.current);
	}, []);
	const onMoveStep = useCallback((key: string, dir: 'left' | 'right') => {
		const keys = keysRef.current;
		const next = stepKeys(keys, config.favourites, key, dir);          // favourites and the other tiles keep separate orders; stops at the ends
		if (next === keys) return;
		keysRef.current = next;
		const apps = shownApps.map((a) => a.id);
		const inputs = shownInputs.map((i) => i.appId);
		// U2: the screen changes at once, the save follows a moment after the last step (one write, not one per step)
		const c = configLive.current;                                      // built on the newest config, so two quick steps (or a save right after one) never use an older copy
		const update = orderUpdate(next, apps, inputs, c.hiddenIds !== null ? (c.appIds || []) : null, c.sourceIds);
		const out = {...c, tileOrder: update.tileOrder, appIds: update.appIds !== null ? update.appIds : c.appIds, sourceIds: update.sourceIds};
		configLive.current = out;
		setConfig(out);
		moveDirty.current = true;
		window.clearTimeout(moveTimer.current);
		moveTimer.current = window.setTimeout(flushMoveSave, 700);
		setFocus((f) => ({key, seq: (f ? f.seq : 0) + 1}));
	}, [config.favourites, shownApps, shownInputs]);        // eslint-disable-line react-hooks/exhaustive-deps
	const onMoveExit = useCallback(() => { flushMoveSave(); setMoveMode(null); }, []);
	const onMovePick = useCallback((key: string | null) => { if (!key) flushMoveSave(); setMoveMode((m) => (m ? {picked: key} : m)); }, []);
	useEffect(() => { if (!moveMode) flushMoveSave(); }, [!!moveMode]);                  // any way out of the mode saves the order
	useEffect(() => {                                                      // Hearth sent to the background or closed: nothing waits for the timer
		const out = () => { if (document.hidden) flushMoveSave(); };
		document.addEventListener('visibilitychange', out);
		window.addEventListener('pagehide', flushMoveSave);
		return () => { document.removeEventListener('visibilitychange', out); window.removeEventListener('pagehide', flushMoveSave); };
	}, []);
	useEffect(() => {                                                      // the wallpaper darkens while the mode is on (CSS: `body.hearth-move`)
		document.body.classList.toggle('hearth-move', !!moveMode);
		return () => document.body.classList.remove('hearth-move');
	}, [!!moveMode]);
	useEffect(() => { if (moveMode && config.orderByRecent) setMoveMode(null); }, [config.orderByRecent]);       // eslint-disable-line react-hooks/exhaustive-deps

	// Uninstall (after the menu's confirmation): remove it, then re-read the app list to see whether it is really gone.
	const removeApp = useCallback((app: AppEntry) => {
		uninstallApp(app.id).then((result) => listApps().then(
			({apps: list, source}) => { setApps(list); if (source !== 'catalog') cacheApps(list); },
			() => { if (result === 'removed') setApps((previous) => previous.filter((a) => a.id !== app.id)); }
		).then(() => {
			setMenu(null);
			if (result === 'removed') {
				updateConfig({...config, appIds: config.appIds ? config.appIds.filter((id) => id !== app.id) : null, hiddenIds: config.hiddenIds ? config.hiddenIds.filter((id) => id !== app.id) : config.hiddenIds});
				showToast(tt('app.uninstalled', {title: app.title}));
			} else {
				showToast(result === 'still-installed' ? tt('app.theTvDidNot2', {title: app.title, UNINSTALL_LOG}) : tt('app.couldnTUninstall', {why: whySuffix() || tt('app.tvNotAccept')}), 'error');
			}
		}));
	}, [config, showToast]);

	// Settings -> Apps -> Uninstall apps: OK on a tile goes straight to the confirmation (or says why the app cannot be removed).
	const onUninstallPick = useCallback((key: string) => {
		const app = apps.find((a) => a.id === key);
		if (!app) return;
		const verdict = uninstallVerdict(app);
		if (!verdict.ok) { showToast(verdict.reason, 'error'); return; }
		setMenu({key, title: app.title, app, direct: true});
	}, [apps, showToast]);

	const menuVerdict = menu && menu.app ? uninstallVerdict(menu.app) : null;
	// ----- Map additional keys (K1): every button job, in four groups (app, input, other button, TV action) -----
	const remapTargets: RemapTarget[] = useMemo(() => {
		if (screen !== 'extrakeys') return [];
		return buildTargets(
			apps.map((a) => ({id: a.id, title: a.title})),
			inputs.map((i) => ({appId: i.appId, label: (config.sourceEdits[i.appId] && config.sourceEdits[i.appId].label) || i.label})),
			APP_ID
		);
	}, [screen === 'extrakeys', apps, inputs, config.sourceEdits]);    // eslint-disable-line react-hooks/exhaustive-deps

	/** Before a button gets the LG Home job: with a Home replacement on, LG Home would not stay in front, so ask first. */
	const askLgHome = useCallback((go: () => void) => {
		if (!homeReplacementOn(systemInfo, config)) { go(); return; }
		setNotice({
			title: tt('app.aHomeReplacementIsOn'),
			text: tt('app.lgHomeWillNotComeTo'),
			buttons: [
				{label: tt('app.disableReplacementsFirst'), tone: 'light', run: () => { setNotice(null); showToast(tt('app.switchTheLgHomeReplacement')); }},
				{label: tt('app.proceed'), run: () => { setNotice(null); go(); }}
			],
			onBack: () => setNotice(null)
		});
	}, [systemInfo, config, showToast]);

	// K2 (2.1.6): "Reassign remote buttons" (the TV's key filter) is gone. A TV that still had it: once, a while after the start, the filter and
	// its boot link are taken out, the old map is backed up, and a pop-up says the buttons must be mapped again (lib/remapgone.ts).
	useEffect(() => {
		if (!isWebOS() || keyFilterRetired(config)) return undefined;
		const timer = window.setTimeout(() => {
			retireKeyFilter(config).then((out) => {
				if (!out) return;
				patchConfig(() => ({remap: {on: false, keys: config.remap.keys}, remapKept: false}));
				if (!out.count) return;
				setNotice({
					title: tt('app.reassignRemoteButtonsWasRemoved'),
					text: tt('app.nButtonsSetWithItAre', {n: out.count}),
					buttons: [{label: tt('app.ok'), run: () => setNotice(null)}],
					onBack: () => setNotice(null)
				});
			});
		}, startDelay(TIER3_MS, 6000));
		return () => window.clearTimeout(timer);
	}, []);                                                                 // eslint-disable-line react-hooks/exhaustive-deps

	const menuBlocked = menuVerdict && !menuVerdict.ok ? menuVerdict.reason : null;
	keysRef.current = orderedTiles.map((t) => t.key);

	return (
		<>
			{photoShow && <PhotoShow fit={config.wallpaper.fit === 'fit'} intervalSec={config.wallpaper.intervalSec} shuffle={config.wallpaper.shuffle} paused={asleep} />}
			{!photoShow && <Wallpaper config={config.wallpaper} opacity={config.wallpaperOpacity} onProblem={(text) => showToast(text, 'error')} />}
			{/* Home stays mounted under the other screens so it keeps its focus position. */}
			<Home items={homeItems} favourites={config.favourites} timeFormat={timeFormat} appearance={appearance} active={screen === 'home' && !menu && !recents && !notice} paused={asleep} onActivate={onActivate} onLongPress={onLongPress} onDeadDown={config.hideSettings && !tileBack ? showTileAgain : undefined} onBack={openRecents} wake={homeResets} homeKey={config.homeFocus === 'last' && !bootFirst.current ? lastOpened.current : null} focus={focus} weather={weatherLine} shelves={shelfViews} moveMode={moveMode} tileKeys={keysRef.current} onMovePick={onMovePick} onMoveStep={onMoveStep} onMoveExit={onMoveExit} />
			{recents && screen === 'home' && <Recents icons={recentIcons} edits={config.appEdits} inputs={allInputs} sourceEdits={config.sourceEdits} width={config.recentsW} height={config.recentsH} onClose={closeRecents} onOpen={noteOpened} onToast={showToast} />}
			{/* Settings stays mounted under the picker so it keeps its tab. */}
			{screen === 'settings' && settingsTab === TAB.clock && appearance.clock.show && <WidgetPreview now={previewNow} format={timeFormat} config={appearance.clock} weather={weatherLine} />}
			{(screen !== 'home') && <Settings tabs={tabs} active={screen === 'settings' && !notice && !menu} onToggle={onToggle} onRecent={onRecent} onOption={onOption} onRefresh={onRefresh} favourites={config.favourites} onFavourite={onFavourite} onUninstallPick={onUninstallPick} onEdit={(key) => { setEditKey(key); setScreen('source'); }} onAdjust={onAdjust} onTab={onTab} onCollapse={onCollapse} onClose={() => { onCollapse(); setScreen('home'); }} about={aboutText(versions, rootState(), lastFailure())} homePreview={() => <HomePreview items={homeItems} favourites={config.favourites} appearance={appearance} timeFormat={timeFormat} weather={weatherLine} wallpaperRev={`${JSON.stringify(config.wallpaper)}|${config.background}|${config.wallpaperOpacity}|${config.fadeStrength}|${config.fadeHeight}`} />} />}
			{menu && <AppMenu title={menu.title} hideDetail={menu.app ? tt('app.youCanAddItBack') : tt('app.youCanAddItBack2')} showUninstall={!!menu.app} blockedReason={menuBlocked} isFavourite={config.favourites.indexOf(menu.key) !== -1} onFavourite={() => { onFavourite('', menu.key); setMenu(null); }} onReorder={config.orderByRecent || menu.key === MISC.lgHome || menu.key === MISC.settings || menu.key === MISC.system ? undefined : () => startMoveMode(menu.key)} onHide={() => hideTile(menu)} onUninstall={() => { if (menu.app) removeApp(menu.app); }} startAtConfirm={!!menu.direct} settingsDetail={menu.direct ? undefined : hidePractice ? tt('appmenu.settingsPractice') : config.hideSettings && !tileBack ? tt('appmenu.settingsDetail') : undefined} onSettings={onMenuSettings} onClose={() => setMenu(null)} />}
			{screen === 'source' && (editedSource || editedApp) && (
				<SourceEditor
					base={editedSource ? {label: editedSource.label, icon: autoIcon(editedSource.icon)} : {label: editedApp!.title, icon: '', image: editedApp!.iconUrl}}
					kind={editedSource ? 'source' : 'app'}
					edit={config[storeKey][editedKey] || {}}
					onChange={changeEdit}
					onBrowse={() => { if (rootState() === 'no') showToast(tt('app.choosingAPictureNeeds'), 'error'); else setScreen('iconpicker'); }}
					canBrowse={rootState() !== 'no'}
					onClose={() => setScreen('settings')}
				/>
			)}
			{screen === 'iconpicker' && (editedSource || editedApp) && (
				<Picker
					forIcon
					onChoose={(choice) => {
						if (choice.mode !== 'image') return;
						setScreen('source');
						iconFromFile(choice.path).then(
							(data) => changeEdit({iconData: data}),
							() => showToast(tt('app.couldnTUseThat') + whySuffix(), 'error')
						);
					}}
					onClose={() => setScreen('source')}
				/>
			)}
			{screen === 'picker' && <Picker onChoose={onChooseWallpaper} onClose={() => setScreen('settings')} />}
			{screen === 'essedit' && <EssentialsEdit chosen={essentialIds(config)} onChange={(list) => patchConfig({essentials: list})} onClose={() => setScreen('settings')} />}
			{screen === 'preload' && <Preload apps={apps} onClose={() => setScreen('settings')} onChanged={(n) => setConfig((c) => { if (c.preloadOff === n) return c; const next = {...c, preloadOff: n}; saveConfig(next); return next; })} onToast={showToast} />}
			{screen === 'updates' && <Updates debug={config.showDebug} paused={!!notice} notify={setNotice} closeNotice={() => setNotice(null)} onClose={() => setScreen('settings')} />}
			{screen === 'extrakeys' && <ExtraKeys targets={remapTargets} model={config.remoteModel} onModel={onRemoteModel} paused={!!notice} onLgHomeCheck={askLgHome} onClose={() => setScreen('settings')} onToast={showToast} />}
			{screen === 'themes' && <Picker forTheme onChoose={() => undefined} onClose={() => setScreen('settings')} onTheme={(path) => loadThemeZip(path, apps.map((a) => a.id)).then((outcome: LoadOutcome) => {
				if (outcome.ok) { setScreen('settings'); afterTheme(outcome, tt('app.themeLoaded')); }
				else setNotice({title: tt('app.themeNotLoaded'), text: tt('app.nothingWasChanged', {reason: outcome.reason}), buttons: [{label: tt('app.ok4'), tone: 'light', run: () => setNotice(null)}], onBack: () => setNotice(null)});
			})} />}
			{screen === 'languages' && <Picker forLanguage onChoose={() => undefined} onClose={() => setScreen('settings')} onLanguage={(path) => loadPackFile(path).then((outcome) => {
				if (outcome.ok) { setConfig((c) => { const next = {...c, language: PACK_ID}; saveConfig(next); return next; }); setScreen('settings'); showToast(tt('app.languageLoaded', {name: outcome.name, summary: outcome.summary})); }
				else setNotice({title: tt('app.languageNotLoaded'), text: tt('app.nothingWasChanged', {reason: outcome.reason}), buttons: [{label: tt('app.ok4'), tone: 'light', run: () => setNotice(null)}], onBack: () => setNotice(null)});
			})} />}
			{screen === 'poweron' && (
				<PowerOnPicker
					choices={powerOnChoices}
					chosen={systemInfo.powerOn ? systemInfo.powerOn.chosen : config.powerOnApp}
					network={powerOnNetwork}
					networkKeys
					restartNeeded={needsRestart(systemInfo.powerOn)}
					untilRestart={systemInfo.powerOn ? powerOnName(systemInfo.powerOn.loaded, powerOnNames.loaded) : powerOnName('')}
					busy={powerOnBusy}
					onChoose={onPowerOnChoose}
					onNetwork={onPowerOnNetwork}
					onRestart={onPowerOnRestart}
					onClose={() => setScreen('settings')}
				/>
			)}
			{screen === 'homekey' && <HomeKey model={config.remoteModel} onModel={onRemoteModel} onClose={() => setScreen('settings')} onChanged={(code) => setSystemInfo((previous) => ({...previous, homeKey: code}))} onToast={showToast}  onAuto={onAutoMap} paused={!!notice} />}
			{screen === 'saverpicker' && <Picker forSaver onBuiltinVideo={onChooseSaverVideo} onChoose={onChooseSaver} onClose={() => setScreen('settings')} />}
			{WEATHER_ENABLED && screen === 'cities' && <CityPicker allowShell={isWebOS()} onChoose={onChooseCity} onClose={() => setScreen('settings')} />}
		{PLEX_ENABLED && screen === 'plexsignin' && <PlexSignIn start={plexStart} onDone={onPlexDone} onClose={() => { setPlexAuth(readAuth()); setScreen('settings'); }} />}
			{/* W2: last, so a pop-up is in front of every screen (all screens share one layer; the later one is on top) */}
			{notice && <Notice title={notice.title} text={notice.text} buttons={notice.buttons} onBack={notice.onBack} />}
			<Toast message={toast} />
		</>
	);
}
