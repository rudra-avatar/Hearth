import {Component} from 'preact';
import {CheckMark, Glyph, SourceGlyph, type GlyphName} from './Glyph';
import {iconPath} from '../lib/sourceicons';

/** Everything a tile needs to draw itself; rows and grids build these from app/input data. */
export interface TileModel {
	key: string;
	label: string;
	/** full-bleed artwork (app icons) */
	imageUrl?: string;
	/** LG's grey line-art input icons, drawn smaller and lightened */
	glyphImageUrl?: string;
	/** a source's icon (an id from lib/sourceicons.ts) */
	sourceIcon?: string;
	/** built-in vector icon */
	glyph?: GlyphName;
	/** monogram background when there is no artwork */
	color?: string;
	/** an input with nothing plugged in: drawn greyed out */
	disconnected?: boolean;
	/** a small second line under the name (e.g. "Not connected", or the connected device's name) */
	note?: string;
}

interface Props {
	model: TileModel;
	focused: boolean;
	/** picked up in re-order mode */
	lifted?: boolean;
	/** shown with a tick badge (settings picker) */
	checked?: boolean;
	/** greyed out (settings picker: not on the home screen) */
	dimmed?: boolean;
	onHover?: () => void;
	onActivate?: () => void;
}

/** A class so a tile can skip its redraw: moving the highlight changes two tiles, not all of them. The handlers are
 *  read from the latest props when they run, so skipping a redraw never leaves an old closure behind. */
export class Tile extends Component<Props> {
	shouldComponentUpdate (next: Props): boolean {
		const a = this.props.model;
		const b = next.model;
		return this.props.focused !== next.focused || this.props.lifted !== next.lifted || this.props.checked !== next.checked || this.props.dimmed !== next.dimmed ||
			a !== b && (a.key !== b.key || a.label !== b.label || a.imageUrl !== b.imageUrl || a.glyphImageUrl !== b.glyphImageUrl || a.sourceIcon !== b.sourceIcon || a.glyph !== b.glyph || a.color !== b.color ||
				a.disconnected !== b.disconnected || a.note !== b.note);
	}

	private hover = () => { if (this.props.onHover) this.props.onHover(); };
	private activate = () => { if (this.props.onActivate) this.props.onActivate(); };

	render () {
		const {model, focused, lifted, checked, dimmed} = this.props;
		const classes = ['tile', focused && 'tile--focused', lifted && 'tile--lifted', (dimmed || model.disconnected) && 'tile--dimmed', model.note && 'tile--noted'].filter(Boolean).join(' ');
		return (
			<div class={classes} onMouseEnter={this.hover} onClick={this.activate}>
				<div class="tile__frame">
				<div class="tile__box" style={model.color && !model.imageUrl ? {background: model.color} : undefined}>
					{model.imageUrl
						? <img class="tile__image" src={model.imageUrl} alt="" />
						: model.sourceIcon
							? <SourceGlyph path={iconPath(model.sourceIcon)} />
						: model.glyphImageUrl
							? <img class="tile__image tile__image--glyph" src={model.glyphImageUrl} alt="" />
							: model.glyph
								? <Glyph name={model.glyph} />
								: <div class="tile__monogram">{model.label.charAt(0).toUpperCase()}</div>}
					{checked && <div class="tile__badge"><CheckMark /></div>}
				</div>
				<div class="tile__ring" />
				</div>
				<div class="tile__label">{model.label}{model.note && <span class="tile__note">{model.note}</span>}</div>
			</div>
		);
	}
}
