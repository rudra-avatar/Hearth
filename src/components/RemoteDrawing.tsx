import type {DrawButton, DrawLayout} from '../lib/remotedraw';
import {t as tt} from '../i18n';

interface Props {
	layout: DrawLayout;
	/** the code of the row in focus (0: none): that button is outlined and filled white */
	focusCode: number;
	/** codes Hearth already gave a job: thin ring */
	mappedCodes: number[];
}

function size (b: DrawButton): number {
	return Math.max(7, Math.min(b.h * 0.45, (b.w * 1.3) / Math.max(3, b.t.length), 20));
}

function shape (b: DrawButton, extra: number) {
	const w = b.w + extra * 2;
	const h = b.h + extra * 2;
	if (b.s === 'c') return <ellipse cx={b.x} cy={b.y} rx={w / 2} ry={h / 2} />;
	const r = b.s === 'p' ? h / 2 : Math.min(8 + extra, h / 2);
	return <rect x={b.x - w / 2} y={b.y - h / 2} width={w} height={h} rx={r} ry={r} />;
}

/** A static SVG (P61c): drawn only on the two Remote control pages, only classes change with focus. */
export function RemoteDrawing ({layout, focusCode, mappedCodes}: Props) {
	const {body} = layout;
	const pad = 10;
	return (
		<svg class="remote-draw" viewBox={`${body.x - pad} ${body.y - pad} ${body.w + pad * 2} ${body.h + pad * 2}`} aria-hidden="true">
			<rect class="remote-draw__body" x={body.x} y={body.y} width={body.w} height={body.h} rx={body.r} ry={body.r} />
			{layout.buttons.map((b) => {
				const focused = !!b.code && b.code === focusCode;
				const cls = 'remote-draw__key' + (b.white ? ' remote-draw__key--white' : '') + (focused ? ' remote-draw__key--focus' : '');
				return (
					<g key={b.id} class={cls}>
						<g class="remote-draw__shape" style={b.color ? {fill: b.color} : undefined}>{shape(b, 0)}</g>
						{b.t && <text class="remote-draw__text" x={b.x} y={b.y + size(b) * 0.35} style={{fontSize: `${size(b)}px`}}>{b.t}</text>}
						{b.code && mappedCodes.indexOf(b.code) !== -1 && !focused ? <g class="remote-draw__mapped">{shape(b, 4)}</g> : null}
						{focused ? <g class="remote-draw__ring">{shape(b, 6)}</g> : null}
					</g>
				);
			})}
			<text class="remote-draw__name" x={body.x + body.w / 2} y={body.y + body.h - 22}>{layout.model === 'ir' ? tt('remotedrawing.lgAkb30085202') : ''}</text>
		</svg>
	);
}
