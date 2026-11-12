// Build-time switches. The weather widget can be left out of a build (HEARTH_WEATHER=0 npm run build): its code is
// then removed from the bundle, not just hidden.

declare const __WEATHER__: boolean | undefined;

export const WEATHER_ENABLED: boolean = typeof __WEATHER__ === 'undefined' ? true : __WEATHER__;

/** The "Tests" tab (what a TV allows a web app to do) is in every build; Settings shows it with the Debug tab (Options → Show the Debug tab). */
export const PROBE_ENABLED = true;

declare const __LEGACY__: boolean | undefined;

/** True only in the bundle for Chromium 38 (webOS 3.x; scripts/legacy.mjs): custom properties are emulated (lib/cssvars.ts). */
export const LEGACY: boolean = typeof __LEGACY__ === 'undefined' ? false : __LEGACY__;

declare const __NOROOT__: boolean | undefined;

/** TEST BUILD ONLY (HEARTH_NOROOT=1): every root (Homebrew Channel) call fails at once without being made, to mock a non-root TV. */
export const NOROOT_MOCK: boolean = typeof __NOROOT__ === 'undefined' ? false : __NOROOT__;

declare const __PLEX__: boolean | undefined;

/** The Plex shelves (Continue watching, Recently added) and their Settings tab. A build without them: HEARTH_PLEX=0 npm run build. */
export const PLEX_ENABLED: boolean = typeof __PLEX__ === 'undefined' ? true : __PLEX__;
