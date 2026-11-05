import {useEffect, useRef} from 'preact/hooks';
import {varScope} from '../lib/cssvars';
import {log} from '../lib/log';
import {WALLPAPER} from '../config/constants';
import {PHOTO_IDS, photoUrl, nextPhoto, takeEarlyPhoto} from '../lib/backgrounds';
import type {WallpaperConfig} from '../lib/storage';
import {
	clearWallpaperCache, listImages, loadPicture, readWallpaperCache, releasePicture, createShuffleOrder,
	wallpaperCacheId, writeWallpaperCache, takeEarlyStatic, endEarlyStatic
} from '../lib/wallpaper';
import {t as tt} from '../i18n';

/** R9 (Each visit, interval 0): away this long = a new picture on return; delay of the picture change after a restart */
const AWAY_CHANGE_MS = 60000;
const RESTART_CHANGE_MS = 8000;
let restartHandled = false;

interface Props {
	config: WallpaperConfig;
	/** how solid the picture is, % (100 = fully) */
	opacity?: number;
	/** called (at most once per wallpaper choice) when pictures can't be shown; says why */
	onProblem: (text: string) => void;
}

/** Full-screen background: the default (black, or the calm gradient) with a picture or
 *  slideshow on top. Two layers cross-fade; the layer that faded out is emptied and its
 *  picture released, so only the picture on screen stays in memory.
 *
 *  Fast start: the picture last on screen is kept as a screen-sized copy in localStorage and
 *  shown at once when the launcher opens. A single picture then needs no further work; a
 *  slideshow lists its folder only when it is time for the next picture. The copy is brought
 *  up to date when the launcher goes to the background or this component is removed.
 *
 *  The slideshow pauses while the launcher is in the background. The picture from the copy appears at once
 *  (no fade); only a change from one slideshow picture to the next cross-fades. */
