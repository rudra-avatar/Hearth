import {BUILTIN_WALLPAPERS} from '../lib/builtinwallpapers';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {whySuffix} from '../lib/failure';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useLanguage} from '../hooks/useLanguage';
import {
	baseName, INTERNAL_ROOT, joinPath, listDir, listRoots, parentPath,
	type DirEntry, type StorageRoot
} from '../lib/wallpaper';

/** What the user picked. */
export type WallpaperChoice =
	| {mode: 'gradient'}
	| {mode: 'image'; path: string}
	| {mode: 'folder'; path: string}
	| {mode: 'builtin'; path: string};

interface Props {
	onChoose: (choice: WallpaperChoice) => void;
	onClose: () => void;
}

type RowKind = 'gradient' | 'builtin' | 'root' | 'folder' | 'picture' | 'slideshow' | 'info' | 'retry';

interface PickerRow {
	key: string;
	kind: RowKind;
	label: string;
	detail?: string;
	path?: string;
}

const VISIBLE_ROWS = 9;

const HINT_KEYS = {
	roots: 'picker.hint.roots',
	folder: 'picker.hint.folder'
} as const;

/** Long paths keep their end (the current folder) and lose the start. */
function shortPath (path: string): string {
	return path.length > 90 ? `…${path.slice(path.length - 89)}` : path;
}

function pictureCount (entries: DirEntry[]): number {
	return entries.filter((e) => !e.isDir).length;
}

function buildRows (t: (key: string, params?: Record<string, string | number>) => string, path: string | null, roots: StorageRoot[], entries: DirEntry[], failed: boolean): PickerRow[] {
	if (failed) {
		const rows: PickerRow[] = [{key: 'retry', kind: 'retry', label: t('common.retry'), detail: t('picker.readStorageAgain')}];
		if (path === null) rows.unshift({key: 'gradient', kind: 'gradient', label: t('picker.defaultBackground'), detail: t('picker.defaultBackgroundDetail')});
		return rows;
	}
	if (path === null) {
		const rows: PickerRow[] = [{key: 'gradient', kind: 'gradient', label: t('picker.defaultBackground'), detail: t('picker.defaultBackgroundDetail')}];
		BUILTIN_WALLPAPERS.forEach((w) => rows.push({key: `builtin:${w.id}`, kind: 'builtin', label: t(w.label), detail: t('picker.builtin', {detail: t(w.detail)}), path: w.id}));
		roots.forEach((r) => rows.push({key: `root:${r.path}`, kind: 'root', label: r.label, detail: r.path, path: r.path}));
		if (!roots.some((r) => r.path !== INTERNAL_ROOT.path)) {
			rows.push({key: 'no-usb', kind: 'info', label: t('picker.noUsb'), detail: t('picker.noUsbDetail')});
		}
		return rows;
	}
	const rows: PickerRow[] = [];
	const count = pictureCount(entries);
	if (count > 0) {
		rows.push({
			key: 'slideshow', kind: 'slideshow', label: t('picker.slideshow'),
			detail: t(count === 1 ? 'picker.slideshowDetailOne' : 'picker.slideshowDetailMany', {count, name: baseName(path)})
		});
	}
	entries.forEach((e) => rows.push({
		key: `${e.isDir ? 'dir' : 'pic'}:${e.name}`,
		kind: e.isDir ? 'folder' : 'picture',
		label: e.name,
		path: joinPath(path, e.name)
	}));
	if (!rows.length) rows.push({key: 'empty', kind: 'info', label: t('picker.nothingHere'), detail: t('picker.nothingHereDetail')});
	return rows;
}

/** Folder browser for choosing a wallpaper picture or a slideshow folder.
 *  Top level: the default gradient, USB drives, internal storage. Inside a folder: sub-folders,
 *  pictures, and (when it has pictures) a row that plays the whole folder as a slideshow. */
