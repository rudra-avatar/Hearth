#!/bin/sh
# Keep Hearth ready (experimental; Settings -> System -> Memory). Written to the TV by the launcher (rooted TVs only);
# nothing to copy by hand.
#
# Why: the TV closes the app in front when another app is launched, unless it was launched with keepAlive (webOS
# docs), and LG's memory manager may close it anyway (TV test P70d: keepAlive and preload alone did not hold Hearth).
# What it does (one switch, P73):
#   - adds Hearth to the memory manager's keep list (the file that names KeepOnLaunchEx), through a bind mount of a
#     changed copy (nothing on the TV's disk changes), and restarts memchute.service once;
#   - with the file "relaunch" (apply on relaunch): when Hearth is not in memory afterwards and LG Home is in front, opens it once
#     with keepAlive (never when another app is in front);
#   - a watcher that logs what is in front and whether Hearth is still in memory (no memory figures).
# Everything is logged to /tmp/hearth-keep.log. A reboot undoes the mount (the start-up link does it again); Off undoes it at once.
#
# The outcome of the last run is in the file "state" (working, ok, or a failure code: no-list, no-home-entry, bad-copy,
# bad-json, mount-failed, not-applied, no-service, restart-failed, lost); the launcher reads it and shows plain text.
#
# Usage: sh keepready.sh apply on [relaunch]|off    turn it on or off (off removes everything)
#        sh keepready.sh status          print on=, watcher=, linked=, memlist=, relaunch=, state=
#        sh keepready.sh [boot]          what the start-up link runs (starts everything in the background)
#        sh keepready.sh run             the work itself (foreground)

DIR="${DIR:-/media/developer/launcher-keepready}"
LINK="${LINK:-/var/lib/webosbrew/init.d/51-launcher-keepready}"
LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
APPS="${APPS:-/media/developer/apps/usr/palm/applications}"
LAUNCHER="${LAUNCHER:-$APPS/$LAUNCHER_ID}"
LUNA="${LUNA_SEND:-luna-send}"
NAP="${NAP:-sleep}"                      # tests set it to "true" so nothing waits
DELAY="${DELAY:-6}"                      # seconds after another app came to the front before looking at Hearth
LOG="${LOG:-/tmp/hearth-keep.log}"
PIDFILE="${PIDFILE:-/tmp/hearth-keep-watch.pid}"
CHECKPID="${CHECKPID:-/tmp/hearth-keep-check.pid}"
SYSLOG="${SYSLOG:-/var/log/messages}"
SEARCH_DIRS="${SEARCH_DIRS:-/etc/palm}"     # P70d: a search of /usr/share took 90 s on the TV and delayed the watcher
MOUNT_CMD="${MOUNT_CMD:-mount}"
UMOUNT_CMD="${UMOUNT_CMD:-umount}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
MEM_RESTART="${MEM_RESTART:-1}"
DISCOVERED="${DISCOVERED:-/tmp/hearth-keep-discovered}"   # once per start: the search of the system files
FRONT_URI="luna://com.webos.applicationManager/getForegroundAppInfo"
RUNNING_URI="luna://com.webos.applicationManager/running"
HOME_ID="com.webos.app.home"
LAUNCH_URI="luna://com.webos.applicationManager/launch"

log () { echo "$(date '+%H:%M:%S') up=$(cut -d. -f1 /proc/uptime 2>/dev/null)s keep: $*" >> "$LOG"; }

set_state () { echo "$1" > "$DIR/state" 2>/dev/null; }

is_on () {                               # the switch is the file "on" (P73; an older install has the file "level" with 3: it counts as on)
    [ -f "$DIR/on" ] && return 0
    [ "$(cat "$DIR/level" 2>/dev/null | tr -dc '0-9')" = 3 ] && { echo on > "$DIR/on"; rm -f "$DIR/level" "$DIR/preload-state"; return 0; }
    return 1
}

