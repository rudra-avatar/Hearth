import {WALLPAPER} from '../config/constants';
import {exec} from '../lib/apps';
import {MAKE_FOLDER_COMMAND, THEME_FOLDER} from '../lib/themecmd';
import {LANGUAGE_FOLDER, MAKE_LANGUAGE_FOLDER} from '../lib/langpack';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {failureText, whySuffix} from '../lib/failure';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {t as tt} from '../i18n';
import {
	baseName, ensureUserFolders, INTERNAL_ROOT, joinPath, listDir, listRoots, parentPath, SAVER_FOLDER, WALLPAPER_FOLDER,
	type DirEntry, type StorageRoot
} from '../lib/wallpaper';

/** What the user picked. */
export type WallpaperChoice =
	| {mode: 'gradient'}
	| {mode: 'image'; path: string}
	| {mode: 'folder'; path: string; recursive?: boolean}
	| {mode: 'photos'};

interface Props {
	/** choosing one picture for a source's icon: no default-background or slideshow rows */
	forIcon?: boolean;
	/** choosing the screen saver's pictures: GIFs are listed, the first row follows the wallpaper, then the built-in photos and video */
	forSaver?: boolean;
	/** choosing the screen saver's pictures: the built-in video row was picked */
	onBuiltinVideo?: () => void;
	/** choosing a theme (.zip file, any folder or drive): the path was picked; the promise ends when loading is over */
	forTheme?: boolean;
	onTheme?: (path: string) => Promise<void>;
	/** T2b: choosing a language file (.json, any folder or drive); the path was picked; the promise ends when loading is over */
	forLanguage?: boolean;
	onLanguage?: (path: string) => Promise<void>;
	onChoose: (choice: WallpaperChoice) => void;
	onClose: () => void;
}

type RowKind = 'theme' | 'gradient' | 'photos' | 'video' | 'root' | 'folder' | 'picture' | 'slideshow' | 'info' | 'retry';

interface PickerRow {
	key: string;
	kind: RowKind;
	label: string;
	detail?: string;
	path?: string;
	/** the slideshow row that also takes the sub-folders */
	deep?: boolean;
}

const VISIBLE_ROWS = 9;
const themesFolderRow = (): StorageRoot => ({label: tt('picker.themesFolder'), path: THEME_FOLDER});       // read when the picker opens, so the language in use counts (T2b)
const languagesFolderRow = (): StorageRoot => ({label: tt('picker.languagesFolder'), path: LANGUAGE_FOLDER});
const JSON_FILE = /\.json$/i;

const HINTS = {
	get roots () { return tt('picker.pickWhereYourPicturesAre'); },
	get folder () { return tt('picker.okOpensAFolderOr'); }
};

/** Advice shown at the top level of the wallpaper picker (not in the icon picker): a warning, then how to copy files. */
const MB = 1048576;
/** First line is the title. Kept in capitals on purpose (user, P29a). */
const SAVER_WARNING = (): string[] => [
	tt('picker.warningHighPowerConsumption'),
	tt('picker.animatedGifsVideosAndFast'),
	tt('picker.forTheLowestPowerUse'),
	tt('picker.putYourOwnPicturesGifs')
];

const THEME_WARNING = (): string[] => [
	tt('picker.aThemeIsAZip'),
	tt('picker.veryHeavyFontsOrIcons')
];
const THEME_HOWTO = (): string[] => [
	tt('picker.putThemeFilesInMedia'),
	tt('picker.overSshFromAComputer'),
	tt('picker.withWebosDevManagerConnect'),
	tt('picker.tvAddressIsTheIp')
];

const WALLPAPER_WARNING = (): string[] => [
	tt('picker.recommendedSize1920x1080AGood'),
	tt('picker.bigPicturesSlowDownThe'),
	tt('picker.hardLimitMbMbAnd', {mb: Math.round(WALLPAPER.maxBytes / MB), mp: WALLPAPER.maxPixels / 1000000})
];
const WALLPAPER_HOWTO = (): string[] => [
	tt('picker.toUseYourOwnPictures'),
	tt('picker.overSshFromAComputer'),
	tt('picker.withWebosDevManagerConnect'),
	tt('picker.tvAddressIsTheIp')
];

/** Long paths keep their end (the current folder) and lose the start. */
function shortPath (path: string): string {
	return path.length > 90 ? `…${path.slice(path.length - 89)}` : path;
}

function pictureCount (entries: DirEntry[]): number {
	return entries.filter((e) => !e.isDir).length;
}

