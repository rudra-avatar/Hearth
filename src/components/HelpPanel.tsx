import type {ComponentChildren} from 'preact';

/** p22c: the help text for the highlighted tab, group or row, in the room right of the option list (same width on every tab).
 *  The outer box has no `top`, so it starts where the option list starts (its static position, just after the tab bar); `left` is the list's width.
 *  p23b: `children` (the home preview) sit under the text box; with no text only the children show. */
export function HelpPanel ({title, body, left, children}: {title: string; body: string; left: string; children?: ComponentChildren}) {
	return (
		<div class="help" style={{left}} aria-hidden="true">
			{body && (
				<div class="help__box">
					<div class="help__title">{title}</div>
					<div class="help__body">{body}</div>
				</div>
			)}
			{children}
		</div>
	);
}
