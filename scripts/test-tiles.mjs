// Tests for src/lib/tiles.ts (apps, inputs and recent apps as tiles, with the user's names and icons).   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-tiles-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/tiles.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const t = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

const PIC = 'data:image/png;base64,AAAA';
const apps = [
	{id: 'com.example.plain', title: 'Plain', iconUrl: 'data:image/png;base64,PLAIN', color: '#123456'},
	{id: 'com.example.named', title: 'Named', iconUrl: 'data:image/png;base64,NAMED'},
	{id: 'com.example.picture', title: 'Picture', iconUrl: 'data:image/png;base64,OLD'},
	{id: 'com.example.bundled', title: 'Bundled', iconUrl: 'data:image/png;base64,OLD'},
	{id: 'com.example.drawn', title: 'Drawn', iconUrl: 'data:image/png;base64,OLD'}
];
const edits = {
	'com.example.named': {label: 'My name'},
	'com.example.picture': {label: 'Mine', iconData: PIC},
	'com.example.bundled': {icon: 'app:cdp-30.png'},
	'com.example.drawn': {icon: 'console'}
};
const inputs = [
	{id: 'HDMI_1', appId: 'com.webos.app.hdmi1', label: 'HDMI 1', port: 1, connected: true, icon: 'hdmi.png'},
	{id: 'X', appId: 'com.example.plain', label: 'Clash', port: 9, connected: true, icon: 'hdmi.png'}
];
const sourceEdits = {'com.webos.app.hdmi1': {label: 'Console', icon: 'console'}};
const tiles = t.tilesById(apps, inputs, edits, sourceEdits);
eq(Object.keys(tiles).sort(), apps.map((a) => a.id).concat('com.webos.app.hdmi1').sort(), 'every app and input gets a tile, by id');
eq(tiles['com.example.plain'], {key: 'com.example.plain', label: 'Plain', imageUrl: 'data:image/png;base64,PLAIN', color: '#123456'}, 'an app without edits keeps its own name and icon');
eq(tiles['com.example.named'].label, 'My name', "the user's name");
eq(tiles['com.example.named'].imageUrl, 'data:image/png;base64,NAMED', 'a new name alone keeps the icon');
eq([tiles['com.example.picture'].label, tiles['com.example.picture'].imageUrl], ['Mine', PIC], "the user's own picture");
eq(tiles['com.example.bundled'].imageUrl, 'icons/apps/cdp-30.png', 'a bundled app icon');
eq([tiles['com.example.drawn'].imageUrl, tiles['com.example.drawn'].sourceIcon], [undefined, 'console'], 'a drawn icon replaces the artwork');
eq(t.tilesById(apps, [])['com.example.named'].label, 'Named', 'no edits at all');
eq([tiles['com.webos.app.hdmi1'].label, tiles['com.webos.app.hdmi1'].sourceIcon], ['Console', 'console'], "an input with the user's name and icon");
eq(tiles['com.example.plain'].label, 'Plain', 'an app wins over an input with the same id');

// ---- recent apps ----
eq(t.recentTile('com.example.named', "LG's title", tiles), tiles['com.example.named'], 'a recent app is drawn as its home-row tile (the TV\'s title is not used)');
eq(t.recentTile('com.example.drawn', 'Drawn', tiles).sourceIcon, 'console', 'with its drawn icon');
eq(t.recentTile('com.webos.app.hdmi1', 'HDMI1', tiles).label, 'Console', 'a recent input has its new name too');
eq(t.recentTile('com.lg.notlisted', 'Not listed', tiles), {key: 'com.lg.notlisted', label: 'Not listed'}, 'an app missing from the app list: the TV\'s title and a monogram, as before');
eq(t.recentTile('constructor', 'Odd id', tiles), {key: 'constructor', label: 'Odd id'}, 'an id that is also an Object property is not found by mistake');
process.exit(fail ? 1 : 0);
