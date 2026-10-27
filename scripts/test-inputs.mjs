// Tests for the input status in src/lib/inputs.ts and src/lib/tiles.ts (HDMI-CEC names, unplugged inputs).   Run: npm test
import {build} from 'esbuild';

const stub = (filter, contents) => ({name: 'stub-' + filter, setup (b) {
	b.onResolve({filter}, (a) => ({path: a.path, namespace: 'stub'}));
	b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents, loader: 'js'}));
}});
const stubs = 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v; export const lunaCall = () => Promise.resolve({}); export const appExists = () => Promise.resolve(false);';
const out = new URL('../node_modules/.cache-inputs-test.mjs', import.meta.url).pathname;
await build({
	stdin: {contents: 'export * from "./src/lib/inputs"; export {inputTile} from "./src/lib/tiles";', resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts'},
	bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
	plugins: [stub(/^\.\/(apps|luna|launch)$/, stubs)]
});
const t = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };

// the reply shape seen on a webOS 4.5 TV (externaldevice/getExternalInputStatusList)
const reply = {returnValue: true, cec: {ArcDevice: true, cecDeviceList: [
	{osdName: '', physicalAddr: 0, portId: 0},
	{osdName: 'Fire TV Stick', physicalAddr: 0x2000, portId: 0},
	{osdName: 'PlayStation 5', physicalAddr: 0x3000, portId: 3},
	{osdName: 'Soundbar', physicalAddr: 0x2100, portId: 0}
]}};
const cec = t.cecList(reply);
eq(cec.length, 4, 'the CEC list is read from the reply');
eq(t.cecList({returnValue: false}), [], 'no cec block gives an empty list');
eq(t.cecList(null), [], 'no reply gives an empty list');
eq([t.cecPort(cec[0]), t.cecPort(cec[1]), t.cecPort(cec[2]), t.cecPort(cec[3])], [0, 2, 3, 2], 'port from the port id, else the physical address');

const inputs = [
	{id: 'HDMI_1', appId: 'com.webos.app.hdmi1', label: 'HDMI 1', port: 1, connected: false, icon: 'HDMI_1.png'},
	{id: 'HDMI_2', appId: 'com.webos.app.hdmi2', label: 'HDMI 2', port: 2, connected: true, icon: 'HDMI_2.png'},
	{id: 'HDMI_3', appId: 'com.webos.app.hdmi3', label: 'HDMI 3', port: 3, connected: false, icon: 'HDMI_3.png'},
	{id: 'AV_1', appId: 'com.webos.app.externalinput.av1', label: 'AV', port: 1, connected: true, icon: 'av.png'}
];
const named = t.withDeviceNames(inputs, cec);
eq(named[1].deviceName, 'Fire TV Stick', 'the first device on a port names it (not the soundbar behind it)');
eq(named[2].deviceName, undefined, 'an input with nothing connected gets no name, even if the TV remembers one');
eq(named[3].deviceName, undefined, 'only HDMI inputs take CEC names');
eq(t.withDeviceNames(inputs, []), inputs, 'no CEC devices leaves the inputs as they were');

eq(t.inputTile(named[0], {}, true).disconnected, true, 'an unplugged input is greyed out');
eq(t.inputTile(named[0], {}, true).note, 'Not connected', 'and says so');
eq(t.inputTile(named[1], {}, true).note, 'Fire TV Stick', 'a connected device shows its name under the input');
eq(t.inputTile(named[1], {'com.webos.app.hdmi2': {label: 'Fire TV Stick'}}, true).note, undefined, 'no note when the user already named it the same');
eq([t.inputTile(named[0], {}, false).disconnected, t.inputTile(named[1], {}, false).note], [undefined, undefined], 'with the setting off, tiles are plain');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
