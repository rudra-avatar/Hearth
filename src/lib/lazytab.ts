import type {SettingsTab} from '../screens/Settings';

type Builders = {options?: () => SettingsTab['options']; items?: () => SettingsTab['items']; shown?: () => SettingsTab['shown']};

/** L1b: a Settings tab whose rows or tiles are built the first time they are read (only the tab on screen is read), not each
 *  time the tab list is rebuilt. Plain enumerable getters, so a spread of the tab still works. */
export function lazyTab (base: SettingsTab, build: Builders): SettingsTab {
	(Object.keys(build) as (keyof Builders)[]).forEach((name) => {
		const make = build[name] as () => any;
		let cache: any;
		let done = false;
		Object.defineProperty(base, name, {enumerable: true, configurable: true, get: () => { if (!done) { cache = make(); done = true; } return cache; }});
	});
	return base;
}