hearth_gone () {                         # Hearth is gone only when the apps folder is there and our appinfo.json is not (checked twice)
    [ -f "$LAUNCHER/appinfo.json" ] && return 1
    $NAP 2
    [ -f "$LAUNCHER/appinfo.json" ] && return 1
    [ -d "$APPS" ] && [ ! -f "$LAUNCHER/appinfo.json" ]
}

app_id_of () { printf '%s' "$1" | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p' | head -n 1; }

# ----- the memory manager's keep list -----

find_memfiles () {
    for d in $SEARCH_DIRS; do
        [ -d "$d" ] || continue
        grep -rIil -e KeepOnLaunchEx "$d" 2>/dev/null
    done | head -n 3
}

discover_one () {                        # what the memory manager's list looks like (diagnostic, background)
    f="$1"
    log "discover: $f"
    grep -i -n -B1 -A4 KeepOnLaunchEx "$f" 2>/dev/null | head -n 14 | cut -c1-200 | while IFS= read -r l; do log "discover:   $l"; done
    tr -d '\n\r' < "$f" 2>/dev/null | tr -s ' \t' ' ' | cut -c1-2400 | fold -w 200 | while IFS= read -r l; do log "conf: $l"; done   # P70d: the limits the memory manager works with
}

discover () {
    files=$(find_memfiles)
    if [ -z "$files" ]; then log "discover: no text file with KeepOnLaunchEx under $SEARCH_DIRS"; return 0; fi
    for f in $files; do discover_one "$f"; done
}

sum_of () { cksum < "$1" 2>/dev/null | tr ' ' '-'; }   # P75b: tells whether the TV's own list file is still the one the copy was made from

mem_unit () {   # P70e: a .service only (the first match used to be the mount unit of our own copy, and restarting it removed the copy)
    units=$($SYSTEMCTL list-units --all --no-legend 2>/dev/null | awk '{print $1}' | grep -E '\.service$')
    u=$(printf '%s\n' "$units" | grep -E '^memchute\.service$' | head -n 1)
    [ -n "$u" ] || u=$(printf '%s\n' "$units" | grep -i -E 'memory.?manager|memchute' | grep -v -i ready | head -n 1)
    echo "$u"
}

restart_mem () {
    [ "$MEM_RESTART" = 1 ] || return 0
    unit=$(mem_unit)
    if [ -z "$unit" ]; then log "memory list: no memory manager service found to restart ($($SYSTEMCTL list-units --all --no-legend 2>/dev/null | awk '{print $1}' | grep -i -E 'memory|memchute' | tr '\n' ' '))"; set_state no-service; return 1; fi
    $SYSTEMCTL restart "$unit" >/dev/null 2>&1
    $NAP 3
    now=$($SYSTEMCTL is-active "$unit" 2>/dev/null)
    log "memory list: restarted $unit (now $now)"
    [ "$now" = active ] || { set_state restart-failed; return 1; }
    return 0
}

after_mount () {                         # the restart of the memory manager and the check that the live file still names Hearth
    f="$1"
    restart_mem || return 1
    if grep -q "$LAUNCHER_ID" "$f" 2>/dev/null; then log "memory list: checked after the restart: the live file names Hearth"
    else rm -f "$DIR/mem-target"; log "memory list: checked after the restart: the live file does NOT name Hearth any more"; set_state lost; return 1; fi
}

fast_mount () {                          # P75b: a restart of the TV removes the mount: the copy made earlier is mounted again when the TV's file is unchanged (no search, no new copy)
    f="$1"; copy="$DIR/memlist.copy"; want=$(cat "$DIR/memlist.sum" 2>/dev/null)
    [ -f "$copy" ] && [ -f "$f" ] && [ -n "$want" ] || return 1
    [ "$(sum_of "$f")" = "$want" ] || { log "memory list: $f has changed since the copy was made, building it again"; return 1; }
    grep -q "$LAUNCHER_ID" "$copy" 2>/dev/null || return 1
    $MOUNT_CMD --bind "$copy" "$f" 2>/dev/null || { log "memory list: could not mount the earlier copy, building it again"; return 1; }
    if ! grep -q "$LAUNCHER_ID" "$f" 2>/dev/null; then $UMOUNT_CMD "$f" 2>/dev/null; log "memory list: the earlier copy was mounted but the live file does not name Hearth, undone, building it again"; return 1; fi
    echo "$f" > "$DIR/mem-target"
    log "memory list: the copy made earlier is mounted again over $f (the file is unchanged, no search)"
    after_mount "$f" || return 2             # 2: mounted, but the restart or the check failed (the state is set)
}

patch_memlist () {
    t=$(cat "$DIR/mem-target" 2>/dev/null)   # P70e: the marker counts only while the live file really names Hearth
    if [ -n "$t" ] && grep -q "$LAUNCHER_ID" "$t" 2>/dev/null; then log "memory list: already changed ($t)"; return 0; fi
    if [ -n "$t" ]; then
        log "memory list: the marker was stale (the live file does not name Hearth)"
        rm -f "$DIR/mem-target"
        fast_mount "$t"; rc=$?
        case "$rc" in 0) return 0 ;; 2) return 1 ;; esac
    fi
    f=$(find_memfiles | head -n 1)
    [ -n "$f" ] || { log "memory list: no file with KeepOnLaunchEx found, nothing changed"; set_state no-list; return 1; }
    if grep -q "$LAUNCHER_ID" "$f" 2>/dev/null; then log "memory list: Hearth is already named in $f"; return 0; fi
    if [ ! -f "$DISCOVERED" ]; then touch "$DISCOVERED"; ( discover_one "$f" ) & fi     # P70d/P75b: in the background, only when the list is built (not when the earlier copy is reused)
    copy="$DIR/memlist.copy"
    awk -v id="$LAUNCHER_ID" '
        BEGIN { reg = 0; done = 0 }
        {
            line = $0
            if (!done && line ~ /KeepOnLaunchEx/) reg = 12
            if (!done && reg > 0) {
                if (index(line, "\"com.webos.app.home\"") > 0) { sub(/"com\.webos\.app\.home"/, "\"com.webos.app.home\",\"" id "\"", line); done = 1 }
                else if (index(line, "com.webos.app.home") > 0) { sub(/com\.webos\.app\.home/, "com.webos.app.home," id, line); done = 1 }
                reg--
            }
            print line
        }
        END { if (!done) exit 3 }' "$f" > "$copy" 2>/dev/null
    rc=$?
    if [ "$rc" != 0 ]; then log "memory list: the list in $f has no LG Home entry to copy the style from, nothing changed"; set_state no-home-entry; rm -f "$copy"; return 1; fi
    [ "$(wc -l < "$f")" = "$(wc -l < "$copy")" ] && [ "$(grep -c "$LAUNCHER_ID" "$copy")" = 1 ] || { log "memory list: the changed copy looks wrong, nothing changed"; set_state bad-copy; rm -f "$copy"; return 1; }
    case "$f" in
        *.json) if command -v node >/dev/null 2>&1; then
                    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$copy" >/dev/null 2>&1 || { log "memory list: the changed copy is not valid JSON, nothing changed"; set_state bad-json; rm -f "$copy"; return 1; }
                fi ;;
    esac
    sum_of "$f" > "$DIR/memlist.sum"          # of the TV's own file, before the copy covers it
    if ! $MOUNT_CMD --bind "$copy" "$f" 2>/dev/null; then log "memory list: could not mount the changed copy over $f, nothing changed"; set_state mount-failed; rm -f "$copy"; return 1; fi
    if ! grep -q "$LAUNCHER_ID" "$f" 2>/dev/null; then $UMOUNT_CMD "$f" 2>/dev/null; rm -f "$copy"; log "memory list: the copy was mounted but the live file does not name Hearth, undone"; set_state not-applied; return 1; fi
    echo "$f" > "$DIR/mem-target"
    log "memory list: Hearth added to the list in $f (changed copy mounted over it)"
    after_mount "$f"
}

