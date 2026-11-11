import {useEffect, useRef, useState} from 'preact/hooks';
import {PickerIcon} from '../components/Glyph';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {failureText} from '../lib/failure';
import {cleanHost, cleanShare, forgetNetFolder, netReasonText, saveNetFolder, type NetFolder} from '../lib/netfolder';
import {t as tt} from '../i18n';

// Set up, change or forget the network folder (an SMB share on a NAS, a router with a disk or a computer). Reached from the
// file pickers; the text is typed with the TV's on-screen keyboard. It saves exactly what is shown: no user name = guest.
// The script on the TV is public/netfolder/netfolder.sh; nothing is connected until Connect (or a picker opens the folder).

interface Props {
	/** the saved network folder, or null */
	saved: NetFolder | null;
	/** saved, connected or forgotten: back to the picker with this message */
	onDone: (message: string) => void;
	/** Back: leave with nothing changed */
	onClose: () => void;
}

type Field = 'host' | 'share' | 'user' | 'pass';

export function NetFolderForm ({saved, onDone, onClose}: Props) {
	const [fields, setFields] = useState<Record<Field, string>>({host: saved ? saved.host : '', share: saved ? saved.share : '', user: '', pass: ''});
	const [typing, setTyping] = useState<Field | null>(null);
	const [busy, setBusy] = useState(false);
	const [index, setIndex] = useState(0);
	const [message, setMessage] = useState('');
	const alive = useRef(true);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => () => { alive.current = false; }, []);
	useEffect(() => { if (typing && input.current) input.current.focus(); }, [typing]);

	const connect = () => {
		const host = cleanHost(fields.host);
		const share = cleanShare(fields.share);
		const user = fields.user.trim();
		if (!host || !share) { setMessage(tt('netfolder.needHost')); return; }
		// a saved user name and password are never shown; typing nothing here would turn the folder into a guest one
		if (saved && !saved.guest && !user && !fields.pass) { setMessage(tt('netfolder.retype')); return; }
		setBusy(true);
		setMessage('');
		saveNetFolder(host, share, user, fields.pass).then((r) => {
			if (!alive.current) return;
			setBusy(false);
			if (r.ok) onDone(tt('netfolder.connected'));
			else setMessage(tt('picker.networkFolderFailed', {why: netReasonText(r)}));
		}, (e) => {
			if (!alive.current) return;
			setBusy(false);
			setMessage(e && /unsafe/.test(String(e.message)) ? tt('netfolder.whyRefused') : failureText(e, tt('picker.networkFolderFailed', {why: ''})));
		});
	};
	const forget = () => {
		forgetNetFolder().then(() => { if (alive.current) onDone(tt('netfolder.forgotten')); },
			(e) => { if (alive.current) setMessage(failureText(e, tt('picker.networkFolderFailed', {why: ''}))); });
	};

	const shown = (f: Field): string => (f === 'pass' ? (fields.pass ? '•'.repeat(Math.min(12, fields.pass.length)) : tt('netfolder.empty')) : fields[f] || tt('netfolder.empty'));
	const userDetail = fields.user || (saved && !saved.guest ? tt('netfolder.userSaved') : tt('netfolder.guest'));
	const rows: Array<{key: string; label: string; detail: string; field?: Field; run: () => void}> = [
		{key: 'host', field: 'host', label: tt('netfolder.host'), detail: shown('host'), run: () => setTyping('host')},
		{key: 'share', field: 'share', label: tt('netfolder.share'), detail: shown('share'), run: () => setTyping('share')},
		{key: 'user', field: 'user', label: tt('netfolder.user'), detail: userDetail, run: () => setTyping('user')},
		{key: 'pass', field: 'pass', label: tt('netfolder.pass'), detail: shown('pass'), run: () => setTyping('pass')},
		{key: 'connect', label: busy ? tt('netfolder.connecting') : tt('netfolder.connect'), detail: tt('netfolder.connectDetail'), run: () => { if (!busy) connect(); }}
	];
	if (saved) rows.push({key: 'forget', label: tt('netfolder.forget'), detail: tt('netfolder.forgetDetail'), run: () => { if (!busy) forget(); }});
	rows.push({key: 'back', label: tt('netfolder.back'), detail: '', run: onClose});
	const at = clamp(index, 0, rows.length - 1);

	const handleKey = (key: NavKey): boolean => {
		if (key === 'up') setIndex(clamp(at - 1, 0, rows.length - 1));
		else if (key === 'down') setIndex(clamp(at + 1, 0, rows.length - 1));
		else if (key === 'enter') rows[at].run();
		else if (key === 'back') { if (!busy) onClose(); }
		return true;
	};
	useKeys(handleKey, !typing);

	// the text field: Enter keeps the text, Back leaves it unchanged
	const onFieldKey = (e: KeyboardEvent) => {
		if (e.keyCode === 13) {
			e.preventDefault();
			const value = (e.target as HTMLInputElement).value;
			if (typing) setFields((f) => ({...f, [typing]: value}));
			setTyping(null);
		} else if (e.keyCode === 461 || e.keyCode === 27) { e.preventDefault(); setTyping(null); }
	};

	return (
		<div class="screen screen--picker">
			<div class="settings">
				<h1 class="settings__title">{tt('netfolder.title')}</h1>
				<p class="settings__hint">{tt('netfolder.hint')}</p>
				<div class="picker__note">
					<div class="picker__note-para">
						<div class="picker__note-line">{tt('netfolder.about')}</div>
						<div class="picker__note-line">{tt('netfolder.privacy')}</div>
					</div>
				</div>
				{message && <div class="picker__status picker__status--error">{message}</div>}
				<div class="picker">
					{rows.map((row, i) => (
						<div key={row.key} class={`picker__row${i === at ? ' picker__row--focused' : ''}`} onMouseEnter={() => setIndex(i)} onClick={() => { setIndex(i); row.run(); }}>
							<PickerIcon kind={row.field ? 'search' : row.key === 'connect' ? 'drive' : 'info'} />
							<div class="picker__text">
								<div class="picker__label">{row.label}</div>
								{typing && row.field === typing
									? <input ref={input} class="picker__input" type={typing === 'pass' ? 'password' : 'text'} defaultValue={typing === 'pass' ? '' : fields[typing]}
										placeholder={typing === 'host' ? tt('netfolder.exampleHost') : typing === 'share' ? tt('netfolder.exampleShare') : ''} maxLength={200} onKeyDown={onFieldKey} />
									: row.detail && <div class="picker__detail">{row.detail}</div>}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
