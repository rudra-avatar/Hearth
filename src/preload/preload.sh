#!/bin/sh
# Hearth: stop LG's preloading of chosen apps. Written to the TV by the launcher; nothing to copy by hand.
#
# What it does: LG's preload manager keeps some apps loaded in the background so they open fast. Its list is the
# configd value com.webos.service.preloadmanager.supportAppList. Two calls change it, and both are used:
#   - configd setConfigs with the whole list (apps switched off get isEnabled false): read by the preload manager at
#     its next start and kept across restarts of the TV;
#   - the preload manager's setPreloadPolicy for one app: acts at once, lost when the manager restarts, so it is
#     sent again at every start of the TV (the start-at-boot link) and when Hearth opens.
# Nothing is ever closed (an app closed from outside has left HDMI unable to open on some TVs until a restart).
# The launcher builds the JSON; this script only moves files and calls luna-send. Method and research: Glasshouse
# (Rory Gallagher, MIT), server/lib/preload.js; the code here is our own.
#
# Files in $DIR: off.txt (ids switched off, one per line), want.json (the setConfigs call with the list as it is now),
# lg.json (the same call with LG's list as it was before the first change: used to go back), version.
#
# Usage: sh preload.sh set 0|1 id...   the launcher has written want.json.new, off.txt.new (and lg.json.new on the first
#                                       change): sends want.json.new, and only if the TV took it moves the .new files into
#                                       place, tells the manager about the ids now (0 = off, 1 = back to LG's setting) and
#                                       adds or removes the start-at-boot link. Prints result=ok, failed, badid or nofiles.
#        sh preload.sh apply           tell the manager again about every id in off.txt. Prints result=ok.
#        sh preload.sh restore         put LG's list back (lg.json), tell the manager, remove the link and the files.
#        sh preload.sh boot            (also: as run from the startup folder) apply after a start, in the background; if
#                                       Hearth is no longer installed, put LG's list back and delete our own files.
#        sh preload.sh status          one word per line: switched-off (if any), linked.

DIR="${DIR:-/media/developer/launcher-preload}"
LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/$LAUNCHER_ID}"
LINK="${LINK:-/var/lib/webosbrew/init.d/50-launcher-preload}"
OFF="${OFF:-$DIR/off.txt}"
WANT="${WANT:-$DIR/want.json}"
LGLIST="${LGLIST:-$DIR/lg.json}"
LOG="${LOG:-/tmp/launcher-preload.log}"
LUNA="${LUNA_SEND:-luna-send}"
NAP="${NAP:-sleep}"
DONE="${DONE:-/tmp/launcher-preload.done}"                # set once the TV start has applied the list (P52)
LOWPRI=""; command -v nice >/dev/null 2>&1 && LOWPRI="nice -n 19"   # the boot job must not compete with the Home button start-up