unpatch_memlist () {
    [ -f "$DIR/mem-target" ] || return 0
    f=$(cat "$DIR/mem-target" 2>/dev/null)
    [ -n "$f" ] && $UMOUNT_CMD "$f" 2>/dev/null
    rm -f "$DIR/mem-target" "$DIR/memlist.copy" "$DIR/memlist.sum"
    log "memory list: put back ($f)"
    restart_mem
}

# ----- opening Hearth once after the change (only with the file "relaunch") -----

relaunch_hearth () {
    [ -f "$DIR/relaunch" ] || return 0
    $NAP 4
    running=$("$LUNA" -n 1 "$RUNNING_URI" '{}' 2>/dev/null | tr -d '\n')
    case "$running" in *"\"id\":\"$LAUNCHER_ID\""*) log "relaunch: not needed, Hearth is in memory"; return 0 ;; esac
    front=$("$LUNA" -n 1 "$FRONT_URI" '{}' 2>/dev/null)
    x=$(app_id_of "$front")
    case "$x" in
        ""|"$HOME_ID") "$LUNA" -n 1 "$LAUNCH_URI" "{\"id\":\"$LAUNCHER_ID\",\"keepAlive\":true}" >/dev/null 2>&1; log "relaunch: Hearth was not in memory (front: ${x:-none}), opened it with keepAlive" ;;
        *) log "relaunch: Hearth is not in memory but $x is in front, not interrupting" ;;
    esac
}

