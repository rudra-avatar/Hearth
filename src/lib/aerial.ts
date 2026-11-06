// Apple TV Aerials for the screen saver (rooted TVs): the video list, the download queue and the folders.
// The TV side is public/aerial/aerial.sh (it ships inside Hearth). Only Apple's own servers are asked; every
// connection is checked (see the script for the certificate). Nothing of Apple's ships with Hearth.

import {exec, shellQuote} from './apps';
import {isWebOS} from './luna';
import {readFileChunks} from './wallpaper';
import {APP_ID} from '../config/constants';

export const AERIAL_SCRIPT = `/media/developer/apps/usr/palm/applications/${APP_ID}/aerial/aerial.sh`;
/** The screen saver plays this folder; the wallpaper slideshow shows the stills in the other. */
export const AERIAL_VIDEOS = '/media/developer/screensavers/aerial';
export const AERIAL_FRAMES = '/media/developer/wallpapers/aerial';

export type AerialCategory = 'landscapes' | 'cities' | 'underwater' | 'space' | 'other';
export const CATEGORY_ORDER: AerialCategory[] = ['landscapes', 'cities', 'underwater', 'space', 'other'];
export type AerialQuality = '4k' | '1080';

export interface AerialVideo {
	/** the file name (lower-case letters, digits, dashes) */
	name: string;
	/** Apple's English title */
	title: string;
	category: AerialCategory;
	url4k: string;
	url1080: string;
	/** Apple's preview picture (PNG, about 900x580); '' when there is none */
	preview: string;
}

export interface AerialJob {state: string; bytes: number; total: number}

export interface AerialStatus {
	/** finished videos: name -> bytes */
	files: Record<string, number>;
	/** stills that exist */
	frames: Record<string, boolean>;
	/** queued, running or failed downloads */
	jobs: Record<string, AerialJob>;
	/** free space where new downloads go, KB (-1: unknown) */
	freeKB: number;
	/** where each finished video is: name -> place */
	where: Record<string, string>;
	/** every place that is there now (internal, usb:/PATH, net) with its folder, in the TV's order */
	places: Array<{place: string; dir: string}>;
	/** where new downloads go, and whether that place is there now */
	target: {place: string; ok: boolean; dir: string};
	/** the network folder: null when none is set */
	net: {on: boolean; host: string; share: string; guest: boolean} | null;
}

export type PlaceKind = 'internal' | 'usb' | 'net';
export function placeKind (place: string): PlaceKind {
	return place === 'net' ? 'net' : place.indexOf('usb:') === 0 ? 'usb' : 'internal';
}

const SAFE_URL = /^https:\/\/sylvan\.apple\.com\/[A-Za-z0-9._\/:%-]+$/;
const SAFE_NAME = /^[a-z0-9-]+$/;
const SAFE_PREVIEW = /^https:\/\/sylvan\.apple\.com\/[A-Za-z0-9._\/:%-]+\.(png|jpe?g)$/;

export function previewCommand (url: string): string {
	if (!SAFE_PREVIEW.test(url)) throw new Error('unsafe preview');
	return `sh '${AERIAL_SCRIPT}' preview '${url}'`;
}

/** The path the script printed for a fetched preview ("file /tmp/hearth-aerial-preview/<hash>.png"), or null. */
export function parsePreviewFile (out: string): string | null {
	const m = /^file (\/tmp\/hearth-aerial-preview\/[0-9a-f]{16}\.(png|jpe?g))\s*$/m.exec(out);
	return m ? m[1] : null;
}

// The last few preview pictures (blob: URLs), so going back up the list shows them at once.
const previews: Array<[string, string]> = [];
const PREVIEW_CACHE = 12;

export function cachedPreview (url: string): string | null {
	for (const [u, blob] of previews) if (u === url) return blob;
	return null;
}

/** Apple's preview picture: the web view cannot check Apple's certificate, so the TV's shell fetches it into /tmp and
 *  it is read back in pieces (a web app gets at most about 128 KB per shell answer), like a wallpaper picture. */
export function loadPreview (url: string): Promise<string> {
	const known = cachedPreview(url);
	if (known) return Promise.resolve(known);
	return exec(previewCommand(url), 30000).then((out) => {
		const path = parsePreviewFile(out);
		if (!path) throw new Error((/result=failed (.*)/.exec(out) || [])[1] || 'no picture');
		return readFileChunks(path);
	}).then((parts) => {
		const blob = URL.createObjectURL(new Blob(parts as unknown as BlobPart[], {type: /\.png$/.test(url) ? 'image/png' : 'image/jpeg'}));
		previews.push([url, blob]);
		while (previews.length > PREVIEW_CACHE) { const old = previews.shift(); if (old) URL.revokeObjectURL(old[1]); }
		return blob;
	});
}

// ---------- every video's size, asked from Apple once (headers only) and kept on the TV ----------

