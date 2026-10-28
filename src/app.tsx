import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Home, type Appearance} from './screens/Home';
import {Settings, type SettingsTab} from './screens/Settings';
import {Picker, type WallpaperChoice} from './screens/Picker';
import {CityPicker} from './screens/CityPicker';
import {Recents} from './screens/Recents';
import {SourceEditor} from './screens/SourceEditor';
import {PowerOnPicker, type PowerOnChoice} from './screens/PowerOnPicker';
import {iconFromFile} from './lib/customicon';
import {log, logLines} from './lib/log';
import {debugPages, reportText} from './lib/debuginfo';
import {HEARTH_VERSION} from './config/version';
import {autoIcon, setEdit, type SourceEdit} from './lib/sourceicons';
import {Toast, type ToastMessage} from './components/Toast';
import {PhotoShow, Wallpaper} from './components/Wallpaper';
import type {TileModel} from './components/Tile';
import {forgetTv, pairWithTv} from './lib/ssap';
import {cacheApps, cachedApps, listApps, probeRoot, type AppEntry} from './lib/apps';
import {failureText, lastFailure, lastFailureDetail, rootState, whySuffix} from './lib/failure';
import {keepKnownIcons, sameApps} from './lib/appcache';
import type {TimeFormat} from './lib/clock';
import {listInputs, MOCK_INPUTS, type InputSource} from './lib/inputs';
import {launchApp, launchLgHome, launchSystemSettings} from './lib/launch';
import {isWebOS} from './lib/luna';
import {hidePointerOnForeground} from './lib/pointer';
import {startLogFile, writeReport, previousRunLines} from './lib/logfile';
import {readStats, type SystemStats, getLogo, setLogo, closeLgHome} from './lib/system';
import {applyHomeHook, getHookStatus, hookMessage, installHomeHook, logLine, markAliveSoon, reapplyHomeHook, removeHomeHook, stockHome} from './lib/homehook';
import {clearPowerOnApp, powerOnMessage, readPowerOn, restartTv, setPowerOnApp} from './lib/poweron';
import {needsRestart, powerOnName} from './lib/poweroncmd';
import {getTakeoverStatus, installTakeover, reapplyTakeover, removeTakeover, stockTakeover, takeoverMessage} from './lib/takeover';
import {applyPref, disabledReason, findPref, optionsFor, resetLook, type Press, type SystemInfo} from './lib/prefs';
import {loadConfig, saveConfig, toggleId, DEFAULT_WALLPAPER, type UserConfig} from './lib/storage';
import {applyTheme, THEMES} from './theme/tokens';
import {setRootVars} from './lib/cssvars';
import {applyBackground, NATURE_SHOW} from './lib/backgrounds';
import {mark} from './lib/perfmarks';
import {aboutText, readHomebrewVersion, readIp, readVersions, type Versions} from './lib/about';
import {useTimeFormat} from './hooks/useTimeFormat';
import {AppMenu} from './components/AppMenu';
import {extendOrder, hiddenAfterUpgrade, toggleHidden, visibleApps} from './lib/apporder';
import {addTvInput, removeTvInput, TV_INPUT_LOG} from './lib/tvinput';
import {uninstallApp, uninstallVerdict, UNINSTALL_LOG} from './lib/uninstall';
import {appTile, inputTile, pickInOrder} from './lib/tiles';
import {moveKey, movesFor, orderTiles, orderUpdate, reslot, type MoveAction} from './lib/tileorder';
import {APP_ID, TIMING, WALLPAPER} from './config/constants';
import {PROBE_ENABLED, WEATHER_ENABLED} from './config/features';
import {PROBE_TESTS, RUN_ALL_ID, bad as probeBad, probeOptions, runAll, withLimit, type ProbeState} from './lib/probe';
import {fetchWeather} from './lib/weathernet';
import {FRESH_MS, isFresh, readWeatherCache, usableCached, weatherView, writeWeatherCache, type City, type WeatherData} from './lib/weather';

type Screen = 'home' | 'settings' | 'picker' | 'cities' | 'source' | 'iconpicker' | 'poweron';

const TAB = {apps: 'apps', sources: 'sources', look: 'look', clock: 'clock', weather: 'weather', wallpaper: 'wallpaper', options: 'options', debug: 'debug', tests: 'tests'} as const;
const MISC = {lgHome: 'lg-home', settings: 'settings', system: 'system-settings'} as const;

/** The three tiles that always end the row. */
const MISC_TILES: TileModel[] = [
	{key: MISC.lgHome, label: 'LG Home', glyph: 'house'},
	{key: MISC.system, label: 'System Settings', glyph: 'tv'},
	{key: MISC.settings, label: 'Hearth Settings', glyph: 'gear'}
];

