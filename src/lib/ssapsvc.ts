// S3: the app list without root through Hearth's own helper service (`services/tld.my.customlauncher.ssap`, packaged in
// the ipk). Newer LG firmware closes the page's own connection to the TV's remote-control port with code 1008 before
// anything is said; the service opens the same port from Node, where the Origin header can be chosen. The page only
// calls the service over Luna; nothing runs at start-up.

import {lunaCall} from './luna';
import {registerMessage} from './ssapreg';
import type {Variant} from './ssapreg';

type Json = Record<string, unknown>;

export const SSAP_SERVICE = 'luna://tld.my.customlauncher.ssap';

/** The route the service used: port, encrypted or not, Origin header ('' = none). */
export interface SvcRoute {port: number; tls: boolean; origin: string}

export interface SvcAttempt extends SvcRoute {
	reg: number; replied: boolean; prompted: boolean; ok: boolean;
	code?: number | null; reason?: string; status?: string; error?: string;
}

export interface SvcPair {results: SvcAttempt[]; key: string; route: (SvcRoute & {reg: number}) | null}

const VARIANTS: Variant[] = ['new', 'old'];

export const variantAt = (reg: number): Variant => VARIANTS[reg] || 'old';

/** Pairs through the service: every route with the new, then the old request, until the TV answers. The TV may ask for OK. */
export function pairViaService (waitMs: number): Promise<SvcPair> {
	const registers = VARIANTS.map((v) => registerMessage('', v));
	return lunaCall<Json>(SSAP_SERVICE + '/pair', {registers, waitMs}, waitMs + 30000).then((r) => ({
		results: (Array.isArray(r.results) ? r.results : []) as SvcAttempt[],
		key: String(r.key || ''),
		route: (r.route || null) as (SvcRoute & {reg: number}) | null
	}));
}

/** One read-only request over a paired route. Resolves with the payload, or null when the TV asked to pair again. */
export function askViaService (route: SvcRoute, key: string, variant: Variant, uri: string): Promise<Json | null> {
	return lunaCall<Json>(SSAP_SERVICE + '/list', {route: {port: route.port, tls: route.tls, origin: route.origin}, register: registerMessage(key, variant), uri}, 30000).then(
		(r) => (r.prompted ? null : ((r.payload || {}) as Json)));
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** How one attempt ended, in a few characters: `1008 invalid origin`, `refused`, `reply`. */
export function attemptText (a: SvcAttempt): string {
	if (a.replied) return a.ok ? 'paired' : 'reply: ' + clip(a.error || '?', 20);
	if (a.status) return clip(a.status, 24);
	if (a.code !== undefined && a.code !== null) return String(a.code) + (a.reason ? ' ' + clip(a.reason, 16) : '');
	return clip(a.error || a.reason || 'closed', 24);
}

const routeName = (a: SvcRoute): string => a.port + ' ' + (a.origin || '-');

/** One line for the Tests tab and error messages: each route once, with its outcome (the two request forms joined when equal). */
export function summaryOf (results: SvcAttempt[]): string {
	const order: string[] = [];
	const by: Record<string, string[]> = {};
	results.forEach((a) => {
		const name = routeName(a);
		if (!by[name]) { by[name] = []; order.push(name); }
		by[name].push(attemptText(a));
	});
	return order.map((name) => name + ': ' + (by[name].length > 1 && by[name].every((x) => x === by[name][0]) ? by[name][0] : by[name].join(' / '))).join('; ');
}
