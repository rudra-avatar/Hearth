#!/bin/sh
# Start-up check for "Set Hearth as the TV's Home app" (Settings, Options). Written to the TV by the launcher (rooted
# TVs only); nothing to copy by hand.
#
# That setting writes Hearth's id into the TV's own Home app setting (general.defaultApps.home). If Hearth is then
# uninstalled without switching it off, the Home button names an app that is gone. At the next start this script sees
# that, puts back the app that was the Home app before (kept in $DIR/previous), and deletes itself and its folder.
# While Hearth is installed it does nothing.
#
# Usage: sh guard.sh [check]
#   (no argument, as run from the startup folder) the check, in the background, so the start is not held up.
#   check   the check itself: waits for the settings service (up to TRIES x 5 s), then acts.

DIR="${DIR:-/media/developer/launcher-homeapp}"
LINK="${LINK:-/var/lib/webosbrew/init.d/46-launcher-homeapp}"
LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/$LAUNCHER_ID}"
LUNA="${LUNA_SEND:-luna-send}"
NAP="${NAP:-sleep}"                      # tests set it to "true" so nothing waits
TRIES="${TRIES:-24}"
LOG="${LOG:-/tmp/launcher-homeapp.log}"
SETTINGS=luna://com.webos.settingsservice

log () { echo "$(date '+%H:%M:%S') homeapp: $*" >> "$LOG"; }

check () {
    [ -f "$LAUNCHER/appinfo.json" ] && { echo installed; return 0; }   # Hearth is still there: nothing to do
    n=0
    while :; do
        reply=$("$LUNA" -n 1 "$SETTINGS/getSystemSettings" '{"category":"general","keys":["defaultApps"]}' 2>/dev/null | tr -d '\n ')
        case "$reply" in *'"returnValue":true'*) break ;; esac
        n=$((n + 1))
        [ "$n" -ge "$TRIES" ] && { log "the settings service did not answer: trying again at the next start"; echo waiting; return 1; }
        $NAP 5
    done
    case "$reply" in
        *"\"home\":\"$LAUNCHER_ID\""*)
            previous=$(cat "$DIR/previous" 2>/dev/null)
            case "$previous" in ""|"$LAUNCHER_ID"|*[!A-Za-z0-9._-]*) previous=com.webos.app.home ;; esac
            "$LUNA" -n 1 "$SETTINGS/setSystemSettings" "{\"category\":\"general\",\"settings\":{\"defaultApps\":{\"home\":\"$previous\"}}}" >/dev/null 2>&1
            log "Hearth is not installed: the Home button opens $previous again"
            echo "restored $previous"
            ;;
        *) echo "left alone" ;;                                         # someone else changed it since: leave it
    esac
    rm -f "$LINK"
    rm -rf "$DIR"
}

case "${1:-boot}" in
    check) check ;;
    boot) ( check >/dev/null 2>&1 & ) ;;
    *) echo "usage: guard.sh [check]"; exit 1 ;;
esac
