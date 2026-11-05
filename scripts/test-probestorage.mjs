// Test 44 (src/lib/probestoragecmd.ts): headroom measured on a fake store with a quota; the temporary key is always removed.   Run: npm test
import {build} from 'esbuild';
const out = new URL('../node_modules/.cache-probestorage-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/probestoragecmd.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error'});
const c = await import(out);
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
function fake (quota) {
	const m = new Map();
	const used = () => { let n = 0; m.forEach((v, k) => { n += k.length + v.length; }); return n; };
	return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem (k, v) { const old = m.has(k) ? k.length + m.get(k).length : 0; if (used() - old + k.length + String(v).length > quota) throw new Error('Quota'); m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => Array.from(m.keys())[i] ?? null, get length () { return m.size; }, _m: m };
}
{ const s = fake(5000000); s.setItem('hearth-bundled-data-v1', 'a'.repeat(1130000)); s.setItem('customlauncher-config-v1', 'b'.repeat(20000));
	const r = c.measureHeadroom(s); const left = 5000000 - 1130000 - 20000 - 'hearth-bundled-data-v1'.length - 'customlauncher-config-v1'.length - c.FILL_KEY.length;
	eq(r.hitLimit, true, 'limit found'); eq(r.added <= left && left - r.added <= 10000, true, 'headroom within 10k of the real room (' + r.added + ' vs ' + left + ')'); eq(s.getItem(c.FILL_KEY), null, 'temporary key removed'); eq(s.length, 2, 'other keys untouched');
	const t = c.storageText(s, r); eq(/room left \d+k/.test(t) && t.indexOf('bundled 1130k') !== -1 && t.indexOf('own 0k') !== -1, true, 'text: room, bundled copy, own copy: ' + t.slice(0, 120)); }
{ const s = fake(1e9); const r = c.measureHeadroom(s, 250000, 1000000); eq([r.hitLimit, r.added], [false, 1000000], 'cap reached without a limit'); eq(s.getItem(c.FILL_KEY), null, 'key removed after the cap'); }
{ const s = fake(100); const r = c.measureHeadroom(s); eq([r.added < 100, s.getItem(c.FILL_KEY)], [true, null], 'tiny store: no crash, key removed'); }
{ const s = fake(1e6); s.setItem('customlauncher-wallpaper-data-v1', 'a'.repeat(300000)); s.setItem('hearth-bundled-data-v1', 'a'.repeat(300000)); eq(c.storageText(s, {added: 100000, hitLimit: false}).indexOf('BOTH present') !== -1, true, 'both wallpaper copies are flagged'); }
process.exit(fail ? 1 : 0);
