// Hearth: reassignable remote buttons. A key filter for the TV's own window manager (surface-manager).
//
// The TV decides what a remote button does in a chain of small JavaScript "key filters" that run inside
// surface-manager (LG's Netflix / Prime Video / Disney+ buttons are handled there, for the IR remote and the
// Magic Remote alike). Hearth's apply.sh adds this file to the front of that chain, in memory only
// (configd setConfigs with "volatile": true), so a reboot without the boot link, or "Off" in Hearth,
// gives back the TV's own behaviour.
//
// Cost: one object lookup per key press. No timers, no polling, no extra process. The button map comes
// from configd (tld.my.customlauncher.remap), pushed to this filter by a subscription, so a change in
// Hearth applies at once.
//
// Runs in the Qt JS engine of webOS 4 (ES5 only). Each filter file has its own scope; init() is called
// when the chain is loaded. Every handler returns KeyPolicy.NextPolicy for anything it does not own,
// so the rest of the chain (LG's filters) behaves exactly as before.

var HEARTH_ID = 'tld.my.customlauncher';
var CONFIG_NAME = 'tld.my.customlauncher.remap';
var CAPTURE_MS = 60000;

// Buttons known by name. The name (not the number) is what Hearth stores, so a map keeps working if a
// firmware numbers its keys differently. Any other button is stored as "#<code>".
var KNOWN = ['Key_webOS_Netflix', 'Key_webOS_Amazon', 'Key_webOS_Disneyplus', 'Key_webOS_RakutenTV', 'Key_webOS_LGChannels',
	'Key_webOS_USP', 'Key_webOS_New', 'Key_webOS_IVI', 'Key_webOS_Hotstar', 'Key_webOS_Globoplay', 'Key_webOS_Okko',
	'Key_webOS_Kinopoisk', 'Key_webOS_Watchaplay', 'Key_webOS_UNext', 'Key_webOS_TVGuide', 'Key_webOS_InputTV',
	'Key_webOS_Red', 'Key_webOS_Green', 'Key_webOS_Yellow', 'Key_webOS_Blue', 'Key_webOS_ScreenRemote',
	'Key_webOS_Voice', 'Key_webOS_Settings', 'Key_webOS_InputSource', 'Key_webOS_3DMode', 'Key_webOS_RecordList',
	'Key_webOS_LiveTVMenu', 'Key_webOS_ProgramList', 'Key_webOS_AspectRatio', 'Key_webOS_MagicLink', 'Key_webOS_LiveZoom'];

// One button, different key names on different remotes: the Rakuten TV / Movies button is Key_webOS_USP on 2019
// remotes (MR19, "KEY_MOVIES") and Key_webOS_RakutenTV on later ones. Hearth stores the name on the right.
var ALIASES = {'Key_webOS_USP': 'Key_webOS_RakutenTV'};

// Never taken over, so the remote can always be used to get out of a bad map: arrows, OK, Back, Exit,
// Home, power, volume, mute, channels and the number keys (hold a number = LG's Quick Access).
var PROTECTED_QT = ['Key_Left', 'Key_Right', 'Key_Up', 'Key_Down', 'Key_Return', 'Key_Enter', 'Key_Select', 'Key_Escape',
	'Key_Super_L', 'Key_Menu', 'Key_Home', 'Key_PowerOff', 'Key_Sleep', 'Key_VolumeUp', 'Key_VolumeDown', 'Key_VolumeMute',
	'Key_ChannelUp', 'Key_ChannelDown', 'Key_0', 'Key_1', 'Key_2', 'Key_3', 'Key_4', 'Key_5', 'Key_6', 'Key_7', 'Key_8', 'Key_9'];
var PROTECTED_WEBOS = ['Key_webOS_Back', 'Key_webOS_Exit', 'Key_webOS_Recent', 'Key_webOS_ChannelUp', 'Key_webOS_ChannelDown',
	'Key_webOS_Power', 'Key_webOS_LocalLeft', 'Key_webOS_LocalRight', 'Key_webOS_LocalUp', 'Key_webOS_LocalDown',
	'Key_webOS_LocalEnter', 'Key_webOS_LocalPower', 'Key_webOS_VoiceBack', 'Key_webOS_VoiceExit'];

