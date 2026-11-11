// Tests for the Settings home preview (p23b): which rows show it (src/lib/homepreview.ts) and the shared row look (src/lib/homelook.ts).   Run: npm test
import {build} from 'esbuild';
const stub = {name: 'stub-apps', setup (b) {
	b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'}));
	b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'}));
}};
const load = async (entry, name) => {
	const out = new URL(`../node_modules/.cache-${name}-test.mjs`, import.meta.url).pathname;
	await build({entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error', plugins: [stub]});
	return import(out);
};
const hp = await load('../src/lib/homepreview.ts', 'homepreview');
const prefs = await load('../src/lib/prefs.ts', 'homepreview-prefs');
const look = await load('../src/lib/homelook.ts', 'homelook');
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const ids = prefs.PREFS.map((p) => p.id);
['iconScale', 'rows', 'tileShape', 'iconGap', 'iconStyle', 'iconLight', 'iconColor', 'iconOpacity', 'theme', 'sideMargin', 'bottomMargin', 'favSideMargin', 'favBottomMargin', 'inputStatus', 'showLgHome', 'showSystem', 'hideSettings', 'showLabels', 'labelColor', 'labelFont', 'labelSize', 'labelWeight', 'wallpaper', 'wallpaperFit', 'wallpaperOpacity', 'fadeStrength'].forEach((id) => {
	eq([ids.indexOf(id) !== -1, hp.homePreviewFor(id)], [true, true], `${id}: a real row that shows the preview`);
});
['clockTop', 'clockLeft'].forEach((id) => eq([ids.indexOf(id) !== -1, hp.homePreviewFor(id), hp.widgetPositionRow(id)], [true, true, true], `${id}: p30 Widget position row shows the full preview`));
['clockSize', 'clockAlign', 'iconScale'].forEach((id) => eq(hp.widgetPositionRow(id), false, `${id}: not a Widget position row`));
eq(hp.homePreviewFor('group:look:Labels'), false, 'group headers show no preview (only rows do)');
['interval', 'shuffle', 'clockSize', 'homeFocus', 'scrollSpeed', 'themeSave', 'themeRemove', 'group:look:Icons', 'group:look:Home row', 'resetLook'].forEach((id) => eq(hp.homePreviewFor(id), false, `${id}: no home preview`));

eq(look.tileSizes({iconScale: 100, iconGap: 100}), look.tileSizes({iconScale: 100, iconGap: 100}), 'tile sizes are stable');
const big = look.tileSizes({iconScale: 150, iconGap: 100});
const small = look.tileSizes({iconScale: 50, iconGap: 100});
eq(big.tileSize > small.tileSize && big.tileGap > small.tileGap, true, 'a larger icon size gives larger tiles and gaps');
eq(look.tileSizes({iconScale: 100, iconGap: 0}).tileGap, 0, 'icon spacing 0 = no gap');
process.exit(fail ? 1 : 0);
