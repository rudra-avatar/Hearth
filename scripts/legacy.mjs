// Recompiles dist/assets/app.js for Chromium 38 (webOS 3.x): Babel lowers the syntax to ES5 and
// core-js adds only the built-ins the bundle actually uses (Array.prototype.find, endsWith, ...).
// Runs after `vite build`; Vite's own esbuild cannot lower ES2015 syntax to ES5.
import {rollup} from 'rollup';
import {babel} from '@rollup/plugin-babel';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const file = 'dist/assets/app.js';
const bundle = await rollup({
	input: file,
	onwarn (warning, warn) { if (warning.code !== 'THIS_IS_UNDEFINED') warn(warning); },
	plugins: [
		babel({
			babelHelpers: 'bundled',
			babelrc: false,
			configFile: false,
			exclude: /node_modules[\/]core-js/,
			presets: [['@babel/preset-env', {
				targets: {chrome: '38'}, useBuiltIns: 'usage', corejs: '3.51', modules: false,
				// `usage` cannot tell `arr.map` from `typedArray.map` or `iterator.map`, so it pulls in
				// every typed-array, iterator-helper and URL polyfill; the app uses none of them.
				exclude: [/^es\.typed-array\./, /^es\.uint8-array\./, /^es\.array-buffer\./, /^es\.iterator\./, /^web\.url/, /^web\.dom-exception\./]
			}]]
		}),
		nodeResolve(),
		commonjs(),
		terser({ecma: 5, safari10: false, format: {comments: false}})
	]
});
await bundle.write({file, format: 'iife', generatedCode: 'es5', inlineDynamicImports: true});
await bundle.close();
console.log(`${file}: recompiled for Chromium 38`);
