#!/bin/sh
# Makes sure the watcher (watch.sh) is running, so that LG Home is replaced by the launcher.
# Safe to run again and again. Prints one word: applied, launcher-missing or files-missing.
# If the launcher is no longer installed, it also removes its own link and folder after 40 s.
# Run at boot by a link in /var/lib/webosbrew/init.d, and by the launcher whenever it opens.

APP_QML="${APP_QML:-/usr/palm/applications/com.webos.app.home/qml}"
HOOK="${HOOK:-/media/developer/launcher-homehook}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/tld.my.customlauncher}"
PIDFILE="${PIDFILE:-/tmp/launcher-homehook-watch.pid}"
LOG="${LOG:-/tmp/launcher-homehook.log}"
LINK="${LINK:-/var/lib/webosbrew/init.d/48-launcher-homehook}"

log () { echo "$(date '+%H:%M:%S') $*" >> "$LOG"; }
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

# Earlier versions put a stand-in over LG Home's QML. Take it off if it is still there.
if [ -z "$DRY_RUN" ]; then
    while grep -q " $APP_QML " /proc/mounts; do
        umount "$APP_QML" || break
    done
fi

# The launcher must be installed (if it was uninstalled, LG Home is left alone).
if [ ! -f "$LAUNCHER/appinfo.json" ]; then
    log "launcher not installed: not starting the watcher"
    # Uninstalled without switching this off: after a wait (the app storage can be slow to appear at start-up) the helper
    # removes its own link and folder. Not while testing.
    if [ -z "$DRY_RUN" ]; then
        ( { fdclean; exec nohup sh -c "sleep 40; [ -f '$LAUNCHER/appinfo.json' ] || { rm -f '$LINK'; rm -rf '$HOOK'; }"; } >/dev/null 2>&1 </dev/null & )
    fi
    echo launcher-missing
    exit 2
fi

if [ ! -f "$HOOK/watch.sh" ]; then
    log "watch.sh missing: not starting the watcher"
    echo files-missing
    exit 4
fi

# Already running?
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    log "watcher already running (pid $(cat "$PIDFILE"))"
    echo applied
    exit 0
fi

if [ -z "$DRY_RUN" ]; then
    ( { fdclean; exec nohup sh "$HOOK/watch.sh"; } >/dev/null 2>&1 </dev/null & )
fi
log "watcher started"
echo applied