# ----- the watcher -----

log_why () {                             # what the system log says about Hearth (the memory manager names the app it closes)
    tail -n 600 "$SYSLOG" 2>/dev/null | grep -i "$LAUNCHER_ID" | grep -i -E 'MEMMGR|APP_CLOSED|clos|kill|keepAlive|pause|terminat|memory' | tail -n 6 | cut -c1-300 | while IFS= read -r l; do log "why:   $l"; done
}

check_job () {
    x="$1"
    $NAP "$DELAY"
    front=$("$LUNA" -n 1 "$FRONT_URI" '{}' 2>/dev/null)
    case "$front" in *"\"appId\":\"$LAUNCHER_ID\""*) log "check: Hearth is in front again"; return 0 ;; esac
    running=$("$LUNA" -n 1 "$RUNNING_URI" '{}' 2>/dev/null | tr -d '\n')
    case "$running" in
        *"$LAUNCHER_ID"*) log "check: ${DELAY}s after $x came to the front: Hearth IS in memory"; return 0 ;;
    esac
    case "$running" in *'"returnValue":false'*|"") log "check: the TV did not list running apps"; return 0 ;; esac
    log "check: ${DELAY}s after $x came to the front: Hearth is NOT in memory"
    log_why
}

handle () {
    x=$(app_id_of "$1")
    [ -n "$x" ] || return 0
    case "$x" in
        "$LAUNCHER_ID") log "front: Hearth"; return 0 ;;
        "$HOME_ID"|*screensaver*) return 0 ;;
    esac
    case "$x" in *[!A-Za-z0-9._-]*) return 0 ;; esac
    log "front: $x"
    [ -f "$CHECKPID" ] && kill "$(cat "$CHECKPID" 2>/dev/null)" 2>/dev/null     # a newer change of the app in front restarts the wait
    ( check_job "$x" ) &
    echo $! > "$CHECKPID"
}

