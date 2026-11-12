import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {POSTER_H, POSTER_W} from '../components/MediaShelf';
import {TIMING} from '../config/constants';
import {log} from '../lib/log';
import {failureStep, openItem, readSet, refreshWait, retryWait, shelfCacheKey, usableSet, SHELF_FRESH_MS, type ShelfSet, type ShelfSource, type ShelfView} from '../lib/shelves';

interface Options {
	/** counts each return to the front (app.tsx `wakes`): shelves older than a minute are fetched again */
	wakes: number;
	/** the sign-in is no longer valid (said once per start) */
	onExpired: () => void;
	/** an item could not be opened: its app is missing or refused */
	onOpenError: (why: 'missing' | 'failed', appName: string) => void;
}

/** The shelves of one source, ready for Home: drawn from the saved copy at once (nothing is fetched to draw the home screen),
 *  fetched in the background after start, again soon after coming back to the front, and every 10 minutes while in front.
 *  A server that stops answering gets one `recover` (its address may have changed); a sign-in that is no longer valid is said once.
 *  The shelves are put under the home row a moment after start, so their posters never compete with the first screen. */
export function useShelves (source: ShelfSource, {wakes, onExpired, onOpenError}: Options): ShelfView[] {
	const cacheKey = shelfCacheKey(source.id);
	const [set, setSet] = useState<ShelfSet | null>(() => { try { return readSet(localStorage.getItem(cacheKey)); } catch { return null; } });
	const setRef = useRef(set);
	setRef.current = set;
	const latest = useRef({source, onExpired, onOpenError});
	latest.current = {source, onExpired, onOpenError};
	const runs = useRef(0);
	const sigSeen = useRef('');
	const expiredSaid = useRef(false);

	useEffect(() => {
		if (!source.ready) return undefined;
		const src = source;
		const changed = sigSeen.current !== '' && sigSeen.current !== src.sig;
		sigSeen.current = src.sig;
		let cancelled = false;
		let timer = 0;
		let failures = 0;
		let recovered = false;
		const later = () => { timer = window.setTimeout(run, retryWait(failures)); failures++; };
		const run = () => {
			if (cancelled || document.hidden) return;        // coming back to the front starts this over
			src.fetch().then((s) => {
				if (cancelled) return;
				failures = 0;
				try { localStorage.setItem(cacheKey, JSON.stringify(s)); } catch { /* no room: shown until restart */ }
				setSet(s);
				log(`shelves ${src.id}: updated (${Object.keys(s.lists).map((k) => k + ' ' + s.lists[k].length).join(', ')})`);
				timer = window.setTimeout(run, SHELF_FRESH_MS);
			}, (e: {status?: number}) => {
				if (cancelled) return;
				const status = e && typeof e.status === 'number' ? e.status : -1;
				const step = failureStep(status, recovered || !src.recover);
				if (step === 'expired') {
					log(`shelves ${src.id}: the sign-in is no longer valid`);
					if (!expiredSaid.current) { expiredSaid.current = true; latest.current.onExpired(); }
					return;
				}
				if (step === 'recover' && src.recover) {
					recovered = true;
					log(`shelves ${src.id}: no answer, recovering`);
					src.recover().then(() => { if (!cancelled) later(); }, () => { if (!cancelled) { log(`shelves ${src.id}: not reachable`); later(); } });
					return;
				}
				log(`shelves ${src.id}: could not be fetched (${status})`);
				later();
			});
		};
		const first = runs.current === 0;
		runs.current++;
		timer = window.setTimeout(run, refreshWait({changed, first, known: setRef.current, origin: src.origin, now: Date.now(), startMs: TIMING.backgroundWorkMs}));
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [source.ready, source.sig, wakes]);       // eslint-disable-line react-hooks/exhaustive-deps

	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		if (!source.ready || mounted) return undefined;
		const t = window.setTimeout(() => setMounted(true), TIMING.backgroundWorkMs / 2);
		return () => window.clearTimeout(t);
	}, [source.ready, mounted]);

	return useMemo(() => {
		if (!source.ready || !mounted) return [];
		const data = usableSet(set, source.origin, Date.now());
		if (!data) return [];
		const out: ShelfView[] = [];
		source.lists.forEach((l) => {
			const items = data.lists[l.id];
			if (!items || !items.length) return;
			out.push({
				id: source.id + ':' + l.id,
				title: l.title,
				items,
				rev: data.at,
				image: (item) => latest.current.source.image(item, POSTER_W, POSTER_H),
				open: (item) => { const s = latest.current.source; log(`shelves ${s.id}: open in ${s.appName} (${item.type})`); openItem(s, item, (why) => latest.current.onOpenError(why, s.appName)); }
			});
		});
		return out;
	}, [set, mounted, source.ready, source.sig, source.lists.map((l) => l.id + l.title).join('|')]);       // eslint-disable-line react-hooks/exhaustive-deps
}
