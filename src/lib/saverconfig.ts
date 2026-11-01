// What the screen saver shows, worked out from the config (pure, no TV calls). Used by the Options rows and by screensaver.ts.

import type {UserConfig} from './storage';
import {t as tt} from '../i18n';

/** Values of `screensaverSource` that are not paths: the 25 photos that come with Hearth, and the video that comes with it. */
export const SAVER_PHOTOS = '@photos';
export const SAVER_VIDEO = '@video';
/** Prefix of one built-in photo (`@photo:photo-03`): the saver follows a single built-in wallpaper photo. */
export const SAVER_PHOTO_PREFIX = '@photo:';

/** The folder or picture the saver plays: its own choice, else the wallpaper's folder or picture, else '' (the bundled photos). */
export function saverSource (c: UserConfig): string {
	if (c.screensaverSource) return c.screensaverSource;
	// the wallpaper is ONE built-in photo: the saver shows that photo (not the slideshow)
	if (c.wallpaper.mode === 'gradient' && /^photo-\d\d$/.test(c.background)) return SAVER_PHOTO_PREFIX + c.background;
	return (c.wallpaper.mode === 'folder' || c.wallpaper.mode === 'image') && c.wallpaper.path ? c.wallpaper.path : '';
}

/** Whether the saver's folder also uses the folders inside it (its own choice, else the wallpaper's). */
export function saverRecursive (c: UserConfig): boolean {
	return c.screensaverSource ? c.screensaverRecursive : (c.wallpaper.mode === 'folder' && c.wallpaper.recursive);
}

/** A slideshow: a folder or the bundled photos. One picture, GIF or video is not (speed and shuffle do not apply). */
export function saverIsSlideshow (c: UserConfig): boolean {
	if (c.screensaverSource === SAVER_VIDEO) return false;
	const source = saverSource(c);
	if (source.indexOf(SAVER_PHOTO_PREFIX) === 0) return false;
	if (!source) return true;
	return c.screensaverSource ? !/\.[a-z0-9]{2,4}$/i.test(source) : c.wallpaper.mode === 'folder';
}

/** Choices for "power off after the screen saver" (seconds; 0 = never). */
export const SAVER_POWEROFF_VALUES: readonly number[] = [0, 60, 180, 300, 600, 1200, 1800, 3600];

export function powerOffText (seconds: number): string {
	if (seconds === 0) return tt('saverconfig.off');
	if (seconds === 60) return tt('saverconfig.1Minute');
	return seconds === 3600 ? tt('saverconfig.1Hour') : tt('saverconfig.minutes', {v: seconds / 60});
}

/** Picture size in the saver: 'fit' shows the whole picture or video (bars where the shapes differ), 'fill' crops it to fill the screen. */
export type SaverFit = 'fit' | 'fill';
export const SAVER_FIT_VALUES: readonly SaverFit[] = ['fit', 'fill'];
export function fitText (v: SaverFit): string {
	return v === 'fill' ? tt('saverconfig.fillTheScreenCropped') : tt('saverconfig.fitWholePicture');
}

/** Choices for the saver's own slideshow speed (seconds). */
/** Choices for the saver's Dim strength (% darkness). */
export const SAVER_DIM_VALUES: readonly number[] = [10, 20, 30, 40, 50, 60, 70, 80];

export const SAVER_INTERVAL_VALUES: readonly number[] = [10, 20, 30, 60, 300, 900, 1800, 3600];

/** The number the script and the QML use: 1 care on, 0 off. */
export function careNumber (care: boolean): number {
	return care ? 1 : 0;
}

/** 1 = fill (crop), 0 = fit, for the settings file. */
export function fillNumber (fit: SaverFit): number {
	return fit === 'fill' ? 1 : 0;
}
