import {useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {failureText} from '../lib/failure';
import {AERIAL_VIDEOS, cachedCatalog, cachedPreview, cleanShare, forgetNetwork, loadPreview, mb, placeKind, queueVideo, readCatalog, readSizes, readStatus, removeVideo, setNetwork, setTarget, startSizes, type AerialCategory, type AerialQuality, type AerialStatus, type AerialVideo} from '../lib/aerial';
import {t as tt} from '../i18n';

// "Apple TV Aerials": Apple's aerial videos for the screen saver. One row per video; OK downloads it (one at a time,
// in the background, so this screen can be closed), OK on a downloaded video removes it. Each video also gets one
// still, used by "Stills as wallpaper". The TV side is public/aerial/aerial.sh.

interface Props {
	onClose: () => void;
	/** play the videos in this folder as the screen saver (shuffled) */
	onUseSaver: (folder: string) => void;
	/** show the stills as the wallpaper slideshow */
	onUseWallpaper: () => void;
	onToast: (text: string, kind?: 'info' | 'error') => void;
}

interface Row {
	key: string;
	label: string;
	detail: string;
	icon: 'slideshow' | 'default' | 'info' | 'search' | 'picture' | 'folder' | 'drive';
	run: () => void;
	/** a video row: shown in the side panel with its preview */
	video?: AerialVideo;
	/** its state alone (the detail without the group) */
	state?: string;
}

/** Apple's preview of the focused video, fetched by the TV's shell (the web view cannot check Apple's certificate) and
 *  read back in pieces. It waits a moment so scrolling stays quick, and the picture shows only once it has loaded. */
function AerialPreview ({video}: {video: AerialVideo}) {
	const url = video.preview;
	const [src, setSrc] = useState<string>(() => (url ? cachedPreview(url) || '' : ''));
	const [shown, setShown] = useState(false);
	const [missing, setMissing] = useState(!url);
	useEffect(() => {
		setShown(false);
		setMissing(!url);
		if (!url) { setSrc(''); return undefined; }
		const known = cachedPreview(url);
		if (known) { setSrc(known); return undefined; }
		setSrc('');
		let cancelled = false;
		const timer = window.setTimeout(() => {
			loadPreview(url).then((blob) => { if (!cancelled) setSrc(blob); }, () => { if (!cancelled) setMissing(true); });
		}, 300);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [url]);
	return (
		<div class="aerial__frame">
			{src && !missing && <img class="aerial__img" src={src} alt="" style={{visibility: shown ? 'visible' : 'hidden'}} onLoad={() => setShown(true)} onError={() => setMissing(true)} />}
			{(!shown || missing) && <div class="aerial__wait">{missing ? tt('aerial.noPreview') : tt('aerial.loadingPreview')}</div>}
		</div>
	);
}

const VISIBLE_ROWS = 6;
const QUALITY_KEY = 'customlauncher-aerial-quality';

function savedQuality (): AerialQuality {
	try { return localStorage.getItem(QUALITY_KEY) === '1080' ? '1080' : '4k'; } catch { return '4k'; }
}

function categoryText (c: AerialCategory): string {
	return tt(c === 'landscapes' ? 'aerial.landscapes' : c === 'cities' ? 'aerial.cities' : c === 'underwater' ? 'aerial.underwater' : c === 'space' ? 'aerial.space' : 'aerial.other');
}

/** A place in words: the TV's memory, USB drive (1, 2 when there are several) or the network folder. */
function placeName (place: string, status: AerialStatus | null): string {
	const kind = placeKind(place);
	if (kind === 'net') return tt('aerial.placeNet');
	if (kind === 'internal') return tt('aerial.placeInternal');
	const usb = status ? status.places.filter((p) => placeKind(p.place) === 'usb').map((p) => p.place) : [];
	return usb.length > 1 ? tt('aerial.placeUsbN', {n: usb.indexOf(place) + 1}) : tt('aerial.placeUsb');
}

type Field = 'host' | 'share' | 'user' | 'pass';

/** The TV's reason (English, from aerial.sh) in the user's language. */
export function netReason (why: string): string {
	if (/refused the login/.test(why)) return tt('aerial.whyLogin');
	if (/does not let guests in/.test(why)) return tt('aerial.whyGuest');
	if (/read but not write/.test(why)) return tt('aerial.whyReadOnly');
	if (/no shared folder called/.test(why)) return tt('aerial.whyShare');
	if (/does not answer/.test(why)) return tt('aerial.whyDown');
	if (/cannot find .* on the network/.test(why)) return tt('aerial.whyHost');
	if (/^bad(host|share|user)$/.test(why)) return tt('aerial.netBadText');
	return why;
}

export function Aerials ({onClose, onUseSaver, onUseWallpaper, onToast}: Props) {
	const cached = cachedCatalog();
	const [videos, setVideos] = useState<AerialVideo[] | null>(cached ? cached.videos : null);
	const [status, setStatus] = useState<AerialStatus | null>(null);
	const [problem, setProblem] = useState('');
	const [quality, setQuality] = useState<AerialQuality>(savedQuality);
	const [index, setIndex] = useState(0);
	/** the video the highlight should stay on when the list reorders (it moves to the top once downloaded) */
	const [follow, setFollow] = useState<string | null>(null);
	const alive = useRef(true);
	const pollTimer = useRef(0);
	/** the videos on the TV (downloaded or in the queue), in the order they are listed at the top */
	const onTvOrder = useRef<string[]>([]);
	/** the other videos, in the order they are listed below those */
	const restOrder = useRef<string[]>([]);
	const [sizes, setSizes] = useState<Record<string, number>>({});
	const sizeTimer = useRef(0);
	// the network folder form: open or not, the field being typed in, the values, and a connect in progress
	const [netForm, setNetForm] = useState(false);
	const [typing, setTyping] = useState<Field | null>(null);
	const [fields, setFields] = useState<Record<Field, string>>({host: '', share: '', user: '', pass: ''});
	const [netBusy, setNetBusy] = useState(false);
	const [formIndex, setFormIndex] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => { if (typing && input.current) input.current.focus(); }, [typing]);

	useEffect(() => () => { alive.current = false; window.clearTimeout(pollTimer.current); window.clearTimeout(sizeTimer.current); }, []);

	// every video's size in both qualities: asked from Apple once in the background (about 15 s), then kept on the TV
	const pollSizes = () => {
		window.clearTimeout(sizeTimer.current);
		readSizes().then((r) => {
			if (!alive.current) return;
			setSizes(r.bytes);
			if (r.running) sizeTimer.current = window.setTimeout(pollSizes, 3000);
		}, () => undefined);
	};
	useEffect(() => {
		if (!videos) return;
		startSizes().then(() => { if (alive.current) pollSizes(); }, () => undefined);
	}, [videos]);                                                 // eslint-disable-line react-hooks/exhaustive-deps
	const sizeText = (v: AerialVideo, q: AerialQuality): string => {
		const b = sizes[q === '4k' ? v.url4k : v.url1080];
		return b ? tt('aerial.mb', {mb: mb(b)}) : '';
	};

	const loadList = (refresh: boolean) => {
		setProblem('');
		readCatalog(refresh).then((v) => { if (alive.current) setVideos(v); },
			(e) => { if (alive.current) setProblem(failureText(e, tt('aerial.couldNotReadList'))); });
	};

	// the status: every 2 s while something downloads, otherwise every 15 s (the free space, a job started elsewhere)
	const poll = () => {
		window.clearTimeout(pollTimer.current);
		readStatus().then((s) => {
			if (!alive.current) return;
			setStatus(s);
			pollTimer.current = window.setTimeout(poll, Object.keys(s.jobs).some((n) => !/^failed/.test(s.jobs[n].state)) ? 2000 : 15000);
		}, () => { if (alive.current) pollTimer.current = window.setTimeout(poll, 15000); });
	};

	useEffect(() => {
		if (!cached || !cached.fresh) loadList(false);
		poll();
	}, []);                                                      // eslint-disable-line react-hooks/exhaustive-deps

	const toggleQuality = () => {
		const next: AerialQuality = quality === '4k' ? '1080' : '4k';
		setQuality(next);
		try { localStorage.setItem(QUALITY_KEY, next); } catch { /* ignore */ }
	};

	const act = (v: AerialVideo) => {
		const s = status;
		const job = s && s.jobs[v.name];
		const have = !!(s && s.files[v.name] !== undefined);
		if (have || (job && !/^failed/.test(job.state))) {
			// removing: the highlight goes to the first video still on the TV, so several can be removed one after
			// another from the top; when none is left, to the first row of the screen
			const next = onTvOrder.current.filter((n) => n !== v.name)[0];
			if (next) setFollow(next);
			else { setFollow(null); setIndex(0); }
			removeVideo(v.name).then(() => { onToast(tt(have ? 'aerial.removed' : 'aerial.cancelled', {title: v.title})); poll(); },
				(e) => onToast(failureText(e, tt('aerial.couldNotRemove')), 'error'));
		} else {
			// downloading: the video moves up to the others on the TV, the highlight goes on to the next video in the
			// list (the one before it when it was the last), so several can be picked one after another
			const rest = restOrder.current;
			const i = rest.indexOf(v.name);
			const next = i >= 0 ? (rest[i + 1] || rest[i - 1]) : undefined;
			if (next) setFollow(next); else setFollow(null);
			queueVideo(v, quality).then((r) => {
				if (r === 'queued' || r === 'present') onToast(tt('aerial.queued', {title: v.title}));
				else onToast(tt('aerial.couldNotQueue', {why: r}), 'error');
				poll();
			}, (e) => onToast(failureText(e, tt('aerial.couldNotQueue', {why: ''})), 'error'));
		}
	};

	const files = status ? Object.keys(status.files) : [];
	const stills = status ? Object.keys(status.frames) : [];
	const rows: Row[] = [];
	rows.push({
		key: 'quality', icon: 'search',
		label: tt('aerial.quality', {q: quality === '4k' ? '4K' : '1080p'}),
		detail: quality === '4k' ? tt('aerial.quality4k') : tt('aerial.quality1080'),
		run: toggleQuality
	});
	const target = status ? status.target : {place: 'internal', ok: true, dir: AERIAL_VIDEOS};
	const inTarget = status ? files.filter((n) => status.where[n] === target.place).length : 0;
	const changePlace = () => {
		if (!status) return;
		const list = status.places.map((p) => p.place);
		if (list.length < 2) { onToast(tt('aerial.noOtherPlace'), 'error'); return; }
		const next = list[(list.indexOf(target.place) + 1) % list.length];
		setTarget(next).then((out) => {
			if (/^result=ok/.test(out)) onToast(tt('aerial.placeSet', {place: placeName(next, status)}));
			else onToast(tt('aerial.placeFailed', {why: (/result=failed (.*)/.exec(out) || [])[1] || out}), 'error');
			poll();
		}, (e) => onToast(failureText(e, tt('aerial.placeFailed', {why: ''})), 'error'));
	};
	rows.push({
		key: 'place', icon: 'folder',
		label: tt('aerial.place', {place: placeName(target.place, status)}),
		detail: target.ok
			? tt('aerial.placeDetail', {free: status && status.freeKB >= 0 ? (status.freeKB / 1048576).toFixed(1) : '–'})
			: tt('aerial.placeMissing'),
		run: changePlace
	});
	const net = status ? status.net : null;
	rows.push({
		key: 'net', icon: 'drive',
		label: net ? tt('aerial.netSet', {where: `${net.host}/${net.share}`}) : tt('aerial.netNone'),
		detail: net ? (net.on ? tt('aerial.netOn') : tt('aerial.netOff')) : tt('aerial.netNoneDetail'),
		run: () => {
			setFields({host: net ? net.host : '', share: net ? net.share : '', user: '', pass: ''});
			setFormIndex(0);
			setNetForm(true);
		}
	});
	rows.push({
		key: 'saver', icon: 'slideshow', label: tt('aerial.useSaver'),
		detail: inTarget ? tt('aerial.useSaverDetailAt', {n: inTarget, place: placeName(target.place, status)}) : tt('aerial.downloadFirstHere'),
		run: () => { if (inTarget && target.ok) onUseSaver(target.dir); else onToast(tt('aerial.downloadFirstHere'), 'error'); }
	});
	rows.push({
		key: 'wallpaper', icon: 'picture', label: tt('aerial.useWallpaper'),
		detail: stills.length ? tt('aerial.useWallpaperDetail', {n: stills.length}) : tt('aerial.downloadFirst'),
		run: () => { if (stills.length) onUseWallpaper(); else onToast(tt('aerial.downloadFirst'), 'error'); }
	});

	if (videos) {
		const seen: Record<string, number> = {};
		const total: Record<string, number> = {};
		videos.forEach((v) => { total[v.title] = (total[v.title] || 0) + 1; });
		// the numbers of same-named videos follow Apple's order, so a video keeps its number wherever it is listed
		const labels: Record<string, string> = {};
		videos.forEach((v) => {
			seen[v.title] = (seen[v.title] || 0) + 1;
			labels[v.name] = total[v.title] > 1 ? `${v.title} ${seen[v.title]}` : v.title;
		});
		// downloaded, downloading and queued videos first, so they are easy to find and remove
		const onTv = (v: AerialVideo) => !!status && (status.files[v.name] !== undefined || status.jobs[v.name] !== undefined);
		const ordered = videos.filter(onTv).concat(videos.filter((v) => !onTv(v)));
		onTvOrder.current = videos.filter(onTv).map((v) => v.name);
		restOrder.current = videos.filter((v) => !onTv(v)).map((v) => v.name);
		ordered.forEach((v) => {
			const label = labels[v.name];
			const job = status && status.jobs[v.name];
			const size = status && status.files[v.name];
			let detail: string;
			let icon: Row['icon'] = 'default';
			if (size !== undefined && size !== null) {
				icon = 'slideshow';
				detail = tt('aerial.downloadedAt', {mb: mb(size), place: placeName((status && status.where[v.name]) || 'internal', status)}) + (status && status.frames[v.name] ? '' : tt('aerial.noStill'));
			} else if (job && job.state === 'downloading') {
				icon = 'info';
				const pct = job.total > 0 ? Math.min(99, Math.floor(100 * job.bytes / job.total)) : 0;
				detail = job.total > 0 ? tt('aerial.downloading', {pct, done: mb(job.bytes), total: mb(job.total)}) : tt('aerial.starting');
			} else if (job && job.state === 'frame') {
				icon = 'info'; detail = tt('aerial.makingStill');
			} else if (job && job.state === 'queued') {
				icon = 'info'; detail = tt('aerial.waiting');
			} else if (job) {
				detail = tt('aerial.failed');
			} else {
				const sz = sizeText(v, quality);
				detail = tt('aerial.notDownloaded', {q: (quality === '4k' ? '4K' : '1080p') + (sz ? ', ' + sz : '')});
			}
			rows.push({key: v.name, icon, label, detail: `${categoryText(v.category)}  ·  ${detail}`, run: () => act(v), video: v, state: detail});
		});
		rows.push({key: 'refresh', icon: 'search', label: tt('aerial.refresh'), detail: tt('aerial.refreshDetail'), run: () => loadList(true)});
	} else if (!problem) {
		rows.push({key: 'reading', icon: 'info', label: tt('aerial.reading'), detail: tt('aerial.readingDetail'), run: () => undefined});
	} else {
		rows.push({key: 'retry', icon: 'search', label: tt('aerial.retry'), detail: tt('aerial.retryDetail'), run: () => loadList(true)});
	}

	const followAt = follow ? rows.findIndex((r) => r.key === follow) : -1;
	useEffect(() => { if (followAt >= 0 && followAt !== index) setIndex(followAt); }, [followAt]);   // eslint-disable-line react-hooks/exhaustive-deps
	const at = clamp(followAt >= 0 ? followAt : index, 0, Math.max(0, rows.length - 1));

	// ---------- the network folder form ----------
	const connect = () => {
		const host = fields.host.trim().replace(/^smb:\/\//i, '').replace(/^\\\\|^\/\//, '').replace(/[\\/].*$/, '');
		const share = cleanShare(fields.share);
		if (!host || !share) { onToast(tt('aerial.netNeedHost'), 'error'); return; }
		setNetBusy(true);
		let started: Promise<string>;
		try { started = setNetwork(host, share, fields.user.trim(), fields.pass); } catch { setNetBusy(false); onToast(tt('aerial.netBadText'), 'error'); return; }
		started.then((r) => {
			if (!alive.current) return;
			setNetBusy(false);
			if (r === 'ok') { onToast(tt('aerial.netConnected')); setNetForm(false); setFields((f) => ({...f, pass: ''})); poll(); }
			else onToast(tt('aerial.netFailed', {why: netReason(r)}), 'error');
		}, (e) => { if (alive.current) { setNetBusy(false); onToast(failureText(e, tt('aerial.netFailed', {why: ''})), 'error'); } });
	};
	const forget = () => {
		forgetNetwork().then(() => { onToast(tt('aerial.netForgotten')); setNetForm(false); poll(); }, (e) => onToast(failureText(e, tt('aerial.netFailed', {why: ''})), 'error'));
	};
	const shown = (f: Field) => (f === 'pass' ? (fields.pass ? '•'.repeat(Math.min(12, fields.pass.length)) : tt('aerial.netEmpty')) : fields[f] || tt('aerial.netEmpty'));
	const formRows: Array<{key: string; label: string; detail: string; field?: Field; run: () => void}> = [
		{key: 'host', field: 'host', label: tt('aerial.netHost'), detail: shown('host'), run: () => setTyping('host')},
		{key: 'share', field: 'share', label: tt('aerial.netShare'), detail: shown('share'), run: () => setTyping('share')},
		{key: 'user', field: 'user', label: tt('aerial.netUser'), detail: fields.user ? fields.user : tt('aerial.netGuest'), run: () => setTyping('user')},
		{key: 'pass', field: 'pass', label: tt('aerial.netPass'), detail: shown('pass'), run: () => setTyping('pass')},
		{key: 'connect', label: netBusy ? tt('aerial.netConnecting') : tt('aerial.netConnect'), detail: tt('aerial.netConnectDetail'), run: () => { if (!netBusy) connect(); }}
	];
	if (net) formRows.push({key: 'forget', label: tt('aerial.netForget'), detail: tt('aerial.netForgetDetail'), run: forget});
	formRows.push({key: 'back', label: tt('aerial.netBack'), detail: '', run: () => setNetForm(false)});
	const fAt = clamp(formIndex, 0, formRows.length - 1);

	const handleKey = (key: NavKey): boolean => {
		if (netForm) {
			if (key === 'up') setFormIndex(clamp(fAt - 1, 0, formRows.length - 1));
			else if (key === 'down') setFormIndex(clamp(fAt + 1, 0, formRows.length - 1));
			else if (key === 'enter') formRows[fAt].run();
			else if (key === 'back') setNetForm(false);
			return true;
		}
		if (key === 'up') { setFollow(null); setIndex(clamp(at - 1, 0, Math.max(0, rows.length - 1))); }
		else if (key === 'down') { setFollow(null); setIndex(clamp(at + 1, 0, Math.max(0, rows.length - 1))); }
		else if (key === 'enter') { if (rows[at]) rows[at].run(); }
		else if (key === 'back') onClose();
		return true;
	};
	useKeys(handleKey, !typing);

	// the text field: Enter keeps the text, Back leaves it unchanged
	const onFieldKey = (e: KeyboardEvent) => {
		if (e.keyCode === 13) {
			e.preventDefault();
			const value = (e.target as HTMLInputElement).value;
			if (typing) setFields((f) => ({...f, [typing]: value}));
			setTyping(null);
		} else if (e.keyCode === 461 || e.keyCode === 27) { e.preventDefault(); setTyping(null); }
	};

	const lines = [tt('aerial.about'), tt('aerial.privacy')];
	if (status && status.freeKB >= 0) lines.push(tt('aerial.spaceFree', {free: (status.freeKB / 1048576).toFixed(1), n: files.length}));

	const start = clamp(at - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);

	if (netForm) {
		return (
			<div class="screen screen--picker">
				<div class="settings">
					<h1 class="settings__title">{tt('aerial.netTitle')}</h1>
					<p class="settings__hint">{tt('aerial.netHint')}</p>
					<div class="picker__note">
						<div class="picker__note-para">
							<div class="picker__note-line">{tt('aerial.netAbout')}</div>
							<div class="picker__note-line">{tt('aerial.netPrivacy')}</div>
						</div>
					</div>
					<div class="picker">
						{formRows.map((row, i) => (
							<div key={row.key} class={`picker__row${i === fAt ? ' picker__row--focused' : ''}`} onMouseEnter={() => setFormIndex(i)} onClick={() => { setFormIndex(i); row.run(); }}>
								<PickerIcon kind={row.field ? 'search' : row.key === 'connect' ? 'drive' : 'info'} />
								<div class="picker__text">
									<div class="picker__label">{row.label}</div>
									{typing && row.field === typing
										? <input ref={input} class="picker__input" type={typing === 'pass' ? 'password' : 'text'} defaultValue={typing === 'pass' ? '' : fields[typing]}
											placeholder={typing === 'host' ? '192.168.1.71' : typing === 'share' ? 'Video' : ''} maxLength={200} onKeyDown={onFieldKey} />
										: row.detail && <div class="picker__detail">{row.detail}</div>}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('aerial.title')}</h1>
				<p class="settings__hint">{tt('aerial.hint')}</p>
				<div class="picker__note">
					<div class="picker__note-para">{lines.map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					{problem && <div class="picker__note-para"><div class="picker__note-line picker__note-line--error">{problem}</div></div>}
				</div>
				<div class="aerial">
				<div class="picker aerial__list">
					{visible.map((row, n) => {
						const i = start + n;
						return (
							<div
								key={row.key}
								class={`picker__row${i === at ? ' picker__row--focused' : ''}`}
								onMouseEnter={() => { setFollow(null); setIndex(i); }}
								onClick={() => { setIndex(i); row.run(); }}
							>
								<PickerIcon kind={row.icon} />
								<div class="picker__text">
									<div class="picker__label">{row.label}</div>
									<div class="picker__detail">{row.detail}</div>
								</div>
							</div>
						);
					})}
				</div>
				<div class="aerial__panel">
					{rows[at] && rows[at].video ? (
						<>
							<AerialPreview video={rows[at].video as AerialVideo} />
							<div class="aerial__name">{rows[at].label}</div>
							<div class="aerial__sub">{categoryText((rows[at].video as AerialVideo).category)}</div>
							<div class="aerial__state">{rows[at].state}</div>
							{(sizeText(rows[at].video as AerialVideo, '4k') || sizeText(rows[at].video as AerialVideo, '1080')) && (
								<div class="aerial__sizes">{tt('aerial.sizes', {k4: sizeText(rows[at].video as AerialVideo, '4k') || '–', p1080: sizeText(rows[at].video as AerialVideo, '1080') || '–'})}</div>
							)}
						</>
					) : (
						<div class="aerial__sub">{tt('aerial.panelHint')}</div>
					)}
				</div>
				</div>
			</div>
		</div>
	);
}
