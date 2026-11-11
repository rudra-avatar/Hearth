import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {countries, type Country} from '../lib/cities';
import {searchCities} from '../lib/weathernet';
import {themeCities} from '../lib/theme';
import type {City} from '../lib/weather';
import {t as tt} from '../i18n';

interface Props {
	/** the search may go through the TV's shell when the web view cannot reach the service */
	allowShell: boolean;
	onChoose: (city: City) => void;
	onClose: () => void;
}

interface CityRow {
	key: string;
	kind: 'search' | 'back' | 'city' | 'info' | 'country';
	label: string;
	detail?: string;
	city?: City;
}

const VISIBLE_ROWS = 9;

/** Choose the city for the weather: a short list to pick from, or a search by name (typed with the TV's
 *  on-screen keyboard). OK on a city chooses it; Back goes up. */
export function CityPicker ({allowShell, onChoose, onClose}: Props) {
	const [results, setResults] = useState<City[] | null>(null);       // null: showing the list; otherwise search results
	const [typing, setTyping] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const [index, setIndex] = useState(0);
	const [country, setCountry] = useState<Country | null>(null);   // W3: the country whose cities are shown (null: the country list)
	const countryIndex = useRef(0);                                  // where the country list was left
	const input = useRef<HTMLInputElement>(null);

	const rows: CityRow[] = [];
	if (results === null) {
		if (country === null) rows.push({key: 'search', kind: 'search', label: tt('citypicker.searchForACity'), detail: tt('citypicker.typeItsNameWith')});
		const fromTheme = themeCities();          // P81: the loaded theme's cities are added to the list (first)
		if (country === null) fromTheme.forEach((c) => rows.push({key: 't' + c.name + c.lat, kind: 'city', label: c.name, detail: c.detail, city: c}));
		if (country === null) {
			countries().forEach((c) => rows.push({key: 'k' + c.name, kind: 'country', label: c.name, detail: c.cities.slice(0, 3).map((x) => x.name).join(', ') + (c.cities.length > 3 ? ' …' : '')}));
		} else {
			rows.push({key: 'cback', kind: 'back', label: tt('citypicker.backToTheList')});
			country.cities.filter((p) => !fromTheme.some((t) => t.name === p.name && Math.abs(t.lat - p.lat) < 0.01)).forEach((c) => rows.push({key: c.name + c.lat, kind: 'city', label: c.name, detail: c.detail, city: c}));
		}
	} else {
		rows.push({key: 'search', kind: 'search', label: tt('citypicker.searchAgain')});
		rows.push({key: 'back', kind: 'back', label: tt('citypicker.backToTheList')});
		if (busy) rows.push({key: 'busy', kind: 'info', label: tt('citypicker.searching')});
		else if (failed) rows.push({key: 'failed', kind: 'info', label: tt('citypicker.couldNotSearch'), detail: tt('citypicker.checkTheTvS')});
		else if (results.length === 0) rows.push({key: 'none', kind: 'info', label: tt('citypicker.noMatchingPlaceFound'), detail: tt('citypicker.tryAnotherSpellingOr')});
		results.forEach((c, i) => rows.push({key: 'r' + i, kind: 'city', label: c.name, detail: c.detail, city: c}));
	}

	useEffect(() => { if (typing && input.current) input.current.focus(); }, [typing]);

	const runSearch = (text: string) => {
		setTyping(false);
		if (input.current) input.current.blur();
		if (text.trim().length < 2) return;
		setResults([]);
		setBusy(true);
		setFailed(false);
		setIndex(0);
		searchCities(text, allowShell).then(
			(list) => { setResults(list); setBusy(false); setIndex(list.length ? (results === null ? 2 : 2) : 0); },
			() => { setResults([]); setBusy(false); setFailed(true); }
		);
	};

	const activate = (i: number) => {
		const row = rows[i];
		if (!row) return;
		if (row.kind === 'search') { setIndex(i); setTyping(true); }
		else if (row.kind === 'country') { countryIndex.current = i; setCountry(countries().filter((c) => 'k' + c.name === row.key)[0] || null); setIndex(1); }
		else if (row.kind === 'back' && results === null) { setCountry(null); setIndex(countryIndex.current); }
		else if (row.kind === 'back') { setResults(null); setIndex(0); }
		else if (row.kind === 'city' && row.city) onChoose(row.city);
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, Math.max(0, rows.length - 1))); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, Math.max(0, rows.length - 1))); break;
			case 'enter': activate(index); break;
			case 'back': if (results !== null) { setResults(null); setIndex(0); } else if (country !== null) { setCountry(null); setIndex(countryIndex.current); } else onClose(); break;
			default: break;
		}
		return true;
	}, [rows.length, index, results, busy, failed, country]);

	useKeys(handleKey, !typing);

	// The text field: Enter searches, Back leaves it.
	const onFieldKey = (e: KeyboardEvent) => {
		if (e.keyCode === 13) { e.preventDefault(); runSearch((e.target as HTMLInputElement).value); }
		else if (e.keyCode === 461 || e.keyCode === 27) { e.preventDefault(); setTyping(false); }
	};

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('citypicker.chooseACity')}</h1>
				<p class="settings__hint">{typing ? 'Type a city, then press OK or Enter · Back cancels' : tt('citypicker.okChoosesACityBack')}</p>
				<div class="picker__path">{results !== null ? tt('citypicker.searchResults') : country !== null ? country.name : tt('citypicker.popularCities')}</div>
				<div class="picker">
					{visible.map((row, n) => {
						const i = start + n;
						const editing = typing && row.kind === 'search' && i === index;
						return (
							<div
								key={row.key}
								class={`picker__row${i === index ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}`}
								onMouseEnter={() => { if (!typing) setIndex(i); }}
								onClick={() => { setIndex(i); activate(i); }}
							>
								<PickerIcon kind={row.kind === 'search' ? 'search' : row.kind === 'info' ? 'info' : row.kind === 'back' || row.kind === 'country' ? 'folder' : 'pin'} />
								<div class="picker__text">
									{editing
										? <input ref={input} class="picker__input" type="text" placeholder={tt('citypicker.cityName')} maxLength={60} onKeyDown={onFieldKey} />
										: <div class="picker__label">{row.label}</div>}
									{!editing && row.detail && <div class="picker__detail">{row.detail}</div>}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
