import './i18n/boot';
import {render} from 'preact';
import {App} from './app';
import {loadConfig} from './lib/storage';
import {applyBackground, startEarlyPhoto} from './lib/backgrounds';
import {startEarlyStatic} from './lib/wallpaper';
import {applyTokens, THEMES} from './theme/tokens';
import './theme/global.css';
import globalCss from './theme/global.css?raw';
import {LEGACY, startLegacyVars} from './lib/cssvars';
import {mark} from './lib/perfmarks';
import {earlyStart} from './lib/earlystart';
import {applyFit} from './lib/fitscale';
import {log} from './lib/log';

mark('script started');

if (LEGACY) startLegacyVars(globalCss);       // Chromium 38: custom properties are emulated from the stylesheet source
// #47: window smaller than 1920x1080 (HD sets): scale the layout once, before the first draw; webOS 3 (legacy bundle) is left as it is
if (!LEGACY) { const fit = applyFit(window.innerWidth, window.innerHeight, document.getElementById('root')); if (fit) log(`fit: window ${window.innerWidth}x${window.innerHeight}, scaled to ${Math.round(fit.scale * 100)}%`); }
const startConfig = loadConfig();
applyTokens(startConfig.theme);       // theme first, so there is no flash of the wrong colours
applyBackground(startConfig.background, THEMES[startConfig.theme], startConfig.wallpaper.mode === 'gradient');
startEarlyPhoto(startConfig.background, startConfig.wallpaper.mode);       // first slideshow photo starts loading now (P54)
startEarlyStatic(startConfig.wallpaper.mode, startConfig.wallpaper.path, !!startConfig.wallpaper.recursive, startConfig.wallpaperOpacity);       // saved picture painted by CSS before the first render (P56)
render(<App />, document.getElementById('root')!);
mark('first render');
// P56: the key engine and helper calls start after the first frame is drawn (the TV answers them only from about up=46 s anyway,
// and each ms of our code costs about 30 ms on the TV); retries inside `earlyStart` are unchanged
window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
	mark('first frame drawn');
	window.setTimeout(() => earlyStart(startConfig.replaceHome), 0);
}));
