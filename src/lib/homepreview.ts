// p23b/p23c: which Settings rows show the home preview under the help text (row ids).
// Wallpaper tab: the picture, its size, opacity and bottom fade (interval and shuffle change nothing you can see here).
// Look: icon size, spacing, shape, style, tile, colour, opacity, margins, rows, the extra tiles, the app names, the theme.
const IDS = ['iconScale', 'iconGap', 'tileShape', 'iconStyle', 'iconLight', 'iconColor', 'iconOpacity', 'rows', 'sideMargin', 'bottomMargin', 'favSideMargin', 'favBottomMargin',
	'inputStatus', 'showLgHome', 'showSystem', 'hideSettings', 'theme', 'showLabels', 'labelColor', 'labelFont', 'labelSize', 'labelWeight',
	'wallpaper', 'wallpaperFit', 'wallpaperOpacity', 'fadeStrength',
	'clockTop', 'clockLeft'];          // p30 (user): the Widget position rows show the whole 16:9 screen with the widget in its place

export function homePreviewFor (id: string): boolean {
	return IDS.indexOf(id) !== -1;
}

/** p30: the Widget position rows; while one is highlighted the full preview replaces the widget-only strip of the Widget tab. */
export function widgetPositionRow (id: string): boolean {
	return id === 'clockTop' || id === 'clockLeft';
}
