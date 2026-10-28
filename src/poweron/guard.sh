#!/bin/sh
# Start-up check for "When the TV turns on, open..." (Settings, Options). Written to the TV by the launcher (rooted TVs
# only); nothing to copy by hand. See README.md in this folder.
#
# That setting writes /var/luna/preferences/bootd.json, a copy of the TV's /etc/palm/bootd.json that sends the power
# button to the chosen app. The TV's boot daemon reads it when it starts. At each start this script:
#   1. notes in $LOADED which app bootd has just loaded ("<app>", "<app>+network", "stock" for none), so Hearth can say
#      when a restart is needed;
#   2. if Hearth is uninstalled, removes the copy (the TV is back to its own behaviour from the next start);
#   3. if a software update changed the TV's own file, removes the copy too, so an old copy never hides the new file;
#   4. if the copy was changed or removed by someone else, leaves it and removes only itself.
# Nothing waits and nothing keeps running.
#
# Usage: sh guard.sh [check]
#   (no argument, as run from the startup folder) the check.   check: the same, printing what it did.

DIR="${DIR:-/media/developer/launcher-poweron}"
LINK="${LINK:-/var/lib/webosbrew/init.d/45-launcher-poweron}"
OVERRIDE="${OVERRIDE:-/var/luna/preferences/bootd.json}"
STOCK="${STOCK:-/etc/palm/bootd.json}"
LOADED="${LOADED:-/tmp/launcher-poweron.loaded}"
LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/$LAUNCHER_ID}"
LOG="${LOG:-/tmp/launcher-poweron.log}"

log () { echo "$(date '+%H:%M:%S') poweron: $*" >> "$LOG"; }
sum () { md5sum "$1" 2>/dev/null | cut -d ' ' -f 1; }
# the copy is one Hearth wrote: its sum is noted (two are noted while a change is being finished)
ours () { [ -f "$OVERRIDE" ] && [ -s "$OVERRIDE" ] && grep -qx "$(sum "$OVERRIDE")" "$DIR/override.md5" 2>/dev/null; }
leave () { rm -f "$LINK"; rm -rf "$DIR"; }

check () {
    # an empty copy (a power cut right after it was written) is never valid: remove it whoever wrote it
    if [ -f "$OVERRIDE" ] && [ ! -s "$OVERRIDE" ]; then
        rm -f "$OVERRIDE"; echo stock > "$LOADED"; leave
        log "the start-up file was empty: removed"
        echo "removed: empty"; return 0
    fi
    # what bootd read a moment ago, taken from the copy itself: the power button's app, and whether network wake-ups go
    # to it too (Hearth writes one key per line)
    app=$(sed -n 's/.*"remoteKey": *"\([^"]*\)".*/\1/p' "$OVERRIDE" 2>/dev/null | head -n 1)
    case "$app" in ""|*[!A-Za-z0-9._-]*) app="" ;; esac
    net=$(sed -n 's/.*"wakeOnWiFi": *"\([^"]*\)".*/\1/p' "$OVERRIDE" 2>/dev/null | head -n 1)
    extra=""; [ -n "$app" ] && [ "$net" = "$app" ] && extra="+network"
    if ours && [ -n "$app" ]; then echo "$app$extra" > "$LOADED"; else echo stock > "$LOADED"; fi

    if ! ours; then
        log "the start-up file is not Hearth's any more: left alone"
        leave; echo "not ours"; return 0
    fi
    if [ ! -f "$LAUNCHER/appinfo.json" ]; then
        rm -f "$OVERRIDE"; leave
        log "Hearth is not installed: the TV opens its last input again from the next start"
        echo "removed: no launcher"; return 0
    fi
    if [ "$(sum "$STOCK")" != "$(cat "$DIR/stock.md5" 2>/dev/null)" ]; then
        rm -f "$OVERRIDE"; leave
        log "the TV's own start-up file changed (software update?): Hearth's copy removed, choose the app again in Hearth"
        echo "removed: stock changed"; return 0
    fi
    log "in place: the TV opens $app when it is switched on${extra:+ (network wake-ups too)}"
    echo "in place: $app"
}

case "${1:-boot}" in
    check) check ;;
    boot) check >/dev/null 2>&1 ;;
    *) echo "usage: guard.sh [check]"; exit 1 ;;
esac
