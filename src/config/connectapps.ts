// P90: where the TV's own switch for SSAP sits. Without it the TV refuses Hearth's remote-control connection.
// Menu names differ by webOS version; the older path is from the openHAB LG webOS binding docs, the newer one is not verified by us.
export const CONNECT_APPS_PATH = 'LG menu: Network > LG Connect Apps (newer TVs: All Settings > Connection > Mobile Connection Management > LG Connect Apps)';
export const CONNECT_APPS_NOTE = '"LG Connect Apps" must be On in the TV\'s own settings for SSAP to work. ' + CONNECT_APPS_PATH + '.';