/** The sizes known so far by address, and whether the TV is still asking. */
export function parseSizes (out: string): {running: boolean; bytes: Record<string, number>} {
	const bytes: Record<string, number> = {};
	let running = true;
	out.split('\n').forEach((line) => {
		if (/^@@sizes done/.test(line)) running = false;
		const m = /^(https:\/\/sylvan\.apple\.com\/\S+) (\d+)$/.exec(line.trim());
		if (m) bytes[m[1]] = Number(m[2]);
	});
	return {running, bytes};
}

export function startSizes (): Promise<void> {
	return exec(`sh '${AERIAL_SCRIPT}' sizes`, 15000).then(() => undefined);
}

export function readSizes (): Promise<{running: boolean; bytes: Record<string, number>}> {
	return exec(`sh '${AERIAL_SCRIPT}' sizelist`, 15000).then(parseSizes);
}

export function slug (title: string): string {
	const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	return s || 'video';
}

function categoryOf (key: string | undefined): AerialCategory {
	if (!key) return 'other';
	if (/landscape/i.test(key)) return 'landscapes';
	if (/cit(y|ies)/i.test(key)) return 'cities';
	if (/underwater/i.test(key)) return 'underwater';
	if (/space/i.test(key)) return 'space';
	return 'other';
}

/** Apple's entries.json as a sorted list (by group, then Apple's own order, then title). Videos without a safe 4K
 *  or 1080p H.264 address are left out; names that would clash get -2, -3. */
export function parseCatalog (json: string): AerialVideo[] {
	let data: {categories?: Array<{id?: string; localizedNameKey?: string}>; assets?: Array<Record<string, unknown>>};
	try { data = JSON.parse(json); } catch { return []; }
	const cats: Record<string, string> = {};
	(data.categories || []).forEach((c) => { if (c && c.id) cats[c.id] = c.localizedNameKey || ''; });
	type Row = AerialVideo & {order: number};
	const rows: Row[] = [];
	(data.assets || []).forEach((a) => {
		const title = typeof a.accessibilityLabel === 'string' ? a.accessibilityLabel.trim() : '';
		const url4k = typeof a['url-4K-SDR'] === 'string' ? a['url-4K-SDR'] as string : '';
		const url1080 = typeof a['url-1080-H264'] === 'string' ? a['url-1080-H264'] as string : '';
		if (!title || !SAFE_URL.test(url4k) || !SAFE_URL.test(url1080)) return;
		const ids = Array.isArray(a.categories) ? a.categories as string[] : [];
		const order = typeof a.preferredOrder === 'number' ? a.preferredOrder : 9999;
		const pic = typeof a.previewImage === 'string' ? a.previewImage : '';
		const preview = SAFE_PREVIEW.test(pic) ? pic : '';
		rows.push({name: '', title, category: categoryOf(cats[ids[0]]), url4k, url1080, preview, order});
	});
	rows.sort((x, y) => CATEGORY_ORDER.indexOf(x.category) - CATEGORY_ORDER.indexOf(y.category) || x.order - y.order || (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));
	const used: Record<string, number> = {};
	return rows.map((r) => {
		const base = slug(r.title);
		used[base] = (used[base] || 0) + 1;
		return {name: used[base] > 1 ? `${base}-${used[base]}` : base, title: r.title, category: r.category, url4k: r.url4k, url1080: r.url1080, preview: r.preview};
	});
}

export function parseStatus (out: string): AerialStatus {
	const s: AerialStatus = {files: {}, frames: {}, jobs: {}, freeKB: -1, where: {}, places: [], target: {place: 'internal', ok: true, dir: AERIAL_VIDEOS}, net: null};
	out.split('\n').forEach((line) => {
		const f = line.trim().split(/\s+/);
		if (f[0] === 'file' && SAFE_NAME.test(f[1] || '')) { s.files[f[1]] = Number(f[2]) || 0; s.where[f[1]] = f.slice(3).join(' ') || 'internal'; }
		else if (f[0] === 'place' && f[1] && f[2]) s.places.push({place: f[1], dir: f.slice(2).join(' ')});
		else if (f[0] === 'target' && f[1]) s.target = {place: f[1], ok: f[2] === 'ok', dir: f[2] === 'ok' ? f.slice(3).join(' ') : ''};
		else if (f[0] === 'net' && f[1] && f[1] !== 'none' && f[2] && f[3]) s.net = {on: f[1] === 'on', host: f[2], share: f[3].replace(/\+/g, ' '), guest: f[4] !== 'user'};
		else if (f[0] === 'frame' && SAFE_NAME.test(f[1] || '')) s.frames[f[1]] = true;
		else if (f[0] === 'job' && SAFE_NAME.test(f[1] || '')) s.jobs[f[1]] = {state: f[2] || 'queued', bytes: Number(f[3]) || 0, total: Number(f[4]) || 0};
		else if (f[0] === 'free' && /^\d+$/.test(f[1] || '')) s.freeKB = Number(f[1]);
	});
	return s;
}

