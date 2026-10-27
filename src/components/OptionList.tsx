import {useEffect, useLayoutEffect, useRef, useState} from 'preact/hooks';
import {LAYOUT} from '../theme/tokens';

export interface OptionItem {
	id: string;
	label: string;
	description: string;
	/** on/off options: shown as a switch */
	value?: boolean;
	/** other options: the current choice, shown as text */
	valueText?: string;
	/** ← → change it; shown with arrows while focused */
	stepper?: boolean;
	/** greyed out: why this can't be used on this TV */
	disabled?: string;
}

interface Props {
	options: OptionItem[];
	focused: boolean;
	selected: number;
	onSelect: (index: number) => void;
	onActivate: (index: number) => void;
}

/** Room kept free below the list, in px. */
const BOTTOM_SPACE = 60;
/** Used when the screen cannot be measured. */
const FALLBACK_HEIGHT = 800;

/** Vertical list of settings. Every row is drawn; the list sits in a window that is as tall as the space
 *  really left on screen (measured, not assumed) and slides so the highlighted row is always in view.
 *  (An earlier version decided from fixed numbers which rows to draw, and on a TV whose web view
 *  measured differently it could show only the first one.) */
export function OptionList ({options, focused, selected, onSelect, onActivate}: Props) {
	const viewRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState(FALLBACK_HEIGHT);
	const [shift, setShift] = useState(0);
	const shiftRef = useRef(0);

	// The window is as tall as the space from the top of the list to the bottom of the screen.
	useLayoutEffect(() => {
		const measure = () => {
			const view = viewRef.current;
			if (!view) return;
			const screenHeight = Math.min(window.innerHeight || LAYOUT.screenHeight, LAYOUT.screenHeight);
			const room = Math.round(screenHeight - view.getBoundingClientRect().top - BOTTOM_SPACE);
			if (room >= 120) setHeight((h) => (h === room ? h : room));
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, []);

	// Slide the list just far enough to keep the highlighted row inside the window, and the rows either side of it
	// too when they fit, so the next row is never cut off at the bottom (or the previous one at the top). The
	// highlighted row itself always stays in view.
	useLayoutEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const index = Math.max(0, Math.min(selected, options.length - 1));
		const row = track.children[index] as HTMLElement | undefined;
		if (!row) return;
		const before = track.children[index - 1] as HTMLElement | undefined;
		const after = track.children[index + 1] as HTMLElement | undefined;
		const top = row.offsetTop - 8;                              // 8: the focus border
		const bottom = row.offsetTop + row.offsetHeight + 8;
		const wantTop = before ? Math.min(top, before.offsetTop - 8) : top;
		const wantBottom = after ? Math.max(bottom, after.offsetTop + after.offsetHeight + 8) : bottom;
		let next = shiftRef.current;
		if (wantTop < next) next = wantTop;
		else if (wantBottom > next + height) next = wantBottom - height;
		next = Math.min(next, top);                                  // never past the highlighted row's top
		next = Math.max(next, bottom - height);                       // nor so far up that its bottom is cut off
		if (next < 0) next = 0;
		if (next !== shiftRef.current) { shiftRef.current = next; setShift(next); }
	}, [selected, options, height]);

	// A different list (another tab) starts at the top.
	const first = options.length ? options[0].id : '';
	useEffect(() => { shiftRef.current = 0; setShift(0); }, [first]);

	return (
		<div class="options" ref={viewRef} style={{height: `${height}px`}}>
			<div class="options__track" ref={trackRef} style={{transform: `translateY(${-shift}px)`}}>
				{options.map((o, i) => (
					<div
						key={o.id}
						class={`option${focused && i === selected ? ' option--focused' : ''}${o.disabled ? ' option--disabled' : ''}`}
						onMouseMove={() => { if (i !== selected) onSelect(i); }}
						onClick={() => onActivate(i)}
					>
						<div class="option__text">
							<div class="option__label">{o.label}</div>
							<div class={o.disabled ? 'option__description option__description--reason' : 'option__description'}>{o.disabled || o.description}</div>
						</div>
						{o.value !== undefined
							? <div class={`switch${o.value ? ' switch--on' : ''}`} role="switch" aria-checked={o.value}>
								<div class="switch__knob" />
							</div>
							: <div class="option__value">
								{o.stepper && <span class="option__chevron">‹</span>}
								<span class="option__value-text">{o.valueText}</span>
								{o.stepper && <span class="option__chevron">›</span>}
							</div>}
					</div>
				))}
			</div>
		</div>
	);
}
