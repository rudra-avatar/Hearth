// Tests for 2.0.3 I2 (src/lib/storeguard.ts + saveConfig/loadConfig in storage.ts): a full store frees rebuildable caches in order, never settings.   Run: npm test
import {build} from 'esbuild';
const out = (n) => new URL('../node_modules/.cache-storeguard-' + n + '.mjs', import.meta.url).pathname;
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
// fake localStorage with a quota in characters (key + value)
function fake (quota) {
	const m = new Map();
	const used = () => { let n = 0; m.forEach((v, k) => { n += k.length + v.length; }); return n; };
	return {
		getItem: (k) => (m.has(k) ? m.get(k) : null),
		setItem (k, v) { const old = m.has(k) ? k.length + m.get(k).length : 0; if (used() - old + k.length + String(v).length > quota) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
		removeItem: (k) => { m.delete(k); },
		key: (i) => Array.from(m.keys())[i] ?? null,
		get length () { return m.size; },
		_m: m
	};
}
await build({entryPoints: [new URL('../src/lib/storeguard.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out('g'), platform: 'node', logLevel: 'error'});
const g = await import(out('g'));
const fill = (s, k, n) => s.setItem(k, 'x'.repeat(n));
{ // fits at once: nothing freed
	const s = fake(1000); fill(s, 'hearth-mono-v3', 300);
	const r = g.writeWithRoom(s, 'cfg', 'y'.repeat(100));
	eq([r.ok, r.freed], [true, []], 'fits: nothing freed'); eq(s.getItem('hearth-mono-v3') !== null, true, 'fits: cache kept');
}
{ // frees the cheapest group first and stops at the first that makes room
	const s = fake(1000); fill(s, 'hearth-mono-v3', 400); fill(s, 'launcher-icon-cache-v1', 400); fill(s, 'launcher-icon-stamps-v1', 50);
	const r = g.writeWithRoom(s, 'cfg', 'y'.repeat(300));
	eq(r.ok, true, 'frees: ok'); eq(r.freed, ['hearth-mono-v3'], 'frees: only mono');
	eq(s.getItem('launcher-icon-cache-v1') !== null, true, 'frees: icon cache kept');
}
{ // order: mono, ssap data, weather, icon cache+stamps, apps cache, wallpaper copies last
	const s = fake(5000);
	['hearth-mono-v3', 'hearth-ssap-icondata-v1', 'customlauncher-weather-v1', 'launcher-icon-cache-v1', 'launcher-icon-stamps-v1', 'customlauncher-apps-v1', 'customlauncher-wallpaper-id-v1', 'customlauncher-wallpaper-data-v1', 'hearth-bundled-id-v1', 'hearth-bundled-data-v1'].forEach((k) => fill(s, k, 400));
	const r = g.writeWithRoom(s, 'cfg', 'y'.repeat(4000));
	eq(r.ok, true, 'order: ok');
	eq(r.freed, ['hearth-mono-v3', 'hearth-ssap-icondata-v1', 'customlauncher-weather-v1', 'launcher-icon-stamps-v1', 'customlauncher-apps-v1', 'customlauncher-wallpaper-data-v1'], 'order: wallpaper own copy after the apps cache; bundled copy kept');
	eq(s.getItem('hearth-bundled-data-v1') !== null, true, 'order: bundled copy still there');
}
{ // never frees settings, backups, themes, language packs
	const s = fake(1000);
	['customlauncher-config-v1', 'hearth-prefs-backup-v1', 'hearth-theme-v1', 'hearth-langpack-v1', 'hearth-config-rescue-v1'].forEach((k) => fill(s, k, 150));
	const r = g.writeWithRoom(s, 'customlauncher-config-v1', 'z'.repeat(900));
	eq(r.ok, false, 'protected: save fails when nothing may be freed');
	eq(['hearth-prefs-backup-v1', 'hearth-theme-v1', 'hearth-langpack-v1', 'hearth-config-rescue-v1'].every((k) => s.getItem(k) !== null), true, 'protected: nothing else removed');
	eq(s.getItem('customlauncher-config-v1').length, 150, 'protected: old value still stored after the failed write');
}
{ const s = fake(10000); fill(s, 'hearth-mono-v3', 3000); fill(s, 'customlauncher-config-v1', 100); fill(s, 'hearth-bundled-data-v1', 2000);
	const rep = g.storeReport(s); eq(rep.length, 2, 'report: two lines'); eq(rep[0].indexOf('3 keys') !== -1, true, 'report: key count'); eq(rep[1].indexOf('mono:3k') !== -1, true, 'report: largest key first, short name'); }
// storage.ts: saveConfig / loadConfig with a fake global localStorage
const ls = fake(3000); globalThis.localStorage = ls;
await build({entryPoints: [new URL('../src/lib/storage.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out('s'), platform: 'node', logLevel: 'error', define: {__LEGACY__: 'false', __WEATHER__: 'true'}});
const st = await import(out('s'));
fill(ls, 'hearth-mono-v3', 2900);
const cfg = {...st.DEFAULT_CONFIG};
let told = 0; st.setSaveFailHandler(() => { told++; });
eq(st.saveConfig(cfg), true, 'saveConfig frees mono and stores');
eq(ls.getItem('hearth-mono-v3'), null, 'saveConfig: mono freed');
eq(st.saveConfigVerified(cfg), true, 'saveConfigVerified reads back');
{ const tiny = fake(50); globalThis.localStorage = tiny; eq(st.saveConfig(cfg), false, 'saveConfig false when it cannot fit'); eq(told, 1, 'fail handler called'); st.saveConfig(cfg); eq(told, 1, 'fail handler only once per page'); eq(st.saveConfigVerified(cfg), false, 'verified false when it cannot fit'); }
{ const s2 = fake(100000); globalThis.localStorage = s2; s2.setItem('customlauncher-config-v1', '{not json'); const c = st.loadConfig(); eq(c.defaultsV, st.DEFAULT_CONFIG.defaultsV, 'loadConfig: defaults on a broken value'); eq(s2.getItem('hearth-config-rescue-v1'), '{not json', 'loadConfig: raw copy kept'); s2.setItem('customlauncher-config-v1', '{still bad'); st.loadConfig(); eq(s2.getItem('hearth-config-rescue-v1'), '{not json', 'loadConfig: first rescue copy is not overwritten'); }
process.exit(fail ? 1 : 0);