log () { echo "$(date '+%H:%M:%S') $*" >> "$LOG" 2>/dev/null; }
# >>> fdclean (the same lines in every helper; checked by scripts/test-fdclean.sh) >>>
# #54: a helper started through the Homebrew service inherits its sockets (fds 3 and up) and a stuck registration can follow.
# fdclean closes every fd above 2 in the process that runs it (use it in the background part, before `exec`); a shell that
# cannot name a two-digit fd (dash) closes only fds 3 to 9. fdnote prints the count for the log.
fdclean () {
    _w=0; ( eval "exec 10>&-" ) 2>/dev/null && _w=1
    for _f in /proc/self/fd/*; do
        _n=${_f##*/}
        case "$_n" in ''|*[!0-9]*|0|1|2) continue ;; esac
        [ "${#_n}" -gt 1 ] && [ "$_w" = 0 ] && continue
        eval "exec $_n>&-" 2>/dev/null
    done
}
fdnote () { set -- /proc/self/fd/*; echo "fds=$#"; }
# <<< fdclean <<<

# an app id is letters, digits, dot, dash and underscore only (it goes into JSON and a file name)
valid_id () {
    case "$1" in ''|*[!A-Za-z0-9._-]*) return 1 ;; esac
    return 0
}

# did the luna-send answer say returnValue true
took () {
    case "$1" in *'"returnValue":true'*|*'"returnValue": true'*) return 0 ;; esac
    return 1
}

# tell the preload manager now: $1 id, $2 1 = enabled, 0 = off
set_live () {
    if [ "$2" = 1 ]; then flag=true; else flag=false; fi
    reply=$("$LUNA" -n 1 luna://com.webos.service.preloadmanager/setPreloadPolicy "{\"application\":{\"id\":\"$1\",\"isEnabled\":$flag}}" 2>&1)
    log "live $1 enabled=$flag: $reply"
}

send_list () { "$LUNA" -n 1 luna://com.webos.service.config/setConfigs "$(cat "$1")" 2>&1; }

has_off () { [ -s "$OFF" ]; }

add_link () {
    mkdir -p "$(dirname "$LINK")" 2>/dev/null
    ln -sf "$DIR/preload.sh" "$LINK" 2>/dev/null || log "could not add the start-at-boot link"
}

cmd_set () {
    mode="$1"; shift
    case "$mode" in 0|1) ;; *) echo result=badid; return 0 ;; esac
    [ "$#" -gt 0 ] || { echo result=badid; return 0; }
    for id in "$@"; do valid_id "$id" || { echo result=badid; return 0; }; done
    if [ ! -f "$DIR/want.json.new" ] || [ ! -f "$DIR/off.txt.new" ]; then echo result=nofiles; return 0; fi
    out=$(send_list "$DIR/want.json.new")
    if ! took "$out"; then
        log "setConfigs failed: $out"
        rm -f "$DIR/want.json.new" "$DIR/off.txt.new" "$DIR/lg.json.new"
        echo result=failed
        return 0
    fi
    mv -f "$DIR/want.json.new" "$WANT"
    mv -f "$DIR/off.txt.new" "$OFF"
    [ -f "$DIR/lg.json.new" ] && mv -f "$DIR/lg.json.new" "$LGLIST"
    for id in "$@"; do set_live "$id" "$mode"; done
    if has_off; then add_link; else rm -f "$LINK"; fi
    log "set mode=$mode: $*"
    echo result=ok
}

cmd_apply () {
    n=0
    if [ -f "$OFF" ]; then
        while read -r id; do
            valid_id "$id" || continue
            set_live "$id" 0
            n=$((n + 1))
        done < "$OFF"
    fi
    log "apply: $n id(s)"
    echo result=ok
}

# LG's list back, everything of ours deleted
cmd_restore () {
    if [ -f "$LGLIST" ]; then
        out=$(send_list "$LGLIST")
        took "$out" || log "restore: setConfigs failed: $out"
    fi
    if [ -f "$OFF" ]; then
        while read -r id; do valid_id "$id" && set_live "$id" 1; done < "$OFF"
    fi
    rm -f "$LINK"
    rm -rf "$DIR"
    echo result=ok
}

boot_job () {
    log "boot job started ($(fdnote))"
    # the app storage can be slow to appear at start-up: look a few times before deciding Hearth is gone
    rounds=0
    while [ ! -f "$LAUNCHER/appinfo.json" ] && [ "$rounds" -lt 6 ]; do $NAP 5; rounds=$((rounds + 1)); done
    if [ ! -f "$LAUNCHER/appinfo.json" ]; then
        log "Hearth is not installed: putting LG's list back and removing the files"
        cmd_restore >/dev/null
        return 0
    fi
    # wait for the preload manager to answer (up to about two minutes)
    rounds=0
    while [ "$rounds" -lt 40 ]; do
        reply=$("$LUNA" -n 1 luna://com.webos.service.preloadmanager/getPreloadPolicy '{}' 2>&1)
        took "$reply" && break
        $NAP 3; rounds=$((rounds + 1))
    done
    log "boot: manager answered after $rounds tries"
    # probe (P53): the manager's own state before we say anything, to see whether our saved list outlived the reboot
    log "boot: before apply: $(printf '%s' "$reply" | tr -d '\n' | cut -c1-3000)"
    : > "$DONE"
    cmd_apply >/dev/null
    # the manager may load its own list again a little later: say it again twice
    $NAP 10; cmd_apply >/dev/null
    $NAP 35; cmd_apply >/dev/null
    return 0
}

# Hearth's start asks for one apply per TV start: the boot job has already done it (stamp in /tmp), so this is then a no-op
cmd_once () {
    [ -f "$DONE" ] && { echo result=skipped; return 0; }
    : > "$DONE"
    cmd_apply
}

cmd_boot () {
    has_off || exit 0
    if [ -n "$DRY_RUN" ]; then boot_job; else ( { fdclean; exec nohup $LOWPRI sh "$0" bootjob; } >/dev/null 2>&1 </dev/null & ); fi
}

cmd_status () {
    has_off && echo switched-off
    [ -L "$LINK" ] && echo linked
    return 0
}

case "${1:-boot}" in
    set) shift; cmd_set "$@" ;;
    apply) cmd_apply ;;
    once) cmd_once ;;
    restore) cmd_restore ;;
    status) cmd_status ;;
    boot) cmd_boot ;;
    bootjob) boot_job ;;
    *) echo "usage: $0 set|apply|once|restore|boot|status" >&2; exit 1 ;;
esac
