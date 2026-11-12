import {defineConfig, type Plugin} from 'vite';
import preact from '@preact/preset-vite';

// This fork targets Chrome 53 (webOS 4.x TVs; webOS 6 runs Chrome 79 and newer, which runs it too).
// Two things matter for these engines:
//  1. Module scripts (`<script type="module">`) are refused when loaded from file://
//     because the sandbox serves them with no MIME type, so the bundle must be a
//     classic script.
//  2. Newer syntax (`?.`, `??`, object spread, optional `catch`) is a SyntaxError, so
//     everything (dependencies included) is compiled down to the chrome53 target.
const BROWSER_TARGET = 'chrome53';

// HEARTH_LEGACY=1 builds the bundle for Chromium 38 (webOS 3.x) into dist-legacy/; scripts/legacy.mjs turns it into
// dist/assets/app.legacy.js (ES5 plus polyfills). The page picks the bundle at start (see `classicScriptTag`).
const LEGACY = !!((globalThis as unknown as {process?: {env: Record<string, string | undefined>}}).process || {env: {}}).env.HEARTH_LEGACY;

/** Replaces Vite's module entry tag with a classic loader script that picks the bundle (see below). */
function classicScriptTag (): Plugin {
	return {
		name: 'classic-script-tag',
		enforce: 'post',
		transformIndexHtml (html) {
			// The script tag moves to the end of the body, as a small loader: browsers with custom properties (Chrome 49 and
			// newer, everything from webOS 4 on) get app.js, older ones (webOS 3.x) the ES5 bundle app.legacy.js.
			let entry = './assets/app.js';
			html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>\s*/g, (_all, src: string) => { entry = src; return ''; });
			const legacy = entry.replace(/app\.js$/, 'app.legacy.js');
			const loader = `<script>document.write('<script src="' + (window.CSS && CSS.supports && CSS.supports('--a', '0') ? '${entry}' : '${legacy}') + '"><\\/script>');</script>`;
			return html
				.replace('</body>', loader + '</body>')
				.replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="');
		}
	};
}

// HEARTH_WEATHER=0 builds without the weather widget (the code is removed from the bundle).
const env = (globalThis as unknown as {process?: {env: Record<string, string | undefined>}}).process;
const WEATHER = !(env && env.env.HEARTH_WEATHER === '0');
// HEARTH_PLEX=0 builds without the Plex shelves.
const PLEX = !(env && env.env.HEARTH_PLEX === '0');

export default defineConfig({
	define: {__LEGACY__: JSON.stringify(LEGACY), __WEATHER__: JSON.stringify(WEATHER), __PLEX__: JSON.stringify(PLEX),__NOROOT__: JSON.stringify(!!(env && env.env.HEARTH_NOROOT === '1')), __PROBE__: JSON.stringify(!!(env && env.env.HEARTH_PROBE === '1'))},
	base: './',            // the app is loaded from a local file path on the TV
	plugins: [preact(), classicScriptTag()],
	build: {
		target: LEGACY ? 'es2015' : BROWSER_TARGET,
		outDir: LEGACY ? 'dist-legacy' : 'dist',
		copyPublicDir: !LEGACY,
		modulePreload: false,
		cssTarget: BROWSER_TARGET,
		rollupOptions: {
			output: {
				format: 'iife',
				inlineDynamicImports: true,
				entryFileNames: 'assets/app.js',
				assetFileNames: 'assets/[name][extname]'
			}
		}
	}
});