function buildRows (path: string | null, roots: StorageRoot[], entries: DirEntry[], failed: boolean, saver = false, userFolder: StorageRoot | null = null, theme = false, language = false): PickerRow[] {
	const first: PickerRow = saver
		? {key: 'gradient', kind: 'gradient', label: tt('picker.sameAsTheWallpaper'), detail: tt('picker.theScreenSaverFollows')}
		: {key: 'gradient', kind: 'gradient', label: tt('picker.builtInBackground'), detail: tt('picker.noPictureChangeWhich')};
	const top = (): PickerRow[] => theme ? [] : saver ? [first,
		{key: 'photos', kind: 'photos', label: tt('picker.photosSlideshowBuiltIn'), detail: tt('picker.the25PhotosThat')},
		{key: 'video', kind: 'video', label: tt('picker.builtInVideoScreen'), detail: tt('picker.aVideoThatComes')}
	] : [first, {key: 'photos', kind: 'photos', label: tt('picker.photosSlideshow'), detail: tt('picker.the25PhotosThat2')}];
	if (failed) {
		const rows: PickerRow[] = [{key: 'retry', kind: 'retry', label: tt('picker.tryAgain'), detail: tt('picker.readTheStorageAgain')}];
		if (path === null) rows.unshift(...top());
		return rows;
	}
	if (path === null) {
		const rows: PickerRow[] = top();
		if (userFolder) rows.push({key: `root:${userFolder.path}`, kind: 'root', label: userFolder.label, detail: tt('picker.putYourOwn', {path: userFolder.path, what: language ? tt('picker.themeFiles2') : theme ? tt('picker.themeFiles') : saver ? tt('picker.picturesAndVideos') : tt('picker.pictures')}), path: userFolder.path});
		roots.forEach((r) => rows.push({key: `root:${r.path}`, kind: 'root', label: r.label, detail: r.path, path: r.path}));
		if (!roots.some((r) => r.path !== INTERNAL_ROOT.path)) {
			rows.push({key: 'no-usb', kind: 'info', label: tt('picker.noUsbDriveFound'), detail: tt('picker.plugOneInThen')});
		}
		return rows;
	}
	const rows: PickerRow[] = [];
	const count = pictureCount(entries);
	if (count > 0 && !theme) {
		rows.push({
			key: 'slideshow', kind: 'slideshow', label: saver ? tt('picker.useThisFolderFor') : tt('picker.playThisFolderAs'),
			detail: (count === 1 ? tt('picker.onePictureIn', {name: baseName(path)}) : tt('picker.picturesIn', {count, name: baseName(path)}))
		});
	}
	// a folder that has folders inside it: one more row that also takes everything in them (all levels)
	if (entries.some((e) => e.isDir) && !theme) {
		rows.push({
			key: 'slideshow-deep', kind: 'slideshow', deep: true,
			label: saver ? tt('picker.useThisFolderAnd') : tt('picker.playThisFolderAnd'),
			detail: tt('picker.everyPictureInAnd', {baseName: baseName(path)})
		});
	}
	entries.forEach((e) => rows.push({
		key: `${e.isDir ? 'dir' : 'pic'}:${e.name}`,
		kind: e.isDir ? 'folder' : theme ? 'theme' : 'picture',
		label: e.name,
		path: joinPath(path, e.name)
	}));
	if (!rows.length) rows.push({key: 'empty', kind: 'info', label: tt('picker.nothingHere'), detail: language ? tt('picker.thisFolderHasNoLanguage') : theme ? tt('picker.thisFolderHasNo') : tt('picker.thisFolderHasNo2')});
	return rows;
}

/** Folder browser for choosing a wallpaper picture or a slideshow folder.
 *  Top level: the default gradient, USB drives, internal storage. Inside a folder: sub-folders,
 *  pictures, and (when it has pictures) a row that plays the whole folder as a slideshow. */