var hearthNames = {};       // key code -> name
var hearthProtected = {};   // key code -> true
var hearthMap = {};         // name -> action
var hearthCapture = 0;      // when Hearth asked for "press a button" (0: not waiting)
var hearthHeld = {};        // key code -> true while a press this filter took is down (its release is taken too)

function hearthLog (msgId, info) {
	try { pmLog.info(msgId, info || {}); } catch (e) { /* logging is best effort */ }
}

function init () {
	hearthNames = {};
	hearthProtected = {};
	hearthHeld = {};
	var i, code;
	for (i = 0; i < KNOWN.length; i++) {
		code = WebOS[KNOWN[i]];
		if (typeof code === 'number' && !hearthNames[code]) hearthNames[code] = KNOWN[i];
	}
	for (i = 0; i < PROTECTED_QT.length; i++) {
		code = Qt[PROTECTED_QT[i]];
		if (typeof code === 'number') hearthProtected[code] = true;
	}
	for (i = 0; i < PROTECTED_WEBOS.length; i++) {
		code = WebOS[PROTECTED_WEBOS[i]];
		if (typeof code === 'number') hearthProtected[code] = true;
	}
	lunaCall.subscribe('com.webos.service.config', '/getConfigs',
		JSON.stringify({'configNames': [CONFIG_NAME], 'subscribe': true}), hearthOnConfig);
	hearthLog('HEARTH_REMAP_LOADED', {});
}

function hearthOnConfig (payload) {
	try {
		var ret = JSON.parse(payload);
		var c = ret && ret.configs ? ret.configs[CONFIG_NAME] : null;
		hearthMap = c && c.on && c.keys ? c.keys : {};
		hearthCapture = c && c.on && c.capture ? Date.now() : 0;
		hearthLog('HEARTH_REMAP_MAP', {'buttons': Object.keys(hearthMap).length, 'capture': !!hearthCapture});
	} catch (e) {
		hearthMap = {};
		hearthCapture = 0;
	}
}

function hearthNameOf (key) {
	var name = hearthNames[key] || ('#' + key);
	return ALIASES[name] || name;
}

function hearthLaunch (id, params) {
	applicationManager.launch(id, JSON.stringify(params || {}));
}

function hearthRun (action) {
	if (action.t === 'app' && action.id) hearthLaunch(action.id, action.p);
	else if (action.t === 'mute') volume.mute();
	// 't: none' does nothing: the button is switched off
}

function hearthRemap (key, pressed, autoRepeat) {
	try {
		// the release (and repeats) of a press this filter took belong to it too; a new press starts over
		// (in case a release was ever lost)
		if (pressed && !autoRepeat) delete hearthHeld[key];
		if (hearthHeld[key]) {
			if (!pressed) delete hearthHeld[key];
			return KeyPolicy.Accepted;
		}
		if (!pressed || hearthProtected[key]) return KeyPolicy.NextPolicy;

		var name = hearthNameOf(key);

		// "Press the button to reassign": only while Hearth is in front and asked for it, for one minute
		if (hearthCapture) {
			if (Date.now() - hearthCapture > CAPTURE_MS) hearthCapture = 0;
			else if (fullscreenView.appId === HEARTH_ID) {
				hearthCapture = 0;
				hearthHeld[key] = true;
				hearthLaunch(HEARTH_ID, {'hearthRemapKey': name});
				return KeyPolicy.Accepted;
			}
		}

		var action = hearthMap[name] || hearthMap[hearthNames[key] || ''];
		if (!action || !action.t) return KeyPolicy.NextPolicy;
		// the TV is not taking app launches just now (first-time setup, an alert on screen): leave it to the TV
		if (action.t === 'app' && !access.keyAction.launchApp) return KeyPolicy.NextPolicy;

		hearthHeld[key] = true;
		if (!autoRepeat) {
			hearthLog('HEARTH_REMAP_PRESS', {'button': name, 'action': action.t, 'id': action.id || ''});
			hearthRun(action);
		}
		return KeyPolicy.Accepted;
	} catch (e) {
		hearthLog('HEARTH_REMAP_ERROR', {'error': String(e)});
		return KeyPolicy.NextPolicy;
	}
}