export function Picker ({onChoose, onClose}: Props) {
	const {t} = useLanguage();
	const [roots, setRoots] = useState<StorageRoot[]>([]);
	const [path, setPath] = useState<string | null>(null);
	const [entries, setEntries] = useState<DirEntry[]>([]);
	const [index, setIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [attempt, setAttempt] = useState(0);
	const remembered = useRef<Record<string, number>>({});

	const rows = buildRows(t, path, roots, entries, !loading && error !== '');
	const pathKey = path === null ? '' : path;

	// Roots load once; a folder's contents load whenever the path changes.
	useEffect(() => {
		let cancelled = false;
		if (path === null) {
			setLoading(true);
			setError('');
			listRoots().then(
				(r) => { if (!cancelled) { setRoots(r); setLoading(false); } },
				() => { if (!cancelled) { setRoots([]); setError(t('picker.couldntReadRoots') + (whySuffix() || '')); setLoading(false); } }
			);
		} else {
			setLoading(true);
			setError('');
			listDir(path).then(
				(list) => { if (!cancelled) { setEntries(list); setLoading(false); } },
				() => { if (!cancelled) { setEntries([]); setError(t('picker.couldntReadFolder') + (whySuffix() || '')); setLoading(false); } }
			);
		}
		return () => { cancelled = true; };
	}, [path, attempt]);

	const goTo = (next: string | null, restoreIndex: number) => {
		remembered.current[pathKey] = index;
		setEntries([]);
		setIndex(restoreIndex);
		setPath(next);
	};

	const goUp = () => {
		if (path === null) { onClose(); return; }
		const atRoot = roots.some((r) => r.path === path);
		const target = atRoot ? null : parentPath(path);
		const restore = remembered.current[target === null ? '' : target] || 0;
		remembered.current[pathKey] = 0;
		setEntries([]);
		setIndex(restore);
		setPath(target);
	};

	const activate = (i: number) => {
		const row = rows[i];
		if (!row || loading) return;
		switch (row.kind) {
			case 'gradient': onChoose({mode: 'gradient'}); break;
			case 'builtin': if (row.path) onChoose({mode: 'builtin', path: row.path}); break;
			case 'retry': setIndex(0); setAttempt((n) => n + 1); break;
			case 'root':
			case 'folder': if (row.path) goTo(row.path, 0); break;
			case 'picture': if (row.path) onChoose({mode: 'image', path: row.path}); break;
			case 'slideshow': if (path) onChoose({mode: 'folder', path}); break;
			default: break;
		}
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, Math.max(0, rows.length - 1))); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, Math.max(0, rows.length - 1))); break;
			case 'enter': activate(index); break;
			case 'back': goUp(); break;
			default: break;
		}
		return true;
	}, [rows.length, index, path, roots, loading, entries]);

	useKeys(handleKey, true);

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);
	const iconFor = (row: PickerRow) => row.kind === 'gradient' ? 'default' : row.kind === 'builtin' ? 'picture' : row.kind === 'retry' ? 'info' : row.kind === 'root' ? (row.path === INTERNAL_ROOT.path ? 'folder' : 'drive') : row.kind;

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{t('picker.title')}</h1>
				<p class="settings__hint">{path === null ? t(HINT_KEYS.roots) : t(HINT_KEYS.folder)}</p>
				<div class="picker__path">{path === null ? t('picker.path.locations') : shortPath(path)}</div>
				<div class="picker">
					{loading && <div class="picker__status">{t('common.loading')}</div>}
					{!loading && error && <div class="picker__status picker__status--error">{error}</div>}
					{!loading && visible.map((row, n) => {
						const i = start + n;
						return (
							<div
								key={row.key}
								class={`picker__row${i === index ? ' picker__row--focused' : ''}${row.kind === 'info' ? ' picker__row--info' : ''}`}
								onMouseEnter={() => setIndex(i)}
								onClick={() => { setIndex(i); activate(i); }}
							>
								<PickerIcon kind={iconFor(row)} />
								<div class="picker__text">
									<div class="picker__label">{row.label}</div>
									{row.detail && <div class="picker__detail">{row.detail}</div>}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
