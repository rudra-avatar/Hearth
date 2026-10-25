// The wallpapers that come with Hearth (public/wallpapers, drawn from the sources in tools/wallpapers).
// They are part of the app, so the web view loads them directly: no shell, no saved copy. Each is a
// 1920x1080 JPEG of about 150-190 KB; only the one on screen is ever loaded.

export interface BuiltinWallpaper { id: string; label: string; detail: string; }

export const BUILTIN_WALLPAPERS: readonly BuiltinWallpaper[] = [
	{id: 'aurora', label: 'wallpaper.builtin.aurora', detail: 'wallpaper.builtin.aurora.detail'},
	{id: 'dunes', label: 'wallpaper.builtin.dunes', detail: 'wallpaper.builtin.dunes.detail'},
	{id: 'tide', label: 'wallpaper.builtin.tide', detail: 'wallpaper.builtin.tide.detail'},
	{id: 'bloom', label: 'wallpaper.builtin.bloom', detail: 'wallpaper.builtin.bloom.detail'},
	{id: 'horizon', label: 'wallpaper.builtin.horizon', detail: 'wallpaper.builtin.horizon.detail'}
];

export function builtinWallpaper (id: string): BuiltinWallpaper | undefined {
	return BUILTIN_WALLPAPERS.find((w) => w.id === id);
}

/** Where the picture is, relative to index.html. */
export function builtinWallpaperUrl (id: string): string {
	return `wallpapers/${id}.jpg`;
}
