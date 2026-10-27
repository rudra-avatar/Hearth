// Sources: Live TV (the tuner, if the TV has one) followed by the external inputs
// (HDMI etc.) from the External Input Manager, which is callable from a web app. EIM
// returns the labels set in the TV's input settings and the icon LG's UI uses for
// each port; we ship copies of those icons.
//
// With root, the names connected HDMI-CEC devices announce (e.g. "Fire TV Stick") are read
// from the TV service's input list, so a source can show what is plugged in.

import {APP_ID, LUNA, SYSTEM_APP} from '../config/constants';
import {lunaCall, type LunaResponse} from './luna';
import {appExists} from './launch';
import {exec, shellQuote} from './apps';

export interface InputSource {
	id: string;        // e.g. HDMI_1
	appId: string;     // e.g. com.webos.app.hdmi1 — launch this to switch
	label: string;     // user-visible name from the TV's input settings
	port: number;
	connected: boolean;
	icon: string;      // file name under icons/inputs/
	/** the name the connected device announces over HDMI-CEC, when known */
	deviceName?: string;
}

interface EimDevice {
	id: string;
	appId: string;
	label: string;
	port: number;
	connected?: boolean;
	icon?: string;
}

interface EimResponse extends LunaResponse {
	devices?: EimDevice[];
}

/** One entry of the TV service's HDMI-CEC device list (webOS 4.x: externaldevice/getExternalInputStatusList). */
export interface CecDevice {
	osdName?: string;
	portId?: number;
	physicalAddr?: number;
}

const FALLBACK_ICON = 'hdmigeneric.png';
const CEC_LIST = 'luna://com.webos.service.tv.externaldevice/getExternalInputStatusList';

/** Live TV isn't an EIM device, but launching its app switches to the tuner, so it
 *  behaves like any other source. Port 0 sorts it ahead of HDMI 1. */
const LIVE_TV: InputSource = {
	id: 'LIVE_TV',
	appId: SYSTEM_APP.liveTv,
	label: 'Live TV',
	port: 0,
	connected: true,
	icon: 'tv.png'
};

/** cecNames: also look up HDMI-CEC device names (needs root; skipped quietly when it fails). */
export function listInputs (cecNames = false): Promise<InputSource[]> {
	return Promise.all([listExternalInputs(), appExists(LIVE_TV.appId), cecNames ? readCecDevices() : Promise.resolve([])])
		.then(([external, hasTuner, cec]) => (hasTuner ? [LIVE_TV] : []).concat(withDeviceNames(external, cec)));
}

function listExternalInputs (): Promise<InputSource[]> {
	return lunaCall<EimResponse>(LUNA.inputStatus, {}).then((r) =>
		(r.devices || [])
			.filter((d) => d.appId && (d.label || d.appId === APP_ID))     // the launcher's own entry may have no label
			.sort((a, b) => a.port - b.port)
			.map((d) => ({
				id: d.id,
				appId: d.appId,
				label: d.label || 'Launcher',
				port: d.port,
				connected: d.connected !== false,
				icon: d.icon || FALLBACK_ICON
			}))
	);
}

/** The HDMI-CEC devices the TV knows about. That list is in the TV's internal API group, so it is read as root through
 *  the Homebrew Channel; any failure (not rooted, other webOS version) gives an empty list. */
export function readCecDevices (): Promise<CecDevice[]> {
	return exec(`luna-send -n 1 ${CEC_LIST} ${shellQuote('{}')}`, 6000).then(
		(out) => { try { return cecList(JSON.parse(out)); } catch { return []; } },
		() => []
	);
}

/** The device list from a getExternalInputStatusList reply. */
export function cecList (reply: unknown): CecDevice[] {
	const cec = reply && typeof reply === 'object' ? (reply as {cec?: {cecDeviceList?: unknown}}).cec : undefined;
	const list = cec && Array.isArray(cec.cecDeviceList) ? cec.cecDeviceList : [];
	return list.filter((d): d is CecDevice => !!d && typeof d === 'object');
}

/** The HDMI port a CEC device is on: its port id, or the first digit of its physical address (2.0.0.0 → HDMI 2). */
export function cecPort (d: CecDevice): number {
	if (typeof d.portId === 'number' && d.portId > 0) return d.portId;
	return typeof d.physicalAddr === 'number' && d.physicalAddr > 0 ? (d.physicalAddr >> 12) & 0xf : 0;
}

/** Adds the CEC names to the HDMI inputs they are plugged into (the first named device per port). */
export function withDeviceNames (inputs: InputSource[], cec: CecDevice[]): InputSource[] {
	const names: Record<number, string> = {};
	cec.forEach((d) => {
		const name = typeof d.osdName === 'string' ? d.osdName.trim() : '';
		const port = cecPort(d);
		if (name && port && !names[port]) names[port] = name.slice(0, 40);
	});
	return inputs.map((i) => (i.id.indexOf('HDMI') === 0 && names[i.port] && i.connected ? {...i, deviceName: names[i.port]} : i));
}

/** Sample data so the layout can be developed in a desktop browser. */
export const MOCK_INPUTS: InputSource[] = [
	LIVE_TV,
	{id: 'HDMI_1', appId: 'com.webos.app.hdmi1', label: 'HDMI 1', port: 1, connected: false, icon: 'HDMI_1.png'},
	{id: 'HDMI_2', appId: 'com.webos.app.hdmi2', label: 'Streaming Box', port: 2, connected: true, icon: 'streamingbox.png', deviceName: 'Fire TV Stick'},
	{id: 'HDMI_3', appId: 'com.webos.app.hdmi3', label: 'HDMI 3', port: 3, connected: false, icon: 'HDMI_3.png'},
	{id: 'HDMI_4', appId: 'com.webos.app.hdmi4', label: 'Games Console', port: 4, connected: true, icon: 'gameconsole.png'}
];
