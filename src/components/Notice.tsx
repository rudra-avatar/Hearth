import {useCallback, useState} from 'preact/hooks';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';

export interface NoticeButton {
	label: string;
	detail?: string;
	/** a filled button: red (a risky choice) or white */
	tone?: 'danger' | 'light';
	run: () => void;
}

interface Props {
	title: string;
	text: string;
	/** the first button is focused; Back presses the last one */
	buttons: NoticeButton[];
	/** Back does this instead of pressing the last button */
	onBack?: () => void;
}

/** A small pop-up with a message and buttons (a warning, or a yes/no question). */
export function Notice ({title, text, buttons, onBack}: Props) {
	const [index, setIndex] = useState(0);
	const handleKey = useCallback((key: NavKey): boolean => {
		if (key === 'up') setIndex((i) => clamp(i - 1, 0, buttons.length - 1));
		else if (key === 'down') setIndex((i) => clamp(i + 1, 0, buttons.length - 1));
		else if (key === 'back') { if (onBack) onBack(); else buttons[buttons.length - 1].run(); }
		return true;
	}, [buttons, onBack]);
	useKeys(handleKey, true);
	useOkPress({onPress: () => { const b = buttons[index]; if (b) b.run(); }, onLongPress: () => undefined}, true);
	return (
		<div class="screen screen--dialog">
			<div class="dialog">
				<h1 class="dialog__title">{title}</h1>
				<p class="dialog__text">{text}</p>
				{buttons.map((b, i) => (
					<div
						key={b.label}
						class={`picker__row${i === index ? ' picker__row--focused' : ''}${b.tone ? ` picker__row--${b.tone}` : ''}`}
						onMouseEnter={() => setIndex(i)}
						onClick={() => { setIndex(i); b.run(); }}
					>
						<div class="picker__text">
							<div class="picker__label">{b.label}</div>
							{b.detail && <div class="picker__detail">{b.detail}</div>}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
