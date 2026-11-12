import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {PLEX_LINK_PAGE, type PlexPin, type PlexServer} from '../lib/plex';
import {checkPin, fetchAccountName, fetchServers, findConnection, requestPin} from '../lib/plexnet';
import {PIN_LIFE_MS, clearPendingPin, keepClientId, readAuth, readPendingPin, savePendingPin, signOut, writeAuth, type PlexAuth} from '../lib/plexstore';
import {log} from '../lib/log';
import {t as tt} from '../i18n';

// Settings, Widgets, PlxNative: sign in with a link code (typed at plex.tv/link on a phone or computer, so nothing is typed with the
// remote), then choose the server the shelves come from. Signed in already: the account, Choose a server and Sign out.
// The token stays in lib/plexstore.ts; it is never logged or shown.

interface Props {
	/** 'servers': straight to the server list (the Plex server row) */
	start: 'account' | 'servers';
	/** the sign-in or the server changed: back to Settings with this message */
	onDone: (auth: PlexAuth, message: string) => void;
	/** Back: nothing changed */
	onClose: () => void;
}

type Phase = 'account' | 'code' | 'servers';

interface ListRow {
	key: string;
	kind: 'info' | 'action' | 'server';
	label: string;
	detail?: string;
	run?: () => void;
}

const POLL_MS = 3000;
const VISIBLE_ROWS = 8;