export function getCommand (v: AerialVideo, quality: AerialQuality): string {
	const url = quality === '4k' ? v.url4k : v.url1080;
	if (!SAFE_NAME.test(v.name) || !SAFE_URL.test(url) || !SAFE_URL.test(v.url1080)) throw new Error('unsafe video');
	return `sh '${AERIAL_SCRIPT}' get '${v.name}' ${quality} '${url}' '${v.url1080}'`;
}

// ---------- where downloads go, and the network folder ----------

const SAFE_HOST = /^[A-Za-z0-9.-]{1,253}$/;
const SAFE_SHARE = /^[A-Za-z0-9._$\/ -]{1,200}$/;
const SAFE_USER = /^[A-Za-z0-9._@\\-]{0,100}$/;

export function targetCommand (place: string): string {
	if (!/^(internal|net|usb:\/[A-Za-z0-9._\/ -]+)$/.test(place)) throw new Error('unsafe place');
	return `sh '${AERIAL_SCRIPT}' target ${shellQuote(place)}`;
}

/** The share as typed: "Video", "/Video/", "\\\\NAS\\Video" all read as "Video" (the host is asked separately). */
export function cleanShare (text: string): string {
	let t = text.trim().replace(/\\/g, '/');
	if (/^\/\//.test(t)) t = t.replace(/^\/\/[^/]*\/?/, '');        // "//NAS/Video" or "\\NAS\Video": drop the server part
	return t.replace(/^\/+|\/+$/g, '').trim();
}

export function netSetCommand (host: string, share: string, user: string, pass: string): string {
	if (!SAFE_HOST.test(host) || !SAFE_SHARE.test(share) || !SAFE_USER.test(user) || pass.length > 200) throw new Error('unsafe network folder');
	return `sh '${AERIAL_SCRIPT}' netset ${shellQuote(host)} ${shellQuote(share)}` + (user ? ` ${shellQuote(user)} ${shellQuote(pass)}` : '');
}

export function setTarget (place: string): Promise<string> {
	return exec(targetCommand(place), 60000).then((out) => out.trim());
}

/** Saves and connects the network folder. Resolves with "ok" or the TV's reason. */
export function setNetwork (host: string, share: string, user: string, pass: string): Promise<string> {
	return exec(netSetCommand(host, share, user, pass), 90000).then((out) => {
		const m = /result=(\w+)(?: (.*))?/.exec(out);
		return !m ? 'failed' : m[1] === 'ok' ? 'ok' : (m[2] || m[1]);
	});
}

export function forgetNetwork (): Promise<string> {
	return exec(`sh '${AERIAL_SCRIPT}' netoff`, 30000).then((out) => out.trim());
}

export function removeCommand (name: string): string {
	if (!SAFE_NAME.test(name)) throw new Error('unsafe name');
	return `sh '${AERIAL_SCRIPT}' rm '${name}'`;
}

// ---------- the list, kept in localStorage so the screen opens at once; asked again after a week ----------

const CACHE_KEY = 'customlauncher-aerial-list';
const CACHE_DAYS = 7;

interface Cached {at: number; videos: AerialVideo[]}

export function cachedCatalog (now: number = Date.now()): {videos: AerialVideo[]; fresh: boolean} | null {
	try {
		const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Cached | null;
		if (!c || !Array.isArray(c.videos) || !c.videos.length) return null;
		if (typeof c.videos[0].preview !== 'string') return null;          // saved by a build without previews: ask again
		return {videos: c.videos, fresh: now - c.at < CACHE_DAYS * 86400000};
	} catch { return null; }
}

export function readCatalog (refresh = false): Promise<AerialVideo[]> {
	if (!isWebOS()) return Promise.reject(new Error('Not running on webOS'));
	return exec(`sh '${AERIAL_SCRIPT}' catalog${refresh ? ' refresh' : ''}`, 180000).then((out) => {
		const at = out.indexOf('@@ok');
		if (at < 0) throw new Error((/result=failed (.*)/.exec(out) || [])[1] || 'the video list could not be read');
		const videos = parseCatalog(out.slice(at + 4));
		if (!videos.length) throw new Error('the video list is empty');
		try { localStorage.setItem(CACHE_KEY, JSON.stringify({at: Date.now(), videos} as Cached)); } catch { /* ignore */ }
		return videos;
	});
}

export function readStatus (): Promise<AerialStatus> {
	return exec(`sh '${AERIAL_SCRIPT}' status`, 15000).then(parseStatus);
}

export function queueVideo (v: AerialVideo, quality: AerialQuality): Promise<string> {
	return exec(getCommand(v, quality), 15000).then((out) => (/result=(\w+)/.exec(out) || [])[1] || 'failed');
}

export function removeVideo (name: string): Promise<string> {
	return exec(removeCommand(name), 15000).then((out) => (/result=(\w+)/.exec(out) || [])[1] || 'failed');
}

export function mb (bytes: number): number {
	return Math.round(bytes / 1048576);
}
