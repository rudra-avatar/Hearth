// Adapters from data (apps, inputs) to what the Tile component draws.

import type {AppEntry} from './apps';
import type {InputSource} from './inputs';
import type {TileModel} from '../components/Tile';
import {appIconUrl, isAppIcon} from '../config/appicons';
import {autoIcon, type SourceEdits} from './sourceicons';

export function appTile (app: AppEntry, edits: SourceEdits = {}): TileModel {
	const edit = edits[app.id];
	if (!edit) return {key: app.id, label: app.title, imageUrl: app.iconUrl, color: app.color};
	// the user's picture wins, then a bundled app icon, then a drawn icon, then the app's own artwork
	const bundled = edit.icon && isAppIcon(edit.icon) ? appIconUrl(edit.icon) : '';
	return {key: app.id, label: edit.label || app.title, imageUrl: edit.iconData || bundled || (edit.icon ? undefined : app.iconUrl), sourceIcon: edit.iconData || bundled ? undefined : edit.icon, color: app.color};
}

/** status: show whether something is plugged in (greyed out when not) and the connected device's CEC name. */
export function inputTile (input: InputSource, edits: SourceEdits = {}, status = false): TileModel {
	const edit = edits[input.appId] || {};
	const tile: TileModel = {key: input.appId, label: edit.label || input.label, imageUrl: edit.iconData || undefined, sourceIcon: edit.icon || autoIcon(input.icon)};
	if (!status) return tile;
	if (!input.connected) return {...tile, disconnected: true, note: 'Not connected'};
	return input.deviceName && input.deviceName !== tile.label ? {...tile, note: input.deviceName} : tile;
}

/** Order `items` by an ID list, dropping IDs that no longer exist. */
export function pickInOrder<T> (items: T[], ids: string[], idOf: (item: T) => string): T[] {
	const byId: Record<string, T> = {};
	for (const item of items) byId[idOf(item)] = item;
	return ids.map((id) => byId[id]).filter((x): x is T => x !== undefined);
}