watch_front () {
    if [ -f "$PIDFILE" ]; then
        other=$(cat "$PIDFILE" 2>/dev/null)
        if [ -n "$other" ] && [ "$other" != "$$" ] && kill -0 "$other" 2>/dev/null; then log "another watcher is already running (pid $other)"; return 0; fi
    fi
    echo $$ > "$PIDFILE"
    trap 'pkill -P $$ 2>/dev/null; [ "$(cat "$PIDFILE" 2>/dev/null)" = "$$" ] && rm -f "$PIDFILE"; exit 0' TERM INT
    log "watcher started (pid $$)"
    quick=0
    while true; do
        started=$(date +%s)
        "$LUNA" -i "$FRONT_URI" '{"subscribe":true}' 2>/dev/null | while IFS= read -r report; do handle "$report"; done
        if [ $(( $(date +%s) - started )) -lt 5 ]; then quick=$((quick + 1)); else quick=0; fi
        if [ "$quick" -ge 3 ]; then log "the subscription keeps ending: the watcher stops"; rm -f "$PIDFILE"; return 1; fi
        sleep 1
    done
}

stop_watcher () {
    pid=$(cat "$PIDFILE" 2>/dev/null)
    if [ -n "$pid" ]; then pkill -P "$pid" 2>/dev/null; kill -9 "$pid" 2>/dev/null; fi
    [ -f "$CHECKPID" ] && kill "$(cat "$CHECKPID" 2>/dev/null)" 2>/dev/null
    rm -f "$PIDFILE" "$CHECKPID"
}

watcher_running () {
    pid=$(cat "$PIDFILE" 2>/dev/null)
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# ----- commands -----

remove_all () {
    stop_watcher
    unpatch_memlist
    rm -f "$LINK"
    rm -rf "$DIR"
}

run () {
    if hearth_gone; then log "Hearth is not installed: removing the keep-ready files"; remove_all; return 0; fi
    is_on || return 0
    log "run: on"
    set_state working
    patch_memlist || { log "run: the memory list was not changed (state $(cat "$DIR/state" 2>/dev/null)), no watcher"; return 1; }
    is_on || { log "run: switched off meanwhile, this run ends"; return 0; }   # P70c: two runs started side by side
    set_state ok
    relaunch_hearth
    watch_front
}

case "${1:-boot}" in
    apply)
        case "$2" in
            off) log "apply: off"; remove_all; echo "result=off"; exit 0 ;;
            on) ;;
            *) echo "result=bad-argument"; exit 1 ;;
        esac
        [ -z "$3" ] || [ "$3" = relaunch ] || { echo "result=bad-argument"; exit 1; }
        mkdir -p "$DIR" || { echo "result=no-folder"; exit 1; }
        was_on=no; is_on && was_on=yes
        echo on > "$DIR/on"
        if [ "$3" = relaunch ]; then echo on > "$DIR/relaunch"; else rm -f "$DIR/relaunch"; fi
        set_state working
        rm -f "$DIR/level" "$DIR/preload-state"
        [ "$was_on" = no ] && rm -f "$DISCOVERED"
        ln -sf "$DIR/keepready.sh" "$LINK" 2>/dev/null
        stop_watcher
        log "apply: on"
        ( nohup sh "$DIR/keepready.sh" run >/dev/null 2>&1 </dev/null & )
        echo "result=ok"
        ;;
    status)
        if watcher_running; then w=running; else w=stopped; fi
        if [ -L "$LINK" ] || [ -f "$LINK" ]; then k=yes; else k=no; fi
        if [ -f "$DIR/mem-target" ]; then m=changed; else m=no; fi
        if is_on; then o=yes; else o=no; fi
        if [ -f "$DIR/relaunch" ]; then rl=yes; else rl=no; fi
        st=$(cat "$DIR/state" 2>/dev/null | tr -dc 'a-z-'); st="${st:-ok}"
        echo "on=$o watcher=$w linked=$k memlist=$m relaunch=$rl state=$st"
        ;;
    run) run ;;
    boot) ( nohup sh "$0" run >/dev/null 2>&1 </dev/null & ) ;;     # P75b: a new process, so its $$ is the pid the watcher records (inside ( ) $$ is the parent's, which exits at once: the pid file named a dead process and the next apply could not stop this watcher)
    discover) discover ;;
    *) echo "usage: keepready.sh apply on [relaunch]|off | status | boot | run | discover"; exit 1 ;;
esac