export function PlexSignIn ({start, onDone, onClose}: Props) {
	const [auth, setAuth] = useState<PlexAuth>(() => readAuth());
	const [phase, setPhase] = useState<Phase>(() => (!readAuth().token ? 'code' : start === 'servers' ? 'servers' : 'account'));
	const [pin, setPin] = useState<(PlexPin & {at: number}) | null>(null);
	const [status, setStatus] = useState('');
	const [servers, setServers] = useState<PlexServer[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [index, setIndex] = useState(0);
	const alive = useRef(true);
	useEffect(() => () => { alive.current = false; }, []);

	const why = (e: unknown): string => String(e && (e as Error).message ? (e as Error).message : e || '');

	// a code: the one still waiting from before (the screen was left and opened again), else a new one from plex.tv
	const newCode = () => {
		const now = Date.now();
		const kept = readPendingPin(now);
		if (kept) { setPin({...kept, at: now}); setStatus(tt('plex.waiting')); return; }
		setPin(null);
		setStatus(tt('plex.gettingCode'));
		keepClientId(auth);
		requestPin(auth.clientId).then((p) => {
			if (!alive.current) return;
			savePendingPin(p, Date.now());
			setPin({...p, at: Date.now()});
			setStatus(tt('plex.waiting'));
		}, (e) => { if (alive.current) setStatus(tt('plex.noCode', {why: why(e)})); });
	};

	const loadServers = (a: PlexAuth) => {
		setServers(null);
		setStatus(tt('plex.loadingServers'));
		setIndex(0);
		fetchServers(a.clientId, a.token).then((list) => {
			if (!alive.current) return;
			setServers(list);
			setStatus(list.length ? '' : tt('plex.noServers'));
			const at = a.server ? list.findIndex((s) => s.id === a.server!.id) : -1;
			setIndex(at > 0 ? at : 0);
			if (list.length === 1 && !a.server) choose(list[0], a);     // one server and none chosen yet: use it
		}, (e) => {
			if (!alive.current) return;
			setServers([]);
			setStatus(tt('plex.serversFailed', {why: why(e)}));
		});
	};

	const choose = (server: PlexServer, a: PlexAuth = auth) => {
		if (busy) return;
		setBusy(true);
		setStatus(tt('plex.connecting', {name: server.name}));
		findConnection(server, a.clientId).then((uri) => {
			if (!alive.current) return;
			setBusy(false);
			const next: PlexAuth = {...a, server: {id: server.id, name: server.name, uri, token: server.token}};
			writeAuth(next);
			log(`plex: server chosen (${uri.indexOf('http://') === 0 ? 'http' : 'https'}${server.owned ? '' : ', shared'})`);
			onDone(next, tt('plex.serverSet', {name: server.name}));
		}, () => {
			if (!alive.current) return;
			setBusy(false);
			setStatus(tt('plex.connectFailed', {name: server.name}));
		});
	};

	useEffect(() => {
		if (phase === 'code') newCode();
		else if (phase === 'servers') loadServers(auth);
	}, [phase]);       // eslint-disable-line react-hooks/exhaustive-deps

	// waiting for the code: plex.tv is asked every few seconds; the code runs out after about 15 minutes
	useEffect(() => {
		if (phase !== 'code' || !pin) return undefined;
		const timer = window.setInterval(() => {
			if (Date.now() - pin.at > PIN_LIFE_MS) { window.clearInterval(timer); clearPendingPin(); setPin(null); setStatus(tt('plex.codeExpired')); return; }
			checkPin(auth.clientId, pin.id).then((token) => {
				if (!token || !alive.current) return;
				window.clearInterval(timer);
				clearPendingPin();
				fetchAccountName(auth.clientId, token).catch(() => '').then((account) => {
					if (!alive.current) return;
					const next: PlexAuth = {...auth, token, account, server: null};
					writeAuth(next);
					setAuth(next);
					log('plex: signed in');
					setPhase('servers');
				});
			}, () => { /* a missed check: the next one tries again */ });
		}, POLL_MS);
		return () => window.clearInterval(timer);
	}, [phase, pin && pin.id]);       // eslint-disable-line react-hooks/exhaustive-deps

	const rows: ListRow[] = [];
	if (phase === 'account') {
		rows.push({key: 'who', kind: 'info', label: auth.account ? tt('plex.signedInAs', {name: auth.account}) : tt('pref.plexSignedIn'), detail: auth.server ? auth.server.name : undefined});
		rows.push({key: 'server', kind: 'action', label: tt('plex.chooseServer'), run: () => setPhase('servers')});
		rows.push({key: 'out', kind: 'action', label: tt('plex.signOut'), detail: tt('plex.signOutDetail'), run: () => { const a = signOut(); log('plex: signed out'); onDone(a, tt('plex.signedOut')); }});
	} else if (phase === 'servers') {
		if (servers && !servers.length && status) rows.push({key: 'retry', kind: 'action', label: status, run: () => loadServers(auth)});
		(servers || []).forEach((s) => rows.push({
			key: s.id, kind: 'server', label: s.name,
			detail: (s.owned ? tt('plex.owned') : tt('plex.shared')) + (auth.server && auth.server.id === s.id ? ' · ✓' : ''),
			run: () => choose(s)
		}));
	}

	const handleKey = useCallback((key: NavKey): boolean => {
		if (key === 'back') {
			if (phase === 'servers' && start === 'account' && auth.token && auth.server) setPhase('account');
			else onClose();
			return true;
		}
		if (phase === 'code') {
			if (key === 'enter' && !pin) newCode();        // the code ran out or plex.tv did not answer: ask again
			return true;
		}
		const first = rows.length && rows[0].kind === 'info' && !rows[0].run ? 1 : 0;
		if (key === 'up') setIndex((i) => clamp(i - 1, first, Math.max(first, rows.length - 1)));
		else if (key === 'down') setIndex((i) => clamp(i + 1, first, Math.max(first, rows.length - 1)));
		else if (key === 'enter') { const row = rows[Math.max(index, first)]; if (row && row.run) row.run(); }
		return true;
	}, [phase, pin, rows.length, index, busy, servers, auth, status]);       // eslint-disable-line react-hooks/exhaustive-deps

	useKeys(handleKey, true);

	const focusIndex = rows.length && rows[0].kind === 'info' && !rows[0].run ? Math.max(index, 1) : index;
	const startRow = clamp(focusIndex - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(startRow, startRow + VISIBLE_ROWS);

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{phase === 'servers' ? tt('plex.chooseServer') : tt('plex.signInTitle')}</h1>
				<p class="settings__hint">{phase === 'code' ? tt('plex.signInHint', {page: PLEX_LINK_PAGE}) : phase === 'servers' ? tt('plex.chooseServerHint') : ''}</p>
				{phase === 'servers' && status && !(servers && !servers.length) && <div class="picker__path">{status}</div>}
				{phase === 'code'
					? (
						<div class="plexcode">
							<div class="plexcode__page">{PLEX_LINK_PAGE}</div>
							<div class="plexcode__code">{pin ? pin.code : ' '}</div>
							<div class="plexcode__status">{status}</div>
						</div>
					)
					: (
						<div class="picker">
							{visible.map((row, n) => {
								const i = startRow + n;
								return (
									<div
										key={row.key}
										class={`picker__row${i === focusIndex && row.run ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}`}
										onMouseEnter={() => { if (row.run) setIndex(i); }}
										onClick={() => { if (row.run) { setIndex(i); row.run(); } }}
									>
										<PickerIcon kind={row.kind === 'server' ? 'pin' : row.kind === 'info' ? 'info' : 'folder'} />
										<div class="picker__text">
											<div class="picker__label">{row.label}</div>
											{row.detail && <div class="picker__detail">{row.detail}</div>}
										</div>
									</div>
								);
							})}
						</div>
					)}
			</div>
		</div>
	);
}
