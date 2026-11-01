// S1: the SSAP "register" message, shared by the app list (ssap.ts) and the Tests tab (probessap.ts). Newer LG firmware
// (43.x) silently closes the connection for the old request, so two variants exist: 'new' (a long outer permission list,
// no signed block, no appVersion; the form LGTV Companion 5.7 uses) and 'old' (the 1.2.0 request; kept as fallback).

export type Variant = 'new' | 'old';

const OLD_PERMISSIONS = ['LAUNCH', 'READ_INSTALLED_APPS', 'READ_RUNNING_APPS'];
const NEW_PERMISSIONS = ['LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED', 'CONTROL_AUDIO', 'CONTROL_DISPLAY',
	'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV', 'CONTROL_POWER',
	'CONTROL_TV_SCREEN', 'READ_APP_STATUS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE', 'READ_RUNNING_APPS',
	'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE', 'READ_COUNTRY_INFO', 'READ_SETTINGS', 'CONTROL_INPUT_TEXT',
	'CONTROL_MOUSE_AND_KEYBOARD', 'WRITE_SETTINGS', 'WRITE_NOTIFICATION_ALERT', 'READ_INSTALLED_APPS', 'READ_UPDATE_INFO'];

/** A saved variant read from storage: anything but 'new' means the old request (keys made before S1 used it). */
export const variantOf = (v: unknown): Variant => (v === 'new' ? 'new' : 'old');

/** The JSON text of the register message. */
export function registerMessage (key: string, variant: Variant): string {
	const manifest: Record<string, unknown> = variant === 'new'
		? {manifestVersion: 1, permissions: NEW_PERMISSIONS}
		: {manifestVersion: 1, appVersion: '1.0', permissions: OLD_PERMISSIONS};
	const payload: Record<string, unknown> = {forcePairing: false, pairingType: 'PROMPT', manifest};
	if (key) payload['client-key'] = key;
	return JSON.stringify({type: 'register', id: 'register_0', payload});
}

/** Error for a socket the TV closed during register. `early` = it closed before sending any reply (the firmware's silent refusal). */
export interface CloseError extends Error {early?: boolean}

export function closedError (code: number | undefined, replied: boolean): CloseError {
	const e: CloseError = new Error('the TV closed the connection (code ' + (code === undefined ? '?' : code) + ', ' + (replied ? 'after a reply' : 'no reply') + ')');
	e.early = !replied;
	return e;
}

export const isEarlyClose = (e: unknown): boolean => !!(e && (e as CloseError).early);
