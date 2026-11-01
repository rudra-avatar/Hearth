import {SYSTEM_APP} from '../config/constants';
import {exec, shellQuote} from './apps';

/** Recent apps through the TV's own services (root, via the Homebrew Channel's shell): the idea of the Back-key panel
 *  comes from a community contribution; the code is Hearth's own. */
export interface RecentApp {
	id: string;
	title: string;
}

const SELF = 'tld.my.customlauncher';
const SKIP = [SELF, SYSTEM_APP.lgHome, 'com.tvweb.home'];
const ID_RE = /^[A-Za-z0-9._-]+$/;

function lunaCmd (uri: string, payload: object): string {
	return `luna-send -n 1 ${uri} ${shellQuote(JSON.stringify(payload))}`;
}

function lunaJson (uri: string, payload: object = {}): Promise<any> {
	return exec(lunaCmd(uri, payload), 8000).then((out) => { try { return JSON.parse(out); } catch { return null; } });
}

/** L1b: the last list read, kept in memory only, so the panel can draw at once while the fresh list is read. */
let lastList: RecentApp[] | null = null;
export function cachedRecents (): RecentApp[] | null { return lastList; }

/** The apps the TV lists as recent, newest first, without Hearth and LG Home. Rejects with a plain reason. */
export function listRecents (): Promise<RecentApp[]> {
	return lunaJson('luna://com.webos.service.recent/listRecents').then(
		(r) => {
			if (!r || r.returnValue === false || !Array.isArray(r.recentsAppList)) throw new Error('The TV did not list its recent apps');
			const seen: Record<string, boolean> = {};
			const apps: RecentApp[] = [];
			r.recentsAppList.forEach((a: any) => {
				const id = a && typeof a.appId === 'string' ? a.appId : '';
				if (!id || seen[id] || !ID_RE.test(id) || SKIP.indexOf(id) !== -1) return;
				seen[id] = true;
				apps.push({id, title: String(a.title || id)});
			});
			lastList = apps;
			return apps;
		},
		() => { lastList = null; throw new Error('Recent apps needs the Homebrew Channel (a rooted TV)'); }
	);
}

function running (): Promise<{id: string; appType?: string}[] | null> {
	return lunaJson('luna://com.webos.applicationManager/running').then((r) => (r && r.returnValue !== false && Array.isArray(r.running) ? r.running : null));
}

/** Closes the given apps (web apps are killed, the rest closed by id), waits until they are gone, then drops them from the
 *  recent list. Rejects when the TV would not close one. */
export function closeRecents (ids: string[]): Promise<void> {
	if (lastList) lastList = lastList.filter((a) => ids.indexOf(a.id) === -1);
	const refuse = (): never => { throw new Error('The TV would not close it'); };
	const gone = (tries: number): Promise<void> => running().then((run) => {
		if (!run) return refuse();
		if (!run.some((a) => ids.indexOf(a.id) !== -1)) return undefined;
		if (!tries) return refuse();
		return new Promise<void>((r) => window.setTimeout(r, 200)).then(() => gone(tries - 1));
	});
	return running().then((run) => {
		if (!run) return refuse();
		const cmds = run.filter((a) => ids.indexOf(a.id) !== -1).map((a) => a.appType === 'web'
			? lunaCmd('luna://com.palm.webappmanager/killApp', {appId: a.id})
			: lunaCmd('luna://com.webos.applicationManager/closeByAppId', {id: a.id}));
		return cmds.length ? exec(cmds.join('; ') + '; true', 15000).then(() => undefined) : undefined;
	}).then(() => gone(10)).then(() => exec(ids.map((id) => lunaCmd('luna://com.webos.service.recent/removeRecent', {appId: id})).join('; ') + '; true', 15000)).then(() => undefined);
}
