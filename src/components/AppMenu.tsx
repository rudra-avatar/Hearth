import {useCallback, useState} from 'preact/hooks';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {t as tt} from '../i18n';

interface Props {
	title: string;
	/** where to get a hidden tile back (differs for apps and inputs) */
	hideDetail: string;
	/** apps have an Uninstall entry; inputs don't */
	showUninstall: boolean;
	/** why Uninstall can't be used, or null when it can */
	blockedReason: string | null;
	/** P102b: whether the tile is a favourite (the entry then reads Remove) */
	isFavourite: boolean;
	onFavourite: () => void;
	/** 2.0.3 T2: starts the home row's move mode with this tile picked up; not given while the row follows the most used apps */
	onReorder?: () => void;
	onHide: () => void;
	onUninstall: () => void;
	/** R10: while the Settings tile is hidden (or being practised) the menu has an entry that opens Hearth Settings; the text is its detail line */
	settingsDetail?: string;
	onSettings?: () => void;
	/** 2.0.2: open straight at the uninstall confirmation (Settings -> Apps -> Uninstall apps); Back then closes */
	startAtConfirm?: boolean;
	onClose: () => void;
}

type Step = 'menu' | 'confirm' | 'working';

interface MenuRow {
	key: string;
	label: string;
	detail?: string;
	disabled?: boolean;
	run: () => void;
}

/** What opens when OK is held on an app or input: reorder the home row, hide it, or (apps) uninstall it.
 *  Uninstall asks for confirmation, and the confirmation starts on Cancel. */
export function AppMenu ({title, hideDetail, showUninstall, blockedReason, isFavourite, onFavourite, onReorder, onHide, onUninstall, onClose, startAtConfirm, settingsDetail, onSettings}: Props) {
	const [step, setStep] = useState<Step>(startAtConfirm ? 'confirm' : 'menu');

	const menuRows = (): MenuRow[] => {
		const rows: MenuRow[] = [
			...(onReorder ? [{key: 'reorder', label: tt('appmenu.reorderRow'), run: onReorder}] : []),
			{key: 'favourite', label: isFavourite ? tt('appmenu.removeFromFavourites') : tt('appmenu.addToFavourites'), detail: isFavourite ? undefined : tt('appmenu.shownAloneOnThe'), run: onFavourite},
			{key: 'hide', label: tt('appmenu.hideFromTheHome'), detail: hideDetail, run: onHide}
		];
		if (showUninstall) {
			rows.push({
				key: 'uninstall', label: tt('appmenu.uninstall'), detail: blockedReason || tt('appmenu.removesTheAppFrom'), disabled: !!blockedReason,
				run: () => { setStep('confirm'); setIndex(0); }
			});
		}
		if (settingsDetail && onSettings) rows.push({key: 'settings', label: tt('appmenu.hearthSettings'), detail: settingsDetail, run: onSettings});
		rows.push({key: 'cancel', label: tt('appmenu.cancel'), run: onClose});
		return rows;
	};
	const firstEnabled = (rows: MenuRow[]): number => {
		const i = rows.findIndex((r) => !r.disabled);
		return i === -1 ? 0 : i;
	};

	const [index, setIndex] = useState(() => (startAtConfirm ? 0 : firstEnabled(menuRows())));
	const rows: MenuRow[] = step === 'menu' ? menuRows() : step === 'confirm' ? [
		{key: 'cancel', label: tt('appmenu.cancel2'), run: onClose},
		{key: 'yes', label: tt('appmenu.uninstall2', {title}), detail: tt('appmenu.thisCannotBeUndone'), run: () => { setStep('working'); onUninstall(); }}
	] : [];

	const handleKey = useCallback((key: NavKey): boolean => {
		if (step === 'working') return true;
		switch (key) {
			case 'up': setIndex((i) => clamp(i - 1, 0, rows.length - 1)); break;
			case 'down': setIndex((i) => clamp(i + 1, 0, rows.length - 1)); break;
			case 'back':
				if (step === 'confirm' && !startAtConfirm) { setStep('menu'); setIndex(firstEnabled(menuRows())); } else onClose();
				break;
			default: break;
		}
		return true;
	}, [step, rows.length, blockedReason, onClose, settingsDetail]);

	useKeys(handleKey, true);
	useOkPress({
		onPress: () => { const row = rows[index]; if (row && !row.disabled) row.run(); },
		onLongPress: () => undefined
	}, step !== 'working');

	return (
		<div class="screen screen--dialog">
			<div class="dialog">
				<h1 class="dialog__title">{step === 'confirm' ? tt('appmenu.uninstallTitle', {title}) : step === 'working' ? tt('appmenu.uninstallingTitle', {title}) : title}</h1>
				{step === 'confirm' && <p class="dialog__text">{tt('appmenu.thisRemovesTheApp')}</p>}
				{step === 'working' && <p class="dialog__text">{tt('appmenu.pleaseWaitThisCan')}</p>}
				{rows.map((row, i) => (
					<div
						key={row.key}
						class={`picker__row${i === index ? ' picker__row--focused' : ''}${row.disabled ? ' picker__row--disabled' : ''}`}
						onMouseEnter={() => setIndex(i)}
						onClick={() => { setIndex(i); if (!row.disabled) row.run(); }}
					>
						<div class="picker__text">
							<div class="picker__label">{row.label}</div>
							{row.detail && <div class="picker__detail">{row.detail}</div>}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
