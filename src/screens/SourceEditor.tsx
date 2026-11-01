import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {SourceGlyph} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {APP_ICON_IDS, appIconLabel, appIconUrl, isAppIcon} from '../config/appicons';
import {iconLabel, iconPath, MAX_SOURCE_NAME, SOURCE_ICON_IDS, suggestedNames, type SourceEdit} from '../lib/sourceicons';
import {t as tt} from '../i18n';

interface Props {
	/** the name and icon the TV gives this source */
	base: {label: string; icon: string; /** an app's own artwork, shown while no icon is chosen */ image?: string};
	/** a TV source, or an app of the home row */
	kind?: 'source' | 'app';
	/** what the user has set (empty: the TV's) */
	edit: SourceEdit;
	onChange: (patch: SourceEdit) => void;
	/** open the file browser for a picture (needs the Homebrew Channel) */
	onBrowse: () => void;
	/** the file browser can work on this TV */
	canBrowse: boolean;
	onClose: () => void;
}

/** Rename a source and pick its icon. The name can be typed (the TV's on-screen keyboard) or stepped through a list of
 *  suggestions with ← →; the icon is stepped with ← → or OK. Changes show on the home row at once. */
export function SourceEditor ({base, kind = 'source', edit, onChange, onBrowse, canBrowse, onClose}: Props) {
	// starts on a row that does nothing: the OK that opened this screen may still be held down
	const [index, setIndex] = useState(0);
	const [typing, setTyping] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const name = edit.label || base.label;
	const icon = edit.icon || base.icon;
	const own = kind === 'app' ? tt('sourceeditor.theAppS') : tt('sourceeditor.theTvS');

	useEffect(() => { if (typing && input.current) input.current.focus(); }, [typing]);

	const step = (list: readonly string[], current: string, dir: number): string => {
		const at = list.indexOf(current);
		return list[(at === -1 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length)];
	};
	// suggestions are source names (PlayStation, Xbox...): only offered for sources; apps are typed
	const stepName = (dir: number) => { if (kind === 'source') onChange({label: step(suggestedNames(), name, dir)}); };
	// apps choose among the app icons shipped with Hearth ('' = the app's own); sources among the drawn icons
	const iconList: readonly string[] = kind === 'app' ? [''].concat(APP_ICON_IDS) : SOURCE_ICON_IDS;
	const stepIcon = (dir: number) => onChange({icon: step(iconList, icon, dir), iconData: ''});

	const handleKey = useCallback((key: NavKey, event?: KeyboardEvent): boolean => {
		if (key === 'back') { onClose(); return true; }
		if (key === 'enter' && event && event.repeat) return true;   // OK held: not a press
		if (key === 'up') setIndex((i) => (i === 0 ? 0 : clamp(i - 1, 1, 5)));
		else if (key === 'down') setIndex((i) => clamp(i + 1, 0, 5));
		else if (key === 'left' || key === 'right') {
			const dir = key === 'left' ? -1 : 1;
			if (index === 1) stepName(dir); else if (index === 2) stepIcon(dir);
		} else if (key === 'enter') {
			if (index === 0) return true;
			if (index === 1) setTyping(true);
			else if (index === 2) stepIcon(1);
			else if (index === 3) onBrowse();
			else if (index === 4) onChange({label: '', icon: '', iconData: ''});
			else onClose();
		}
		return true;
	}, [index, name, icon, onChange, onClose]);

	useKeys(handleKey, !typing);

	const onFieldKey = (e: KeyboardEvent) => {
		if (e.keyCode === 13) { e.preventDefault(); onChange({label: (e.target as HTMLInputElement).value}); setTyping(false); }
		else if (e.keyCode === 461 || e.keyCode === 27) { e.preventDefault(); setTyping(false); }
	};

	const iconDetail = edit.iconData ? tt('sourceeditor.yourPicture') : edit.icon ? (isAppIcon(edit.icon) ? appIconLabel(edit.icon) : iconLabel(edit.icon)) : (kind === 'app' ? tt('sourceeditor.theAppSOwnIcon') : iconLabel(icon) + tt('sourceeditor.ownIcon', {own}));
	const shownImage = edit.iconData || (isAppIcon(icon) ? appIconUrl(icon) : '') || (!icon && base.image) || '';
	const rows = [
		{label: tt('sourceeditor.releaseOkThenPress'), detail: tt('sourceeditor.editing', {label: base.label}), hint: ''},
		{label: tt('sourceeditor.name'), detail: name + (edit.label ? '' : tt('sourceeditor.ownName', {own})), hint: kind === 'source' ? tt('sourceeditor.stepThroughSuggestionsOk') : tt('sourceeditor.okTypesAName')},
		{label: tt('sourceeditor.icon'), detail: iconDetail, hint: tt('sourceeditor.orOkToChange')},
		{label: tt('sourceeditor.useAPictureFrom'), detail: canBrowse ? tt('sourceeditor.aSquarePictureWorks') : tt('sourceeditor.needsTheHomebrewChannel'), hint: ''},
		{label: tt('sourceeditor.useNameAndIcon', {own}), detail: '', hint: ''},
		{label: tt('sourceeditor.done'), detail: '', hint: ''}
	];

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('sourceeditor.editNameAmpIcon')}</h1>
				<p class="settings__hint">{typing ? 'Type a name, then press OK or Enter · Back cancels' : tt('sourceeditor.okOrBackWhenYou')}</p>
				<div class="picker">
					{rows.map((row, i) => (
						<div
							key={row.label}
							class={`picker__row${i === index && i > 0 ? ' picker__row--focused' : ''}${i === 0 ? ' picker__row--info' : ''}`}
							onMouseEnter={() => { if (!typing && i > 0) setIndex(i); }}
						>
							{i === 2 && shownImage ? <img class="picker__icon" src={shownImage} alt="" /> : kind === 'source' && (i === 1 || i === 2) ? <SourceGlyph path={iconPath(icon || 'input')} cls="picker__icon" /> : <span class="picker__icon" />}
							<div class="picker__text">
								<div class="picker__label">{row.label}</div>
								{i === 1 && typing
									? <input ref={input} class="picker__input" type="text" defaultValue={edit.label || ''} placeholder={name} maxLength={MAX_SOURCE_NAME} onKeyDown={onFieldKey} />
									: row.detail && <div class="picker__detail">{row.detail}{i === index && row.hint ? '   ·   ' + row.hint : ''}</div>}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