export function Picker ({forIcon, forSaver, forTheme, onTheme, forLanguage, onLanguage, onBuiltinVideo, onChoose, onClose}: Props) {
	const [roots, setRoots] = useState<StorageRoot[]>([]);
	const [path, setPath] = useState<string | null>(null);
	const [entries, setEntries] = useState<DirEntry[]>([]);
	const [index, setIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [attempt, setAttempt] = useState(0);
	const [busy, setBusy] = useState(false);
	const remembered = useRef<Record<string, number>>({});

	const rows = buildRows(path, roots, entries, !loading && error !== '', !!forSaver, forIcon ? null : forLanguage ? languagesFolderRow() : forTheme ? themesFolderRow() : forSaver ? SAVER_FOLDER : WALLPAPER_FOLDER, !!forTheme || !!forLanguage, !!forLanguage).filter((r) => !forIcon || (r.kind !== 'gradient' && r.kind !== 'photos' && r.kind !== 'video' && r.kind !== 'slideshow'));
	const pathKey = path === null ? '' : path;

	// The advised folders are made when a picker for wallpaper or saver opens (once ever; a deleted folder stays deleted).
	useEffect(() => { if (forLanguage) exec(MAKE_LANGUAGE_FOLDER, 6000).catch(() => undefined); else if (forTheme) exec(MAKE_FOLDER_COMMAND, 6000).catch(() => undefined); else if (!forIcon) ensureUserFolders(); }, []);

	// Roots load once; a folder's contents load whenever the path changes.
	useEffect(() => {
		let cancelled = false;
		if (path === null) {
			setLoading(true);
			setError('');
			listRoots().then(
				(r) => { if (!cancelled) { setRoots(r); setLoading(false); } },
				(e) => { if (!cancelled) { setRoots([]); setError(failureText(e, tt('picker.readTheStorage'))); setLoading(false); } }
			);
		} else {
			setLoading(true);
			setError('');
			listDir(path, !!forSaver, !!forTheme, forLanguage ? JSON_FILE : undefined).then(
				(list) => { if (!cancelled) { setEntries(list); setLoading(false); } },
				() => { if (!cancelled) { setEntries([]); setError(tt('picker.couldnTReadThisFolder', {v1: whySuffix() || ''})); setLoading(false); } }
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
		if (!row || loading || busy) return;
		switch (row.kind) {
			case 'gradient': onChoose({mode: 'gradient'}); break;
			case 'photos': onChoose({mode: 'photos'}); break;
			case 'video': if (onBuiltinVideo) onBuiltinVideo(); break;
			case 'retry': setIndex(0); setAttempt((n) => n + 1); break;
			case 'root':
			case 'folder': if (row.path) goTo(row.path, 0); break;
			case 'theme': { const pickFile = forLanguage ? onLanguage : onTheme; if (row.path && pickFile) { setBusy(true); pickFile(row.path).then(() => setBusy(false), () => setBusy(false)); } } break;
			case 'picture': if (row.path) onChoose({mode: 'image', path: row.path}); break;
			case 'slideshow': if (path) onChoose(row.deep ? {mode: 'folder', path, recursive: true} : {mode: 'folder', path}); break;
			default: break;
		}
	};

	const handleKey = useCallback((key: NavKey): boolean => {
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, Math.max(0, rows.length - 1))); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, Math.max(0, rows.length - 1))); break;
			case 'enter': activate(index); break;
			case 'back': if (!busy) goUp(); break;
			default: break;
		}
		return true;
	}, [rows.length, index, path, roots, loading, entries, busy]);

	useKeys(handleKey, true);

	const start = clamp(index - Math.floor(VISIBLE_ROWS / 2), 0, Math.max(0, rows.length - VISIBLE_ROWS));
	const visible = rows.slice(start, start + VISIBLE_ROWS);
	const iconFor = (row: PickerRow) => row.kind === 'gradient' ? 'default' : row.kind === 'photos' || row.kind === 'video' ? 'slideshow' : row.kind === 'retry' ? 'info' : row.kind === 'theme' ? 'app' : row.kind === 'root' ? (row.path === INTERNAL_ROOT.path || row.path === WALLPAPER_FOLDER.path || row.path === SAVER_FOLDER.path || row.path === THEME_FOLDER || row.path === LANGUAGE_FOLDER ? 'folder' : 'drive') : row.kind;

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{forLanguage ? tt('picker.loadALanguage') : forTheme ? tt('picker.loadATheme') : forIcon ? tt('picker.chooseAPictureForThe') : forSaver ? tt('picker.chooseScreenSaverPictures') : tt('picker.chooseWallpaper')}</h1>
				<p class="settings__hint">{busy ? (forLanguage ? tt('picker.loadingTheLanguage') : tt('picker.loadingTheTheme')) : forLanguage ? (path === null ? tt('picker.pickWhereTheLanguage') : tt('picker.okOpensAFolderLanguage')) : forTheme ? (path === null ? tt('picker.pickWhereTheThemeFile') : tt('picker.okOpensAFolderOr')) : path === null ? HINTS.roots : HINTS.folder}</p>
				{path === null && forSaver && (
					<div class="picker__note">
						<div class="picker__note-title">{SAVER_WARNING()[0]}</div>
						<div class="picker__note-para">{SAVER_WARNING().slice(1).map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					</div>
				)}
				{path === null && forTheme && !forLanguage && (
					<div class="picker__note">
						<div class="picker__note-title">{tt('picker.beforeYouChoose')}</div>
						<div class="picker__note-para">{THEME_WARNING().map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
						<div class="picker__note-para">{THEME_HOWTO().map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					</div>
				)}
				{path === null && forLanguage && (
					<div class="picker__note">
						<div class="picker__note-title">{tt('picker.beforeYouChoose')}</div>
						<div class="picker__note-para">{[tt('picker.languageNote1'), tt('picker.languageNote2'), tt('picker.languageNote3')].map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					</div>
				)}
				{path === null && !forIcon && !forSaver && !forTheme && !forLanguage && (
					<div class="picker__note">
						<div class="picker__note-title">{tt('picker.beforeYouChoose2')}</div>
						<div class="picker__note-para">{WALLPAPER_WARNING().map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
						<div class="picker__note-para">{WALLPAPER_HOWTO().map((line) => <div key={line} class="picker__note-line">{line}</div>)}</div>
					</div>
				)}
				<div class="picker__path">{path === null ? tt('picker.locations') : shortPath(path)}</div>
				<div class="picker">
					{loading && <div class="picker__status">{tt('picker.loading')}</div>}
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
