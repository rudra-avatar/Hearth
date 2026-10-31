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

export function inputTile (input: InputSource, edits: SourceEdits = {}): TileModel {
	const edit = edits[input.appId] || {};
	return {key: input.appId, label: edit.label || input.label, imageUrl: edit.iconData || undefined, sourceIcon: edit.icon || autoIcon(input.icon)};
}

/** Every app's and input's tile by id, with the user's names and icons: the Recent apps panel draws the same tiles as
 *  the home row (an input, com.webos.app.hdmi1 say, can be a recent app too). An app wins over an input with the same id. */
export function tilesById (apps: AppEntry[], inputs: InputSource[], appEdits: SourceEdits = {}, sourceEdits: SourceEdits = {}): Record<string, TileModel> {
	const byId: Record<string, TileModel> = {};
	for (const input of inputs) byId[input.appId] = inputTile(input, sourceEdits);
	for (const app of apps) byId[app.id] = appTile(app, appEdits);
	return byId;
}

/** A recent app (the TV's id and title) as a tile: its home-row tile when Hearth knows the app or input, otherwise the
 *  TV's title over a monogram. */
export function recentTile (id: string, title: string, tiles: Record<string, TileModel>): TileModel {
	return Object.prototype.hasOwnProperty.call(tiles, id) ? tiles[id] : {key: id, label: title};
}

/** Order `items` by an ID list, dropping IDs that no longer exist. */
export function pickInOrder<T> (items: T[], ids: string[], idOf: (item: T) => string): T[] {
	const byId: Record<string, T> = {};
	for (const item of items) byId[idOf(item)] = item;
	return ids.map((id) => byId[id]).filter((x): x is T => x !== undefined);
}