export function App () {
	const [screen, setScreen] = useState<Screen>('home');
	const settingsOpen = screen !== 'home';   // Settings stays open under its sub-screens (editor, pickers)
	const [config, setConfig] = useState<UserConfig>(loadConfig);
	const [apps, setApps] = useState<AppEntry[]>(cachedApps);      // last known list: the row is drawn at once
	const statsRef = useRef<SystemStats | null>(null);
	const [debugTick, setDebugTick] = useState(0);                    // bumped when the Debug tab opens, so it shows fresh events
	const listInfo = useRef<{source: string; count: number; at: number} | null>(null);
	const weatherNote = useRef('off');
	const [editKey, setEditKey] = useState<string | null>(null);      // the source being edited (Settings → Apps or Sources → hold OK on a tile)
	const [versions, setVersions] = useState<Versions>({});          // shown at the bottom right of Settings (read when Settings opens)
	const [probe, setProbe] = useState<ProbeState>({});            // Tests tab (probe builds only): answers shown in the rows
	const [asleep, setAsleep] = useState(document.hidden);
	const [wakes, setWakes] = useState(0);                    // counts each return to the front (Home pressed)
	const [wallpaperOn, setWallpaperOn] = useState(!document.hidden);
	const wasHidden = useRef(document.hidden);
	const [recents, setRecents] = useState(false);          // the Recent apps panel (Back on the home screen)
	const openRecents = useCallback(() => setRecents(true), []);
	const closeRecents = useCallback(() => setRecents(false), []);
	const [menu, setMenu] = useState<{key: string; title: string; app: AppEntry | null} | null>(null);   // the tile whose Move / Hide / Uninstall menu is open
	const [focus, setFocus] = useState<{key: string; seq: number} | undefined>(undefined);               // asks Home to follow a moved tile
	const replaceRef = useRef(config.replaceHome || config.takeoverHome);
	const [allInputs, setInputs] = useState<InputSource[]>([]);
	// the launcher itself may be in the TV's input list (see Options): it is not offered as a source
	const inputs = useMemo(() => allInputs.filter((i) => i.appId !== APP_ID), [allInputs]);
	const tvInput: boolean | null = allInputs.length === 0 ? null : allInputs.some((i) => i.appId === APP_ID);
	const [weather, setWeather] = useState<WeatherData | null>(() => (WEATHER_ENABLED ? readWeatherCache() : null));
	const weatherRef = useRef(weather);
	weatherRef.current = weather;
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastTimer = useRef(0);
	const closedAt = useRef(0);
	const [systemInfo, setSystemInfo] = useState<SystemInfo>({homeHook: null});
	const [powerOnBusy, setPowerOnBusy] = useState(false);                                 // "When the TV turns on" is being changed
	const tvFormat = useTimeFormat();

	// With the hand-over helper on, note in its log how long this launcher took to show its first screen.
	useEffect(() => {
		if (!config.replaceHome || !isWebOS()) return undefined;
		const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
			const began = window.performance && window.performance.timing ? window.performance.timing.navigationStart : 0;
			markAliveSoon(began ? `launcher: first screen ${Date.now() - began} ms after the page started (hidden: ${document.hidden})` : undefined);
		}));
		return () => window.cancelAnimationFrame(frame);
	}, []);

	// Just after the TV starts the background helper may not be running yet (it is only started at boot when the
	// "at boot" link is on), and until it is, the Home button shows LG Home for a moment. So right after the first
	// screen is up, one light call makes sure it is running, tried again a few times if the Homebrew service is not
	// up yet. (The heavier check, which can rewrite the helper's files, still waits as before.)
	useEffect(() => {
		if (!config.replaceHome || !isWebOS()) return undefined;
		const delays = [1200, 3000, 6000, 12000, 25000, 50000];
		let cancelled = false;
		let timer = 0;
		const attempt = (n: number) => applyHomeHook().then((result) => {
			if (cancelled || result !== 'failed' || n + 1 >= delays.length) return;
			timer = window.setTimeout(() => attempt(n + 1), delays[n + 1]);
		});
		timer = window.setTimeout(() => attempt(0), delays[0]);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, []);

	// Colours follow the theme setting.
	useEffect(() => {
		const a = config.fadeStrength / 100;
		setRootVars({'--fade-display': a > 0 ? 'block' : 'none', '--fade-height': `${config.fadeHeight}%`, '--fade-a': String(a), '--fade-b': (a * 0.55).toFixed(3), '--fade-c': (a * 0.2).toFixed(3)});
	}, [config.fadeStrength, config.fadeHeight]);
	useEffect(() => { applyTheme(config.theme); applyBackground(config.background, THEMES[config.theme]); }, [config.theme, config.background]);

	useEffect(() => { document.documentElement.classList.toggle('look-minimal', config.minimal); }, [config.minimal]);

	useEffect(() => { log(`Hearth ${HEARTH_VERSION} started`); return startLogFile(TIMING.backgroundWorkMs + 1000); }, []);

	const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
		window.clearTimeout(toastTimer.current);
		if (kind === 'error') log('Problem shown: ' + text);
		setToast({text, kind});
		toastTimer.current = window.setTimeout(() => setToast(null), TIMING.toastMs);
	}, []);

	// Start in remote (5-way) mode: hide the Magic Remote pointer whenever we come to the
	// front. Shaking the remote still brings it back.
	useEffect(() => hidePointerOnForeground(), []);

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
							showToast(added > 0 ? `${added} new ${added === 1 ? 'app' : 'apps'} found` : 'The app list is up to date');
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
					lastLoad.current = 0;
					if ((manual || !told) && rootState() !== 'no') { told = true; showToast(`Using the built-in app list${whySuffix() || '. The Homebrew Channel is not available yet'}`, 'error'); }
					retry();
				})
				.catch(() => {
					if (cancelled) return;
					// the saved full list stays on screen; try again later without a word
					if (haveFull.current) retry();
					else if (manual || !told) { told = true; showToast(`Could not read the app list${whySuffix()}`, 'error'); }
				});
		};
		// Not needed to draw the home screen, and it is a lot of work for the TV (a shell command and the icons), so
		// it waits until the launcher has been up for a few seconds (at once only when there is no saved list to show).
		timer = window.setTimeout(() => { if (woke && document.hidden) return; load(0); }, hadCache.current || woke ? TIMING.backgroundWorkMs : 0);
		hadCache.current = false;
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [wakes, reloads, showToast]);

	// In the background the launcher lets go of its wallpaper (the big bitmap) and stops its clock, but it
	// keeps its screen: if the TV ever reports "hidden" wrongly, the launcher must still be visible,
	// not a black screen. The state is also re-read every second as a safety net.
	// (under the takeover too: its watcher asks for this mark after opening Hearth, as the helper does)
	replaceRef.current = config.replaceHome || config.takeoverHome;
	useEffect(() => {
		const sync = (why: string) => {
			const hidden = document.hidden;
			if (wasHidden.current && !hidden) setWakes((n) => n + 1);
			wasHidden.current = hidden;
			setAsleep((was) => {
				if (was !== hidden && replaceRef.current) {
					// the helper checks for the "alive" mark after opening the launcher
					if (hidden) logLine(`launcher: hidden (${why})`);
					else markAliveSoon(`launcher: visible (${why})`);
				}
				return hidden;
			});
			if (hidden) { setScreen('home'); setMenu(null); setRecents(false); }
		};
		const onVisibility = () => sync('event');
		document.addEventListener('visibilitychange', onVisibility);
		const poll = window.setInterval(() => sync('check'), 1000);
		// Home pressed while the launcher is already in front: the TV relaunches it without hiding it first.
		const onRelaunch = () => {
			setScreen('home'); setMenu(null); setRecents(false); setWakes((n) => n + 1);
			// Home pressed while in front: the launcher never became hidden, so tell the helper it is here
			// (otherwise its check could think the launcher failed to show and open it again and again)
			if (replaceRef.current) markAliveSoon('launcher: relaunched while in front');
		};
		document.addEventListener('webOSRelaunch', onRelaunch);
		return () => { document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('webOSRelaunch', onRelaunch); window.clearInterval(poll); };
	}, []);

	const recentIcons = useMemo(() => { const m: Record<string, string | undefined> = {}; apps.forEach((a) => { m[a.id] = a.iconUrl; }); return m; }, [apps]);

	// The bundled-photo slideshow is drawn (and timed) by PhotoShow; it pauses while the launcher is in the background.
	const natureShow = config.background === NATURE_SHOW && config.wallpaper.mode === 'gradient';

	// The wallpaper stays loaded for a while after the launcher goes to the background, so pressing Home
	// again finds it ready (no fade-in). After that it is released to give the memory back.
	useEffect(() => {
		if (!asleep) { setWallpaperOn(true); return undefined; }
		const timer = window.setTimeout(() => setWallpaperOn(false), WALLPAPER.releaseAfterMs);
		return () => window.clearTimeout(timer);
	}, [asleep]);

	// Inputs are only read when they're needed: some are on the home row, or Settings is open.
	const needInputs = config.sourceIds.length > 0 || screen === 'settings';
	useEffect(() => {
		if (!needInputs) return undefined;
		const refresh = () => {
			if (!isWebOS()) { setInputs(MOCK_INPUTS); return; }
			listInputs().then(setInputs).catch(() => showToast('Could not read the inputs', 'error'));
		};
		refresh();
		const onVisibility = () => { if (!document.hidden) refresh(); };
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [needInputs, showToast]);

	// Which app the TV's Home button opens: read when Settings opens, so the Options row is right.
	useEffect(() => {
		// note the real size of the screen in the helper's log: this is what to look at if a list ever looks wrong on some TV
		if (settingsOpen && isWebOS()) {
			const chrome = /Chrome\/([0-9.]+)/.exec(navigator.userAgent);
			logLine(`launcher: settings opened, window ${window.innerWidth}x${window.innerHeight}, pixel ratio ${window.devicePixelRatio}, screen ${window.screen.width}x${window.screen.height}, web view ${chrome ? chrome[1] : 'unknown'}`);
		}
		// One tiny command first: can this TV run commands at all? If not, the rows that need that are greyed out
		// with the reason, and the other status reads (which would only fail) are skipped.
		if (settingsOpen) {
			let live = true;
			readVersions().then((v) => { if (live) setVersions((p) => ({...p, ...v})); });
			readIp().then((ip) => { if (live && ip) setVersions((p) => ({...p, ip})); });
			probeRoot().then((root) => {
				const rootDetail = lastFailureDetail();
				log(root === 'yes' ? 'Root check: the Homebrew Channel answered' : `Root check: not available (${rootDetail || 'no answer'})`);
				if (!live) return undefined;
				if (root === 'yes') readHomebrewVersion().then((homebrew) => { if (live && homebrew) setVersions((p) => ({...p, homebrew})); });
				if (root === 'no') { setSystemInfo({homeHook: null, logo: null, takeover: null, powerOn: null, root, rootDetail}); return undefined; }
				return Promise.all([getHookStatus(), getLogo(), getTakeoverStatus(), readPowerOn()]).then(([homeHook, logo, takeover, powerOn]) => { if (live) setSystemInfo({homeHook, logo, takeover, powerOn, root, rootDetail}); });
			});
			return () => { live = false; };
		}
		return undefined;
	}, [settingsOpen]);

	// "Replace LG Home with a script and SAM": shortly after we come to the front, make sure Hearth still holds LG
	// Home's place (a restart, or choosing the LG Home tile, puts LG Home back until this runs). Cheap when it is in
	// place. If this TV cannot do it, the setting turns itself off and LG Home is left as it was.
	useEffect(() => {
		if (!config.takeoverHome || !isWebOS()) return undefined;
		let timer = 0;
		let cancelled = false;
		const run = (attempt: number) => reapplyTakeover().then(({result, detail, fatal, unreachable}) => {
			if (cancelled) return;
			if (unreachable) {
				if (attempt < 4) timer = window.setTimeout(() => { if (!document.hidden) run(attempt + 1); }, [10000, 30000, 90000, 240000][attempt]);
				return;
			}
			if (!fatal) return;
			setConfig((c) => { const next = {...c, takeoverHome: false}; saveConfig(next); return next; });
			removeTakeover();
			showToast(takeoverMessage(result, detail), 'error');
		});
		const arm = () => {
			window.clearTimeout(timer);
			if (document.hidden) return;
			// quickly: until this has run, nothing on the TV is watching for LG Home (the release helper's first try is at 1.2 s)
			timer = window.setTimeout(() => run(0), 500);
		};
		arm();
		document.addEventListener('visibilitychange', arm);
		return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', arm); };
	}, [config.takeoverHome, showToast]);

	// Shortly after we come to the front (not at the very first moment, while the TV is still switching
	// apps): make sure the hand-over helper is running (if it is switched on), and end LG's home app to
	// free memory. If we are pushed to the back again within seconds, LG Home has come back in front of
	// us, so "Close LG Home" turns itself off (not needed when the helper is on: it hands straight back).
	useEffect(() => {
		if (config.takeoverHome || !isWebOS()) return undefined;
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
	}, [config.closeHome, config.replaceHome, config.takeoverHome, showToast]);

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
					if (failures === 0 && !usableCached(weatherRef.current, city.lat, city.lon, Date.now())) showToast("Couldn't get the weather yet. Check the TV's internet connection. It will try again", 'error');
					timer = window.setTimeout(run, backoff[Math.min(failures, backoff.length - 1)]);
					failures++;
				}
			);
		};
		const now = Date.now();
		const known = weatherRef.current;
		const wait = isFresh(known, city.lat, city.lon, now) && known
			? Math.max(0, FRESH_MS - (now - known.at))
			: (usableCached(known, city.lat, city.lon, now) ? TIMING.backgroundWorkMs : 1500);
		timer = window.setTimeout(run, wait);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [wxCity !== null, wxLat, wxLon, wakes, showToast]);

	const weatherLine = useMemo(() => {
		if (!wxCity) return null;
		const data = usableCached(weather, wxCity.lat, wxCity.lon, Date.now());
		return data ? weatherView(data, wx.unit, wx.showRange, wx.showCity ? wxCity.name : '') : null;
	}, [weather, wxCity, wx.unit, wx.showRange, wx.showCity]);

	// Tell the user once if the safety switch-off fired.
	useEffect(() => {
		const onVisibility = () => {
			if (document.hidden) return;
			try {
				if (localStorage.getItem('customlauncher-homekill-off')) {
					localStorage.removeItem('customlauncher-homekill-off');
					showToast('Closing LG Home was switched off: LG Home kept coming back to the front', 'error');
				}
			} catch { /* ignore */ }
		};
		onVisibility();
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [showToast]);

	const updateConfig = (next: UserConfig) => { setConfig(next); saveConfig(next); };

	// ----- derived lists -----
	const shownApps = useMemo(
		() => visibleApps(apps, config.appIds, config.hiddenIds),
		[apps, config.appIds, config.hiddenIds]
	);
	const shownInputs = useMemo(() => pickInOrder(inputs, config.sourceIds, (s) => s.appId), [inputs, config.sourceIds]);

	// apps and inputs share one order (Move to start / left / right / end); LG Home and Settings always end the row
	const orderedTiles: TileModel[] = useMemo(
		() => orderTiles(shownApps.map((a) => appTile(a, config.appEdits)).concat(shownInputs.map((i) => inputTile(i, config.sourceEdits))), (t) => t.key, config.tileOrder),
		[shownApps, shownInputs, config.tileOrder, config.sourceEdits, config.appEdits]
	);
	const homeItems: TileModel[] = useMemo(
		() => orderedTiles.concat(MISC_TILES.filter((t) => (t.key === MISC.lgHome ? config.showLgHome : t.key === MISC.system ? config.showSystem : true))),
		[orderedTiles, config.showLgHome, config.showSystem]
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
	const onTab = useCallback((id: string) => {
		if (id !== TAB.debug) return;
		setDebugTick((n) => n + 1);
		if (rootState() !== 'yes') return;
		const save = () => writeReport(reportText(buildDebug(), logLines(), previousRunLines()));
		readStats().then((st) => { statsRef.current = st; setDebugTick((n) => n + 1); save(); });
	}, [config, versions]);                                                  // eslint-disable-line react-hooks/exhaustive-deps

	// ----- When the TV turns on, open… -----
	// The choices: the TV's own default, Hearth, then every app by name.
	const powerOnChoices: PowerOnChoice[] = useMemo(() => {
		const list: PowerOnChoice[] = [
			{id: '', label: "Live TV or the last input (the TV's default)", detail: 'What the TV does on its own: the input you used last, usually Live TV'},
			{id: APP_ID, label: 'Hearth', detail: 'This home screen'}
		];
		apps.filter((a) => a.id !== APP_ID).slice().sort((a, b) => a.title.localeCompare(b.title))
			.forEach((a) => list.push({id: a.id, label: a.title, detail: 'App'}));
		return list;
	}, [apps]);
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
		showToast('Saving…');
		(id ? setPowerOnApp(id, network) : clearPowerOnApp()).then(({result, detail, status}) => {
			setPowerOnBusy(false);
			setSystemInfo((previous) => ({...previous, powerOn: status}));
			const ok = result === 'applied' || result === 'removed';
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
		applyPowerOn(id, !!id && powerOnNetwork, `Done: the TV opens ${powerOnName(id, powerOnTitle(id))} when you turn it on`);
	}, [applyPowerOn, powerOnNetwork, powerOnTitle]);
	const onPowerOnNetwork = useCallback(() => {
		const app = systemInfo.powerOn ? systemInfo.powerOn.chosen : config.powerOnApp;
		if (app) applyPowerOn(app, !powerOnNetwork, powerOnNetwork ? 'Done: network wake-ups go where they ask again' : 'Done: network wake-ups open it too');
	}, [applyPowerOn, powerOnNetwork, systemInfo.powerOn, config.powerOnApp]);

	const onPowerOnRestart = useCallback(() => {
		showToast('Restarting the TV…');
		restartTv().then((started) => { if (!started) showToast(`The TV did not restart${whySuffix()}. Restart it from its own settings, or unplug it for a minute`, 'error'); });
	}, [showToast]);

	const tabs: SettingsTab[] = useMemo(() => [
		{id: TAB.apps, label: 'Apps', noun: 'apps', refresh: true, items: orderTiles(apps.map((a) => appTile(a, config.appEdits)), (t) => t.key, config.appIds), shown: shownApps.map((a) => appTile(a, config.appEdits)), edit: true},
		{id: TAB.sources, label: 'Sources', noun: 'sources', items: inputs.map((i) => inputTile(i, config.sourceEdits)), shown: shownInputs.map((i) => inputTile(i, config.sourceEdits)), edit: true},
		{id: TAB.look, label: 'Look', noun: '', items: [], shown: [], options: optionsFor('look', config)},
		{id: TAB.clock, label: 'Clock', noun: '', items: [], shown: [], options: optionsFor('clock', config)},
		...(WEATHER_ENABLED ? [{id: TAB.weather, label: 'Weather', noun: '', items: [], shown: [], options: optionsFor('weather', config)}] : []),
		{id: TAB.wallpaper, label: 'Wallpaper', noun: '', items: [], shown: [], options: optionsFor('wallpaper', config)},
		{id: TAB.options, label: 'Options', noun: '', items: [], shown: [], options: optionsFor('options', config, {...systemInfo, tvInput, powerOnNames})},
		...(config.showDebug ? [{id: TAB.debug, label: 'Debug', noun: '', items: [], shown: [], pages: debugPagesNow}] : []),
		...(PROBE_ENABLED && config.showDebug ? [{id: TAB.tests, label: 'Tests', noun: '', items: [], shown: [], options: probeOptions(probe)}] : [])
	], [apps, inputs, shownApps, shownInputs, config, systemInfo, tvInput, powerOnNames, probe, debugPagesNow]);

	const editedSource = editKey ? inputs.filter((i) => i.appId === editKey)[0] : undefined;
	const editedApp = editKey && !editedSource ? apps.filter((a) => a.id === editKey)[0] : undefined;
	const editedKey = editedSource ? editedSource.appId : editedApp ? editedApp.id : '';
	const storeKey: 'sourceEdits' | 'appEdits' = editedSource ? 'sourceEdits' : 'appEdits';
	const changeEdit = (patch: SourceEdit) => setConfig((c) => { const next = {...c, [storeKey]: setEdit(c[storeKey], editedKey, patch)}; saveConfig(next); return next; });

	const appearance: Appearance = useMemo(
		() => ({iconScale: config.iconScale, iconOpacity: config.iconOpacity, labelColor: config.labelColor, iconGap: config.iconGap, tileShape: config.tileShape, quietSec: config.quietSec, oledShift: config.oledShift, sideMargin: config.sideMargin, bottomMargin: config.bottomMargin, showLabels: config.showLabels, rows: config.rows, clock: config.clock}),
		[config.iconScale, config.iconOpacity, config.labelColor, config.iconGap, config.tileShape, config.quietSec, config.oledShift, config.sideMargin, config.bottomMargin, config.showLabels, config.rows, config.clock]
	);

	// ----- actions -----
	const onActivate = useCallback((item: TileModel) => {
		if (item.key === MISC.settings) { setScreen('settings'); return; }
		if (item.key === MISC.system) { launchSystemSettings().catch(() => showToast("Couldn't open the TV's settings", 'error')); return; }
		if (item.key === MISC.lgHome) {
			const open = () => launchLgHome().catch(() => showToast("Couldn't open LG Home", 'error'));
			// With LG Home replaced, the real one is put back first (it comes back at the next launch of this launcher).
			if (config.takeoverHome) {
				// the real LG Home is put back first (takes a few seconds); Hearth takes its place again once LG Home is left
				showToast('Opening LG Home…');
				stockTakeover().then((result) => {
					if (result === 'stock') open();
					else if (result === 'unsupported') showToast('LG Home is replaced on this TV. Switch off "Replace LG Home with a script and SAM" in Settings to use it', 'error');
					else showToast("Couldn't put LG Home back", 'error');
				});
			}
			else if (config.replaceHome) stockHome().then(() => window.setTimeout(open, 1200));
			else open();
			return;
		}
		// With the helper on: say the launcher is alive and note what is being opened, so the helper's check
		// can never mistake this moment for a failure, and its log shows what happened if an app does not open.
		if (config.replaceHome) markAliveSoon(`launcher: opening ${item.key}`, false);
		launchApp(item.key).catch(() => {
			if (config.replaceHome) logLine(`launcher: the TV refused to open ${item.key}`);
			showToast(`Couldn't open ${item.label}`, 'error');
		});
	}, [showToast, config.replaceHome, config.takeoverHome]);

	const onToggle = useCallback((tabId: string, key: string) => {
		if (tabId === TAB.apps) {
			// apps are shown unless hidden: OK adds the app to the hide-list, or takes it off
			const hidden = config.hiddenIds !== null ? config.hiddenIds : hiddenAfterUpgrade(apps, config.appIds);
			updateConfig({...config, hiddenIds: toggleHidden(hidden, key)});
		} else {
			updateConfig({...config, sourceIds: toggleId(config.sourceIds, key)});
		}
	}, [config, apps]);

	/** Replace a row's order with `keys` (the full list of what's shown). */
	const onReorder = useCallback((tabId: string, keys: string[]) => {
		// the tiles of this tab take the places they already hold on the shared row, in their new order
		const whole = reslot(orderedTiles.map((t) => t.key), keys);
		const update = orderUpdate(whole, shownApps.map((a) => a.id), shownInputs.map((i) => i.appId), config.appIds, config.sourceIds);
		const hiddenIds = config.hiddenIds !== null ? config.hiddenIds : hiddenAfterUpgrade(apps, config.appIds);
		updateConfig({...config, tileOrder: update.tileOrder, hiddenIds, appIds: tabId === TAB.apps ? keys.concat((config.appIds || []).filter((id) => keys.indexOf(id) === -1)) : update.appIds, sourceIds: tabId === TAB.sources ? keys : update.sourceIds});
	}, [config, apps, orderedTiles, shownApps, shownInputs]);

	const changeOption = useCallback((optionId: string, press: Press) => {
		if (PROBE_ENABLED && optionId.indexOf('probe:') === 0) {
			if (press !== 'ok') return;
			const start = (id: string) => setProbe((p) => ({...p, [id]: {state: 'running'}}));
			const done = (id: string, result: {ok: boolean; text: string}) => setProbe((p) => ({...p, [id]: {state: 'done', result}}));
			if (optionId === RUN_ALL_ID) { runAll(PROBE_TESTS, start, done); return; }
			const test = PROBE_TESTS.filter((t) => 'probe:' + t.id === optionId)[0];
			if (!test) return;
			start(test.id);
			withLimit(test).then((r) => done(test.id, r), (e) => done(test.id, probeBad(e)));
			return;
		}
		const pref = findPref(optionId);
		if (!pref) return;
		const blocked = disabledReason(optionId, systemInfo);
		if (blocked) { showToast(blocked, 'error'); return; }
		if (optionId === 'weatherOn' && !config.weather.city) { showToast('Choose a city first'); setScreen('cities'); return; }
		if (optionId === 'wallpaper' && press === 'ok') { setScreen('picker'); return; }       // OK: pick a picture or folder; ← → step the built-in backgrounds
		if (pref.kind === 'action') {
			if (optionId === 'weatherCity') setScreen('cities');
			else if (optionId === 'powerOnApp') {
				if (systemInfo.powerOn && systemInfo.powerOn.foreign) showToast(powerOnMessage('foreign'), 'error');
				else setScreen('poweron');
			}
			else if (optionId === 'resetLook') { updateConfig(resetLook(config)); showToast('Look and clock reset'); }
			else if (optionId === 'takeover') {
				const refresh = () => getTakeoverStatus().then((takeover) => setSystemInfo((previous) => ({...previous, takeover})));
				const on = !!(systemInfo.takeover ? systemInfo.takeover.enabled : config.takeoverHome);
				if (on) {
					showToast('Putting LG Home back…');
					removeTakeover().then((freed) => {
						updateConfig({...config, takeoverHome: !freed});
						refresh();
						showToast(freed ? 'Turned off. LG Home opens as usual' : "LG Home's place is still held. Restart the TV to finish", freed ? 'info' : 'error');
					});
				} else {
					showToast('Setting up… this can take up to a minute, and the screen may blink');
					installTakeover().then(({result, detail}) => {
						if (result === 'applied') updateConfig({...config, takeoverHome: true});
						refresh();
						showToast(takeoverMessage(result, detail), result === 'applied' ? 'info' : 'error');
					});
				}
			}
			else if (optionId === 'tvApps') {
				if (config.tvApps) { forgetTv(); updateConfig({...config, tvApps: false}); showToast('Turned off. The built-in list is used when there is no root'); }
				else {
					showToast('Look at the TV: when it asks to allow the connection, press OK on the remote (waiting up to a minute)');
					pairWithTv().then(() => {
						tvAppsRef.current = true;
						updateConfig({...config, tvApps: true});
						manualLoad.current = true;
						setReloads((n) => n + 1);
						showToast('Paired. Reading the app list…');
					}, (e) => showToast(`Could not pair: ${e && e.message ? e.message : e}. You can add apps by hand: see the README, "Adding your own apps"`, 'error'));
				}
			}
			else if (optionId === 'replaceHome') {
				const refresh = () => getHookStatus().then((homeHook) => setSystemInfo((previous) => ({...previous, homeHook})));
				const running = !!(systemInfo.homeHook && systemInfo.homeHook.running);
				if (running) {
					removeHomeHook().then(() => {
						updateConfig({...config, replaceHome: false});
						refresh();
						showToast('Turned off. LG Home opens as usual');
					});
				} else {
					showToast('Setting up...');
					installHomeHook().then(({result, detail}) => {
						if (result === 'applied') updateConfig({...config, replaceHome: true});
						refresh();
						showToast(hookMessage(result, detail), result === 'applied' ? 'info' : 'error');
					});
				}
			}
			else if (optionId === 'tvInput') {
				const adding = tvInput !== true;
				showToast(adding ? 'Adding the launcher as an input…' : 'Removing the launcher from the inputs…');
				(adding ? addTvInput() : removeTvInput())
					.then((accepted) => (isWebOS() ? listInputs() : Promise.resolve(MOCK_INPUTS)).then((list) => {
						setInputs(list);
						const listed = list.some((i) => i.appId === APP_ID);
						if (listed === adding) showToast(adding ? 'Added. Now set the TV to start on its last input, and pick this one' : 'Removed from the TV\'s inputs');
						else showToast(accepted ? "The TV accepted that but doesn't show the change yet. Check the TV's input list" : `The TV didn't accept that (details: ${TV_INPUT_LOG})`, 'error');
					}))
					.catch((error) => showToast(failureText(error, 'change the TV input'), 'error'));
			}
			else if (optionId === 'lgLogo') {
				const wantOn = systemInfo.logo !== 'on';
				showToast('Changing…');
				setLogo(wantOn).then((ok) => getLogo().then((logo) => {
					setSystemInfo((previous) => ({...previous, logo}));
					showToast(ok ? (wantOn ? 'The LG logo will show when the TV starts' : 'The LG logo is turned off for the next start') : `The TV didn't accept that change${whySuffix()}`, ok ? 'info' : 'error');
				}));
			}
			return;
		}
		const next = applyPref(config, optionId, press);
		if (next !== config) updateConfig(next);
	}, [config, showToast, systemInfo, tvInput]);

	const onRefresh = useCallback(() => {
		manualLoad.current = true;
		showToast('Checking for new apps…');
		setReloads((n) => n + 1);
	}, [showToast]);

	const onOption = useCallback((optionId: string) => changeOption(optionId, 'ok'), [changeOption]);
	const onAdjust = useCallback((optionId: string, direction: -1 | 1) => changeOption(optionId, direction < 0 ? 'left' : 'right'), [changeOption]);

	const onChooseWallpaper = useCallback((choice: WallpaperChoice) => {
		const keep = {intervalSec: config.wallpaper.intervalSec, shuffle: config.wallpaper.shuffle};
		const wallpaper = choice.mode === 'gradient' || choice.mode === 'nature'
			? {...DEFAULT_WALLPAPER, ...keep}
			: {mode: choice.mode, path: choice.path, ...keep};
		updateConfig({...config, wallpaper, background: choice.mode === 'nature' ? NATURE_SHOW : config.background});
		setScreen('settings');
		showToast(choice.mode === 'nature' ? 'Starting the nature photo slideshow' : choice.mode === 'gradient' ? 'Built-in background restored' : choice.mode === 'image' ? 'Loading wallpaper…' : 'Starting slideshow…');
	}, [config, showToast]);

	const onChooseCity = useCallback((city: City) => {
		updateConfig({...config, weather: {...config.weather, city, on: true}});
		setScreen('settings');
		showToast(`Weather set to ${city.name}`);
	}, [config, showToast]);

	// Hold OK on an app or input: its Move / Hide (/ Uninstall) menu. LG Home and Settings have no menu.
	const onLongPress = useCallback((item: TileModel) => {
		if (item.key === MISC.lgHome || item.key === MISC.settings || item.key === MISC.system) return;
		const app = apps.find((a) => a.id === item.key) || null;
		setMenu({key: item.key, title: item.label, app});
	}, [apps]);

	const hideTile = useCallback((tile: {key: string; title: string; app: AppEntry | null}) => {
		onToggle(tile.app ? TAB.apps : TAB.sources, tile.key);
		setMenu(null);
		showToast(`${tile.title} hidden. Add it back in Settings → ${tile.app ? 'Apps' : 'Sources'}`);
	}, [onToggle, showToast]);

	// Move to start / left / right on the shared row of apps and inputs; the highlight follows the tile.
	const moveTile = useCallback((key: string, action: MoveAction) => {
		const keys = orderedTiles.map((t) => t.key);
		const next = moveKey(keys, key, action);
		const update = orderUpdate(next, shownApps.map((a) => a.id), shownInputs.map((i) => i.appId), config.hiddenIds !== null ? (config.appIds || []) : null, config.sourceIds);
		updateConfig({...config, tileOrder: update.tileOrder, appIds: update.appIds !== null ? update.appIds : config.appIds, sourceIds: update.sourceIds});
		setFocus((f) => ({key, seq: (f ? f.seq : 0) + 1}));
		setMenu(null);
	}, [config, orderedTiles, shownApps, shownInputs]);

	// Uninstall (after the menu's confirmation): remove it, then re-read the app list to see whether it is really gone.
	const removeApp = useCallback((app: AppEntry) => {
		uninstallApp(app.id).then((result) => listApps().then(
			({apps: list, source}) => { setApps(list); if (source !== 'catalog') cacheApps(list); },
			() => { if (result === 'removed') setApps((previous) => previous.filter((a) => a.id !== app.id)); }
		).then(() => {
			setMenu(null);
			if (result === 'removed') {
				updateConfig({...config, appIds: config.appIds ? config.appIds.filter((id) => id !== app.id) : null, hiddenIds: config.hiddenIds ? config.hiddenIds.filter((id) => id !== app.id) : config.hiddenIds});
				showToast(`Uninstalled ${app.title}`);
			} else {
				showToast(result === 'still-installed' ? `The TV did not uninstall ${app.title} (details: ${UNINSTALL_LOG})` : `Couldn't uninstall that app${whySuffix() || '. The TV did not accept the command'}`, 'error');
			}
		}));
	}, [config, showToast]);

	const menuVerdict = menu && menu.app ? uninstallVerdict(menu.app) : null;
	const menuBlocked = menuVerdict && !menuVerdict.ok ? menuVerdict.reason : null;
	const menuMoves = menu ? movesFor(orderedTiles.map((t) => t.key), menu.key) : {start: false, left: false, right: false, end: false};

	return (
		<>
			{wallpaperOn && natureShow && <PhotoShow intervalSec={config.wallpaper.intervalSec} shuffle={config.wallpaper.shuffle} paused={asleep} />}
			{wallpaperOn && !natureShow && <Wallpaper config={config.wallpaper} opacity={config.wallpaperOpacity} onProblem={(text) => showToast(text, 'error')} />}
			{/* Home stays mounted under the other screens so it keeps its focus position. */}
			<Home items={homeItems} timeFormat={timeFormat} appearance={appearance} active={screen === 'home' && !menu && !recents} paused={asleep} onActivate={onActivate} onLongPress={onLongPress} onBack={openRecents} wake={wakes} focus={focus} weather={weatherLine} />
			{recents && screen === 'home' && <Recents icons={recentIcons} width={config.recentsW} height={config.recentsH} onClose={closeRecents} onToast={showToast} />}
			{menu && <AppMenu title={menu.title} moves={menuMoves} hideDetail={menu.app ? 'You can add it back in Settings → Apps' : 'You can add it back in Settings → Sources'} showUninstall={!!menu.app} blockedReason={menuBlocked} onMove={(action) => moveTile(menu.key, action)} onHide={() => hideTile(menu)} onUninstall={() => { if (menu.app) removeApp(menu.app); }} onClose={() => setMenu(null)} />}
			{/* Settings stays mounted under the picker so it keeps its tab. */}
			{(screen !== 'home') && <Settings tabs={tabs} active={screen === 'settings'} onToggle={onToggle} onReorder={onReorder} onOption={onOption} onRefresh={onRefresh} onEdit={(key) => { setEditKey(key); setScreen('source'); }} onAdjust={onAdjust} onTab={onTab} onClose={() => setScreen('home')} about={aboutText(versions, rootState(), lastFailure())} />}
			{screen === 'source' && (editedSource || editedApp) && (
				<SourceEditor
					base={editedSource ? {label: editedSource.label, icon: autoIcon(editedSource.icon)} : {label: editedApp!.title, icon: '', image: editedApp!.iconUrl}}
					kind={editedSource ? 'source' : 'app'}
					edit={config[storeKey][editedKey] || {}}
					onChange={changeEdit}
					onBrowse={() => { if (rootState() === 'no') showToast('Choosing a picture needs the Homebrew Channel (root)', 'error'); else setScreen('iconpicker'); }}
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
							() => showToast("Couldn't use that picture" + whySuffix(), 'error')
						);
					}}
					onClose={() => setScreen('source')}
				/>
			)}
			{screen === 'picker' && <Picker onChoose={onChooseWallpaper} onClose={() => setScreen('settings')} />}
			{screen === 'poweron' && (
				<PowerOnPicker
					choices={powerOnChoices}
					chosen={systemInfo.powerOn ? systemInfo.powerOn.chosen : config.powerOnApp}
					network={powerOnNetwork}
					restartNeeded={needsRestart(systemInfo.powerOn)}
					untilRestart={systemInfo.powerOn ? powerOnName(systemInfo.powerOn.loaded, powerOnNames.loaded) : powerOnName('')}
					busy={powerOnBusy}
					onChoose={onPowerOnChoose}
					onNetwork={onPowerOnNetwork}
					onRestart={onPowerOnRestart}
					onClose={() => setScreen('settings')}
				/>
			)}
			{WEATHER_ENABLED && screen === 'cities' && <CityPicker allowShell={isWebOS()} onChoose={onChooseCity} onClose={() => setScreen('settings')} />}
			<Toast message={toast} />
		</>
	);
}
