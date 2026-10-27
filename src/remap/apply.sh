#!/bin/sh
# Hearth: reassignable remote buttons. Puts Hearth's key filter (keyfilter.js) at the front of the TV's key
# filter chain and hands it the button map, or takes it out again. Everything is set in configd's memory
# ("volatile": true): nothing on the TV's storage is changed, and without the boot link a restart gives back
# the TV's own behaviour.
#
#   apply.sh on     add the filter (if it isn't there) and push the button map from map.json
#   apply.sh check  only if the filter is missing (configd forgets in-memory settings when it reconfigures):
#                   add it again with the map. Cheap: one read when all is in place
#   apply.sh [boot] 'on', then two later 'check's in the background (the TV may still be settling).
#                   The default, because the boot link is run without arguments
#   apply.sh reload like 'on', but the chain is loaded again even if the filter is in place (after
#                   keyfilter.js changed: the TV only reads the file when the chain changes)
#   apply.sh off    take the filter and the map out
#   apply.sh capture / nocapture
#                   tell the filter that Hearth is waiting for one button press ("Press a button"), or not any more
#
# Prints one word: applied, removed, launcher-missing, files-missing or failed.
# Run at boot by a link in /var/lib/webosbrew/init.d, and by Hearth when the setting changes or Hearth opens.

REMAP="${REMAP:-/media/developer/launcher-remap}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/tld.my.customlauncher}"
LINK="${LINK:-/var/lib/webosbrew/init.d/47-launcher-remap}"
LOG="${LOG:-/tmp/launcher-remap.log}"
LUNA="${LUNA:-luna-send}"
SNAPDIR="${SNAPDIR:-/tmp}"
FILTERS=com.webos.surfacemanager.keyFilters
MAPNAME=tld.my.customlauncher.remap
FILTER="$REMAP/keyfilter.js"
ENTRY="{\"handler\":\"hearthRemap\",\"file\":\"$FILTER\"}"

log () { echo "$(date '+%H:%M:%S') $*" >> "$LOG"; }
config () { "$LUNA" -n 1 "luna://com.webos.service.config/$1" "$2" </dev/null 2>/dev/null; }
snapshots () { ls "$SNAPDIR"/configd_*_before_setConfigs.json 2>/dev/null; }
# configd keeps a copy of all its settings (~90 KB, in memory) in /tmp each time they change, and never deletes it:
# the copies this script causes are deleted again
setconfigs () {
    before="$(snapshots)"
    config setConfigs "$1"
    for f in $(snapshots); do
        case "$before" in *"$f"*) ;; *) rm -f "$f" ;; esac
    done
}
ok () { printf '%s' "$1" | grep -q '"returnValue" *: *true'; }
readmap () {
    map="$(tr -d '\n' < "$REMAP/map.json" 2>/dev/null)"
    case "$map" in
        '{'*'}') return 0 ;;
        *) return 1 ;;
    esac
}

mode="${1:-boot}"

if [ "$mode" = boot ]; then
    sh "$0" on
    ( nohup sh -c "sleep 30; sh '$0' check >/dev/null; sleep 90; sh '$0' check >/dev/null" >/dev/null 2>&1 </dev/null & )
    exit 0
fi

if [ "$mode" = capture ] || [ "$mode" = nocapture ]; then
    if ! readmap; then echo files-missing; exit 4; fi
    [ "$mode" = capture ] && map="${map%\}},\"capture\":1}"
    out="$(setconfigs "{\"volatile\":true,\"configs\":{\"$MAPNAME\":$map}}")"
    if ok "$out"; then echo applied; exit 0; fi
    log "configd refused $mode: $out"
    echo failed
    exit 1
fi

# The filter chain as the TV has it now (compact JSON, one line). The entries are flat objects, so the
# list is everything between the first [ and its ].
current="$(config getConfigs "{\"configNames\":[\"$FILTERS\"]}")"
list="$(printf '%s' "$current" | tr -d '\n' | sed -n "s/.*\"$FILTERS\" *: *\(\[[^]]*\]\).*/\1/p")"
if [ -z "$list" ]; then
    log "could not read the key filter list: $(printf '%s' "$current" | head -c 200)"
    echo failed
    exit 1
fi
# the list without Hearth's entry (wherever it is, whatever its path)
stock="$(printf '%s' "$list" | sed -e 's/{[^}]*"hearthRemap"[^}]*}//g' -e 's/,,*/,/g' -e 's/\[,/[/' -e 's/,\]/]/')"

if [ "$mode" = off ]; then
    # null takes the in-memory value away again, so the TV's own list (and no map) is back
    out="$(setconfigs "{\"volatile\":true,\"configs\":{\"$FILTERS\":null,\"$MAPNAME\":null}}")"
    if ok "$out"; then
        log "removed"
        echo removed
        exit 0
    fi
    log "configd refused the removal: $out"
    echo failed
    exit 1
fi

if [ "$mode" = reload ] && [ "$stock" != "$list" ]; then
    # out first (the TV's own list comes back), so putting it in again below is a change the TV acts on
    setconfigs "{\"volatile\":true,\"configs\":{\"$FILTERS\":null}}" >/dev/null
    list="$stock"
fi

if [ "$mode" = check ] && [ "$stock" != "$list" ]; then
    echo applied
    exit 0
fi

# The launcher must be installed (if it was uninstalled, the remote is left alone and the boot link goes).
if [ ! -f "$LAUNCHER/appinfo.json" ]; then
    log "launcher not installed: buttons left as they are"
    rm -f "$LINK"
    echo launcher-missing
    exit 2
fi
if [ ! -f "$FILTER" ] || [ ! -f "$REMAP/map.json" ]; then
    log "keyfilter.js or map.json missing: nothing changed"
    echo files-missing
    exit 4
fi

if ! readmap; then
    log "map.json is not a JSON object: nothing changed"
    echo failed
    exit 1
fi

if [ "$stock" = "$list" ]; then
    # not in place yet: Hearth's filter goes first, the TV's own filters follow unchanged
    if [ "$stock" = "[]" ]; then wanted="[$ENTRY]"; else wanted="[$ENTRY,${stock#[}"; fi
    payload="{\"volatile\":true,\"configs\":{\"$FILTERS\":$wanted,\"$MAPNAME\":$map}}"
else
    # in place: only the map changes (the filter is told at once, the chain is not reloaded)
    payload="{\"volatile\":true,\"configs\":{\"$MAPNAME\":$map}}"
fi
out="$(setconfigs "$payload")"
if ok "$out"; then
    log "applied ($mode)"
    echo applied
    exit 0
fi
log "configd refused the change: $out"
echo failed
exit 1