export function Wallpaper ({config, opacity = 100, onProblem}: Props) {
	const layerA = useRef<HTMLDivElement>(null);
	const layerB = useRef<HTMLDivElement>(null);
	const wrap = useRef<HTMLDivElement>(null);
	const report = useRef(onProblem);
	report.current = onProblem;
	// What the two layers hold lives here, not inside the effect: a change of wallpaper re-runs the effect, and the new run must
	// cross-fade from the picture on screen (P63; before, the cleanup blanked both layers and the new picture faded in from nothing).
	const shared = useRef({held: [null, null] as (string | null)[], front: -1});

	useEffect(() => () => {                                  // only when the component goes away
		const st = shared.current;
		[layerA.current, layerB.current].forEach((layer, i) => {
			if (layer) { layer.classList.remove('wallpaper__layer--on'); layer.style.backgroundImage = ''; }
			const url = st.held[i];
			st.held[i] = null;
			if (url) releasePicture(url);
		});
		st.front = -1;
	}, []);

	useEffect(() => {
		const layers = [layerA.current as HTMLDivElement, layerB.current as HTMLDivElement];
		const root = wrap.current as HTMLDivElement;
		const st = shared.current;
		const held = st.held;                            // the picture URL each layer holds
		const cacheId = wallpaperCacheId(config.mode, config.path + (config.recursive ? '|sub' : ''));
		let disposed = false;
		let hiddenAt = 0;
		const atRestart = !restartHandled;            // R9: first run after the page started (a later setting change is no restart)
		restartHandled = true;
		let failed = false;
		let told = false;
		let busy = false;
		let timer = 0;
		let files: string[] = [];
		let position = -1;
		let order: ReturnType<typeof createShuffleOrder> | null = null;
		let lastError = '';
		let snapshot: string | null = null;    // screen-sized copy of the picture on screen
		let unsaved = false;                   // the copy isn't in the cache yet
		let cacheKnown = false;                // the cache already holds a picture for this choice
		let shownAt = Date.now();              // when the picture on screen appeared

		const stopTimer = () => { window.clearTimeout(timer); timer = 0; };

		const saveCache = () => {
			if (unsaved && snapshot && writeWallpaperCache(cacheId, snapshot)) unsaved = false;
		};

		const release = (i: number) => {
			const url = held[i];
			held[i] = null;
			layers[i].style.backgroundImage = '';
			if (url) releasePicture(url);
		};

		const hide = (i: number) => {
			layers[i].classList.remove('wallpaper__layer--on');
			window.setTimeout(() => {
				if (!layers[i].classList.contains('wallpaper__layer--on')) release(i);
			}, WALLPAPER.fadeMs + 250);
		};

		const hideAll = () => {
			hide(0);
			hide(1);
			st.front = -1;
			root.classList.add('wallpaper--bare');       // no picture: the shade may be skipped (see the stylesheet)
		};

		/** Takes a layer off at once (no fade) once the new picture covers it. */
		const drop = (i: number) => {
			const layer = layers[i];
			layer.style.transition = 'none';
			layer.classList.remove('wallpaper__layer--on');
			void layer.offsetWidth;
			layer.style.transition = '';
			release(i);
		};

		/** `instant`: no fade (the picture is already known, e.g. when the launcher comes back to the front) */
		const show = (url: string, instant?: boolean) => {
			const back = st.front === 0 ? 1 : 0;
			const old = st.front;
			if (!instant && layers[back].classList.contains('wallpaper__layer--on')) {   // a fade of the layer still ending (short interval): take it off first, so the new picture fades in
				layers[back].style.transition = 'none';
				layers[back].classList.remove('wallpaper__layer--on');
				void layers[back].offsetWidth;
				layers[back].style.transition = '';
			}
			if (held[back]) release(back);
			held[back] = url;
			const layer = layers[back];
			layer.style.backgroundImage = `url("${url}")`;
			layer.style.zIndex = '2';                     // the new picture goes over the old one
			if (old >= 0) layers[old].style.zIndex = '1';
			root.classList.remove('wallpaper--bare');
			if (instant) {
				layer.style.transition = 'none';
				layer.classList.add('wallpaper__layer--on');
				void layer.offsetWidth;                // apply it now, before the transition is switched back on
				layer.style.transition = '';
			} else {
				window.requestAnimationFrame(() => layer.classList.add('wallpaper__layer--on'));
			}
			// Cross-fade: only the new picture changes (fades in over the old one), then the old one is taken off. Fading
			// both at once blended two full-screen layers and let the background show through half-way.
			if (old >= 0) {
				if (instant) hide(old);
				else window.setTimeout(() => { if (st.front !== old) drop(old); }, WALLPAPER.fadeMs + 150);   // not tied to this run: a re-run must not leave the old layer on
			}
			st.front = back;
			shownAt = Date.now();
		};

		// A failure keeps whatever picture is already showing (say, the USB drive was unplugged).
		const fail = (text: string) => {
			failed = true;
			busy = false;
			if (!told) { told = true; report.current(text); }
		};

		const advance = () => {
			if (disposed) return;
			if (files.length) { next(0); return; }
			listImages(config.path, config.recursive).then(
				(list) => {
					if (disposed) return;
					if (!list.length) { fail(tt('wallpaper.noPicturesFoundInThat')); return; }
					files = list;
					order = config.shuffle ? createShuffleOrder(files, cacheId) : null;
					if (files.length === 1) return;          // a one-picture folder: nothing to rotate
					next(0);
				},
				() => { if (!disposed) fail(tt('wallpaper.couldnTReadTheWallpaper')); }
			);
		};

		const schedule = () => {
			stopTimer();
			const rotates = config.mode === 'folder' && (files.length === 0 || files.length > 1);
			if (rotates && config.intervalSec > 0 && !document.hidden) timer = window.setTimeout(advance, config.intervalSec * 1000);
		};

		const next = (attempt: number) => {
			if (disposed || busy) return;
			if (attempt >= files.length) { fail(lastError || tt('wallpaper.couldnTShowAnyPicture')); return; }
			busy = true;
			position = (position + 1) % files.length;
			const path = order ? order.take() : files[position];
			if (!path) { fail(tt('wallpaper.noPicturesFoundInThat')); return; }
			loadPicture(path).then(
				(loaded) => {
					busy = false;
					if (disposed) { releasePicture(loaded.url); return; }
					failed = false;
					if (order) order.shown(path);
					show(loaded.url);
					snapshot = loaded.snapshot;
					unsaved = !!loaded.snapshot;
					if (!cacheKnown) { saveCache(); cacheKnown = !unsaved; }    // the first picture is cached at once
					schedule();
				},
				(error: Error) => {
					busy = false;
					if (disposed) return;
					lastError = error && error.message ? error.message : tt('wallpaper.couldnTShowThatPicture');
					if (files.length === 1) fail(lastError);
					else next(attempt + 1);
				}
			);
		};

		const start = () => {
			stopTimer();
			failed = false;
			position = -1;
			lastError = '';
			files = [];
			order = null;
			if (config.mode === 'gradient' || !config.path) { clearWallpaperCache(); hideAll(); return; }

			const cached = takeEarlyStatic(cacheId) || readWallpaperCache(cacheId);       // main.tsx may have read it already (P56)
			if (cached) {                                          // instant: no shell work at all
				show(cached, true);                 // already known: no fade-in at start-up
				window.requestAnimationFrame(() => window.requestAnimationFrame(endEarlyStatic));
				snapshot = cached;
				unsaved = false;
				cacheKnown = true;
				// the saved shuffle order picks the next picture after one interval: nothing is loaded at start-up
				if (config.mode === 'folder') {
					schedule();
					if (config.intervalSec === 0 && atRestart) timer = window.setTimeout(advance, RESTART_CHANGE_MS);   // R9 Each visit: a new picture after a restart, once the first screen is calm
				}
				return;
			}
			if (config.mode === 'image') { files = [config.path]; next(0); return; }
			listImages(config.path, config.recursive).then(
				(list) => {
					if (disposed) return;
					if (!list.length) { fail(tt('wallpaper.noPicturesFoundInThat')); return; }
					files = list;
					order = config.shuffle ? createShuffleOrder(files, cacheId) : null;
					next(0);
				},
				() => { if (!disposed) fail(tt('wallpaper.couldnTReadTheWallpaper')); }
			);
		};

		const onVisibility = () => {
			if (config.mode === 'gradient') return;
			if (document.hidden) { hiddenAt = Date.now(); stopTimer(); saveCache(); return; }
			const away = hiddenAt ? Date.now() - hiddenAt : 0;
			hiddenAt = 0;
			if (failed) start();                                   // the USB drive may be back
			else if (config.mode === 'folder' && config.intervalSec === 0) {
				if (away >= AWAY_CHANGE_MS) advance();             // R9 Each visit: a new picture after 1+ min away
			} else if (config.mode === 'folder') {
				// carry on where the interval left off: coming back to the front must not start a fade of its own
				stopTimer();
				timer = window.setTimeout(advance, Math.max(1500, config.intervalSec * 1000 - (Date.now() - shownAt)));
			}
		};

		start();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			disposed = true;
			stopTimer();
			saveCache();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, [config.mode, config.path, config.recursive, config.intervalSec, config.shuffle]);

	const vars = varScope('wallpaper', {'--wallpaper-opacity': opacity < 100 ? String(opacity / 100) : undefined});

	return (
		<div class={`wallpaper wallpaper--bare${config.fit === 'fit' ? ' wallpaper--fit' : ''}${vars.cls ? ' ' + vars.cls : ''}`} aria-hidden="true" ref={wrap} style={vars.css || undefined}>
			<div class="wallpaper__layer" ref={layerA} />
			<div class="wallpaper__layer" ref={layerB} />
			<div class="wallpaper__scrim" />
			<div class="wallpaper__fade" />
		</div>
	);
}

/** The bundled-photo slideshow. Own component and own state, so a change of picture re-renders nothing else.
 *  The first photo appears at once; each next one is loaded and drawn invisibly for a moment (so the picture is
 *  already decoded), then fades in over the old one. Pauses while `paused` (launcher in the background). */
export function PhotoShow ({intervalSec, shuffle, paused, fit}: {intervalSec: number; shuffle: boolean; paused: boolean; fit?: boolean}) {
	const layerA = useRef<HTMLDivElement>(null);
	const layerB = useRef<HTMLDivElement>(null);
	const wrap = useRef<HTMLDivElement>(null);
	const firstPhoto = useRef(takeEarlyPhoto()).current;       // chosen and already loading since main.tsx, else random
	const away = useRef(0);
	const state = useRef({front: -1, index: firstPhoto >= 0 ? firstPhoto : Math.floor(Math.random() * PHOTO_IDS.length), busy: false});

	useEffect(() => { clearWallpaperCache(); }, []);

	useEffect(() => {
		const layers = [layerA.current as HTMLDivElement, layerB.current as HTMLDivElement];
		const root = wrap.current as HTMLDivElement;
		const st = state.current;
		let disposed = false;
		let timer = 0;
		let warm = 0;
		let img: HTMLImageElement | null = null;
		let back = false;                                      // R9 Each visit: back in front after 1+ min away
		if (paused) { if (!away.current) away.current = Date.now(); }
		else if (away.current) { back = intervalSec === 0 && Date.now() - away.current >= AWAY_CHANGE_MS; away.current = 0; }

		const show = (url: string) => {
			const back = st.front === 0 ? 1 : 0;
			const old = st.front;
			const layer = layers[back];
			layer.style.transition = 'none';
			layer.classList.remove('wallpaper__layer--on');
			const firstNow = old < 0;
			layer.style.opacity = firstNow ? '' : '0.01';          // barely visible: the picture is decoded before it fades in
			layer.style.backgroundImage = `url("${url}")`;
			layer.style.zIndex = '2';
			if (old >= 0) layers[old].style.zIndex = '1';
			root.classList.remove('wallpaper--bare');
			st.front = back;
			const fadeIn = () => {
				layer.style.transition = '';
				void layer.offsetWidth;
				layer.style.opacity = '';
				layer.classList.add('wallpaper__layer--on');
				if (old >= 0) {
					warm = window.setTimeout(() => {
						if (disposed) return;
						const l = layers[old];
						l.style.transition = 'none';
						l.classList.remove('wallpaper__layer--on');
						l.style.backgroundImage = '';
					}, WALLPAPER.fadeMs + 150);
				}
			};
			if (firstNow) {                                        // first photo of this start: drawn at once, no fade-in
				layer.classList.add('wallpaper__layer--on');
				void layer.offsetWidth;
				layer.style.transition = '';
				log(`wallpaper: first photo drawn at page +${Math.round(performance.now())} ms`);
			}
			else warm = window.setTimeout(() => { if (!disposed) fadeIn(); }, 200);
		};

		const load = (then: () => void) => {
			st.busy = true;
			const url = photoUrl(st.index);
			img = new Image();
			img.onload = () => { st.busy = false; if (!disposed) { show(url); then(); } };
			img.onerror = () => { st.busy = false; if (!disposed) then(); };
			img.src = url;
		};

		const tick = () => {
			if (disposed) return;
			st.index = nextPhoto(st.index, shuffle);
			load(schedule);
		};
		const schedule = () => { window.clearTimeout(timer); if (!paused && intervalSec > 0) timer = window.setTimeout(tick, intervalSec * 1000); };

		// P63: a re-run (the launcher went to the background, a setting changed) may have cancelled the end of a fade: finish it,
		// so the new picture is fully on and the old layer is empty (a stuck old layer showed through at a lowered picture opacity)
		if (st.front >= 0) {
			const f = layers[st.front];
			const o = layers[st.front === 0 ? 1 : 0];
			f.style.transition = 'none'; o.style.transition = 'none';
			f.style.opacity = '';
			f.classList.add('wallpaper__layer--on');
			o.classList.remove('wallpaper__layer--on');
			o.style.backgroundImage = '';
			void f.offsetWidth;
			f.style.transition = ''; o.style.transition = '';
		}
		if (st.front < 0) load(schedule); else if (back) tick(); else schedule();
		return () => {
			disposed = true;
			window.clearTimeout(timer);
			window.clearTimeout(warm);
			if (img) { img.onload = null; img.onerror = null; }
		};
	}, [intervalSec, shuffle, paused]);

	return (
		<div class={fit ? 'wallpaper wallpaper--bare wallpaper--fit' : 'wallpaper wallpaper--bare'} aria-hidden="true" ref={wrap}>
			<div class="wallpaper__layer" ref={layerA} />
			<div class="wallpaper__layer" ref={layerB} />
			<div class="wallpaper__scrim" />
			<div class="wallpaper__fade" />
		</div>
	);
}
