#!/bin/sh
# Puts Hearth in LG Home's place (experimental). Written to the TV by the launcher; nothing to copy by hand.
#
# What it does: a small black "shim" app is bind-mounted over LG Home's own folder
# (/usr/palm/applications/com.webos.app.home), so the TV's app manager (sam) reads it as the app with LG Home's id.
# Everything that opens LG Home (Home button, Back out of the last app, waking from standby) then opens the shim.
# LG Home itself is never started, so it can never be seen. The shim is only a black page: a web app with LG Home's id
# gets no answer to any Luna call (seen on a webOS 7 TV: every call from the page timed out), so it cannot open Hearth
# itself. A small watcher, started here as root, does that: it is told by the TV that "LG Home" (the shim) is in front,
# and asks for Hearth at once. See cmd_watch.
#
# The watcher is started as early as it can be, before the mount exists: until Hearth holds LG Home's place (a restart
# of sam, about 15 s, after the start-up hook has run) it behaves as the helper of the release build does (LG Home can
# flash for a moment), and from then on it is what opens Hearth from the stand-in.
# The mount lives only in memory: a reboot puts LG Home back, and the start-at-boot link (47-launcher-takeover)
# does it all again about 25 s into the start. Nothing on the TV's flash is changed.
#
# Where the TV has no gentle way to make sam read the manifest (webOS 7 has neither configd's blocked-app list nor
# sam's blockSystemApp), the only way left is to restart sam. That is done only if the user has allowed it (the file
# allow-restart), the way Glasshouse does on firmware like that: reset systemd's failure counters, stop the AirPlay helper
# that hangs a polite restart, kill sam so systemd starts it again, start whatever it takes down with it, and open
# the app that was in front again. A start-up that does not finish is not repeated: see boot-attempt.
#
# The method (mount, make sam read the manifest again, then stop LG's own process) and the two ways of making sam read
# again are taken from the Glasshouse project (https://github.com/rorygallagher2024/glasshouse, MIT,
# Copyright (c) 2026 Rory Gallagher): server/lib/home-takeover.js, server/lib/samrescan.js, server/50-tvweb.sh.
#
# Usage: sh takeover.sh on | off | apply | stock | status | diagnose | boot
#   on        switch it on (and keep it on at boot). Prints applied, launcher-missing, files-missing, sam-refused, busy or failed.
#   off       switch it off: LG Home gets its place back. Prints removed.
#   apply     if it is switched on, make sure it is in place (cheap when it is). Same words as "on"; "off" if not switched on.
#   stock     LG's own Home is wanted now: put it back, and take the place again once LG Home has been left.
#             (Prints unsupported where LG Home can only be put back by restarting sam.)
#   boot      (also: no argument, as run from the startup folder) apply, in the background, after a restart.
#   status    one word per line: enabled, mounted, web (sam reports the shim), linked, watching, restart-allowed, restart-used.
#   watch     (internal) the watcher that opens Hearth whenever the shim comes to the front.
#   verify    (internal) after Hearth was asked for: still the shim in front a moment later? ask again; after three, switch off.
#   diagnose  everything needed to see what is going on.

DIR="${DIR:-/media/developer/launcher-takeover}"
APP_DIR="${APP_DIR:-/usr/palm/applications/com.webos.app.home}"
STAGE="${STAGE:-$DIR/stage}"
LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/$LAUNCHER_ID}"
LINK="${LINK:-/var/lib/webosbrew/init.d/47-launcher-takeover}"
FLAG="${FLAG:-$DIR/enabled}"
LOG="${LOG:-/tmp/launcher-takeover.log}"
LOCK="${LOCK:-/tmp/launcher-takeover.lock}"
GUARD_PID="${GUARD_PID:-/tmp/launcher-takeover-guard.pid}"
PROC="${PROC:-/proc}"
MOUNTS="${MOUNTS:-/proc/mounts}"
LUNA="${LUNA_SEND:-luna-send}"
MOUNT="${MOUNT_CMD:-mount}"
UMOUNT="${UMOUNT_CMD:-umount}"
KILL="${KILL_CMD:-kill}"
NAP="${NAP:-sleep}"                      # tests set it to "true" so nothing waits
WAIT_SAM="${WAIT_SAM:-16}"               # seconds to wait for sam to report a change, per method
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
KILLALL="${KILLALL:-killall}"
BLOCK_SCHEMA="${BLOCK_SCHEMA:-/etc/palm/schemas/sam/applicationManager.blockSystemApp.schema}"
ALLOW_RESTART="${ALLOW_RESTART:-$DIR/allow-restart}"   # the user's permission to restart sam
METHOD="${METHOD:-$DIR/method}"                        # says "restart" once the takeover has needed a restart of sam
BOOT_ATTEMPT="${BOOT_ATTEMPT:-$DIR/boot-attempt}"      # present while a start-up takeover has not been seen to finish
UPTIME_FILE="${UPTIME_FILE:-/proc/uptime}"
WATCH_PID="${WATCH_PID:-/tmp/launcher-takeover-watch.pid}"
VERIFY_PID="${VERIFY_PID:-/tmp/launcher-takeover-verify.pid}"
DEBOUNCE_S="${DEBOUNCE_S:-1}"
FRONT_URI=luna://com.webos.applicationManager/getForegroundAppInfo
ALIVE="${ALIVE_FILE:-/tmp/launcher-alive}"             # Hearth touches this whenever it is on screen (as under the release helper)
MARK="${MARK_FILE:-/tmp/launcher-takeover-mark}"       # touched when Hearth is asked for: it must touch ALIVE after that
KEEP_LOG="${KEEP_LOG:-/media/developer/launcher-takeover-last.log}"   # a copy of the log that survives a restart
LG_HOME=com.webos.app.home
NUDGE_ID=tld.my.customlauncher.rescan    # not an app: blocking it blocks nothing

log () { echo "$(date '+%H:%M:%S') takeover: $*" >> "$LOG"; }
# /tmp is gone after a restart; a copy is kept at the moments that matter, so a bad start can be read afterwards
keep_log () { cp "$LOG" "$KEEP_LOG" 2>/dev/null; }
lsend () { "$LUNA" -n 1 "$@" 2>/dev/null; }
flat () { tr -d '\n' | tr -s ' ' | cut -c1-240; }

is_mounted () { grep -q " $APP_DIR " "$MOUNTS" 2>/dev/null; }

# web: sam has the shim as LG Home. native: sam has LG's own. unknown: sam did not answer.
sam_type () {
    out=$(lsend luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$LG_HOME\"}" | tr -d '\n')
    case "$out" in
        *'"type": "web"'*|*'"type":"web"'*) echo web ;;
        *'"type"'*) echo native ;;
        *) echo unknown ;;
    esac
}

wait_for () {   # wait_for web|native [seconds]
    want="$1"; n="${2:-$WAIT_SAM}"
    while :; do
        [ "$(sam_type)" = "$want" ] && return 0
        n=$((n - 1)); [ "$n" -le 0 ] && return 1
        $NAP 1
    done
}

# sam reads an appinfo.json only when it scans. Where configd has LG's blocked-app list, adding an id no app has and
# putting the list back as it was makes sam scan again, without restarting it (Glasshouse: samrescan.js, 50-tvweb.sh).
sam_nudge () {
    raw=$(lsend luna://com.webos.service.config/getConfigs '{"configNames":["profile.blockedAppList"]}' | tr -d '\n')
    list=$(echo "$raw" | sed -n 's/.*"profile\.blockedAppList": *\(\[[^]]*\]\).*/\1/p')
    [ -n "$list" ] || { log "configd said: $(echo "$raw" | tr -s ' ' | cut -c1-240)"; return 1; }
    lg=$(echo "$list" | sed "s/\"$NUDGE_ID\"//g; s/, *,/,/g; s/\[ *,/[/; s/, *\]/]/")
    inner=$(echo "$lg" | sed 's/^\[ *//; s/ *\]$//')
    if [ -z "$inner" ]; then nudged="[\"$NUDGE_ID\"]"; else nudged="[$inner,\"$NUDGE_ID\"]"; fi
    lsend luna://com.webos.service.config/setConfigs "{\"configs\":{\"profile.blockedAppList\":$nudged}}" >/dev/null || return 1
    $NAP 2
    for _ in 1 2 3; do
        lsend luna://com.webos.service.config/setConfigs "{\"configs\":{\"profile.blockedAppList\":$lg}}" |
            grep -q '"returnValue": *true' && return 0
        $NAP 1
    done
    return 1
}

# Newer firmware ignores that list; there sam rereads one app on a block followed by a release. The release is always
# sent, so an app is never left blocked (a blocked app cannot launch).
sam_reread_app () {
    force=
    grep -q '"forceBlockSystemApp"' "$BLOCK_SCHEMA" 2>/dev/null && force=',"forceBlockSystemApp":false'
    reply=$(lsend luna://com.webos.applicationManager/blockSystemApp "{\"id\":\"$1\"$force}" | flat)
    log "blockSystemApp said: ${reply:-nothing}"
    if ! echo "$reply" | grep -q '"returnValue": *true'; then
        return 1       # no such method (or refused): nothing was blocked, so there is nothing to wait for
    fi
    # the release is always sent, and tried again if it fails: an app left blocked cannot launch
    for _ in 1 2 3; do
        reply=$(lsend luna://com.webos.applicationManager/releaseBlockSystemApp "{\"id\":\"$1\"}" | flat)
        if echo "$reply" | grep -q '"returnValue": *true'; then
            log "releaseBlockSystemApp said: $reply"
            return 0
        fi
        $NAP 1
    done
    log "releaseBlockSystemApp said: ${reply:-nothing}"
    return 1
}

# Is there a gentle way on this TV: configd's blocked-app list, or sam's own blockSystemApp?
gentle_possible () {
    [ -f "$BLOCK_SCHEMA" ] && return 0
    lsend luna://com.webos.service.config/getConfigs '{"configNames":["profile.blockedAppList"]}' |
        tr -d '\n' | grep -q '"profile\.blockedAppList": *\['
}

# May sam be restarted? By the user's say-so, or because the takeover has already needed it (taking it off needs it too).
restart_allowed () { [ -f "$ALLOW_RESTART" ] || [ "$(cat "$METHOD" 2>/dev/null)" = restart ]; }

fg_app () {
    lsend luna://com.webos.applicationManager/getForegroundAppInfo '{}' | tr -d '\n' | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p'
}

# sam and every unit that requires it, as systemctl lists them on the TV.
sam_units () {
    echo sam.service
    "$SYSTEMCTL" list-dependencies --reverse --plain --no-legend sam.service 2>/dev/null |
        sed -n 's/^[^A-Za-z0-9]*\([A-Za-z0-9@._-]*\.service\)$/\1/p'
}

# sam answers while it is still loading the home screen's tiles, so it counts as back once the launch points read
# the same size three times running.
wait_sam_back () {
    n=0; same=0; last=
    while [ "$n" -lt 30 ]; do
        sig=$(lsend luna://com.webos.applicationManager/listLaunchPoints '{}' | wc -c | tr -d ' ')
        if [ "${sig:-0}" -gt 100 ] && [ "$sig" = "$last" ]; then same=$((same + 1)); else same=0; fi
        last="$sig"
        [ "$same" -ge 2 ] && return 0
        n=$((n + 1))
        $NAP 1
    done
    return 1
}

# A unit that requires sam and was refused a restart (its own limit hit) is started again, so the TV is never left without inputs.
start_failed_dependents () {
    command -v "$SYSTEMCTL" >/dev/null 2>&1 || { command -v initctl >/dev/null 2>&1 && initctl restart eim >/dev/null 2>&1; return 0; }
    for u in $(sam_units); do
        if "$SYSTEMCTL" is-failed --quiet "$u" 2>/dev/null; then
            log "starting $u again"
            "$SYSTEMCTL" reset-failed "$u" >/dev/null 2>&1
            "$SYSTEMCTL" start --no-block "$u" >/dev/null 2>&1
        fi
    done
}

restore_app () {
    case "$1" in ""|"$LG_HOME"|com.webos.app.screensaver) return 0 ;; esac
    n=0
    while [ "$n" -lt 10 ]; do
        if lsend luna://com.webos.applicationManager/getForegroundAppInfo '{}' | grep -q '"returnValue": *true'; then
            lsend luna://com.webos.applicationManager/launch "{\"id\":\"$1\"}" >/dev/null
            log "opened $1 again"
            return 0
        fi
        n=$((n + 1))
        $NAP 1
    done
    log "could not open $1 again"
}

# Restarts sam (Glasshouse's way, apps.js restartSamNow): systemd limits restarts to 5 in 10 s, so the counters are cleared
# first; the AirPlay helper ignores a polite stop and would hold the restart up for 90 s, so it is killed; sam is killed
# outright and systemd starts it again within a second.
sam_restart () {
    saved=$(fg_app)
    log "restarting sam (the app in front was: ${saved:-unknown})"
    # the watcher's subscription dies with sam; a fresh one is started once sam is back and Hearth is in place (take_inner)
    stop_watcher
    if command -v "$SYSTEMCTL" >/dev/null 2>&1; then
        "$SYSTEMCTL" reset-failed $(sam_units | tr '\n' ' ') >/dev/null 2>&1
        "$KILLALL" -9 LunaExecutable >/dev/null 2>&1
        "$SYSTEMCTL" kill -s 9 sam.service >/dev/null 2>&1 || "$SYSTEMCTL" restart --no-block sam >/dev/null 2>&1
    elif command -v initctl >/dev/null 2>&1; then
        initctl restart sam >/dev/null 2>&1 || pkill -9 -x sam >/dev/null 2>&1
    else
        pkill -9 -x sam >/dev/null 2>&1
    fi
    $NAP 1
    wait_sam_back || log "sam did not settle in time"
    start_failed_dependents
    restore_app "$saved"
    keep_log
}

# Makes sam report web or native for LG Home: gently where the TV allows, by restarting sam only where the user allowed it.
reread () {   # reread web|native
    want="$1"
    [ "$(sam_type)" = "$want" ] && return 0
    if gentle_possible; then
        if sam_nudge; then
            wait_for "$want" && return 0
            log "the blocked-app list nudge did not make sam report $want"
        else
            log "no usable blocked-app list on this TV"
        fi
        if sam_reread_app "$LG_HOME"; then
            wait_for "$want" && return 0
            log "the block and release did not make sam report $want"
        fi
        reply=$(lsend luna://com.webos.applicationManager/scan '{}' | flat)
        log "scan said: ${reply:-nothing}"
        if echo "$reply" | grep -q '"returnValue": *true'; then
            wait_for "$want" 8 && return 0
            log "scan did not make sam report $want"
        fi
    else
        log "this TV has no gentle way to make sam read LG Home again (no blocked-app list, no blockSystemApp)"
    fi
    if restart_allowed; then
        sam_restart
        if wait_for "$want" 20; then
            if [ "$want" = web ]; then echo restart > "$METHOD"; else rm -f "$METHOD"; fi
            return 0
        fi
        log "sam did not report $want after being restarted"
    fi
    return 1
}

# What this TV's sam and configd look like, written to the log so a refusal can be understood.
probe () {
    log "probe ($1): getAppInfo said: $(lsend luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$LG_HOME\"}" | flat)"
    log "probe ($1): this folder's appinfo type: $(grep -o '"type"[^,]*' "$APP_DIR/appinfo.json" 2>/dev/null | head -1)"
    log "probe ($1): sam schemas: $(ls /etc/palm/schemas/sam 2>&1 | tr '\n' ' ' | cut -c1-300)"
    log "probe ($1): systemctl: $(command -v systemctl || echo none), initctl: $(command -v initctl || echo none)"
    log "probe ($1): processes: $(ps 2>/dev/null | grep -i '[s]am\|[W]ebAppMgr' | head -4 | tr -s ' ' | tr '\n' '|' | cut -c1-300)"
}

# LG Home's own process(es), found before the shim exists so the shim's page can never be mistaken for it.
lg_home_pids () {
    for d in "$PROC"/[0-9]*; do
        pid="${d##*/}"
        [ "$pid" = "$$" ] && continue
        cmd=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null) || continue
        case "$cmd" in
            *WebAppMgr*|*luna-send*|*takeover.sh*|*grep*|*pgrep*|*pkill*) continue ;;
            *"$LG_HOME "*|*"$LG_HOME/"*) echo "$pid" ;;
        esac
    done
}

# The shim: opens Hearth whenever the TV opens "LG Home".
stage () {
    mkdir -p "$STAGE" || return 1
    cp "$DIR/shim.html" "$STAGE/index.html" || return 1
    cp "$LAUNCHER/icon.png" "$STAGE/icon.png" 2>/dev/null
    cp "$LAUNCHER/largeIcon.png" "$STAGE/largeIcon.png" 2>/dev/null
    cat > "$STAGE/appinfo.json" <<'APPINFO'
{
  "id": "com.webos.app.home",
  "version": "1.0.0",
  "vendor": "hearth",
  "type": "web",
  "main": "index.html",
  "title": "Home",
  "icon": "icon.png",
  "largeIcon": "largeIcon.png",
  "iconColor": "#000000",
  "bgColor": "#000000",
  "resolution": "1920x1080",
  "visible": false,
  "disableBackHistoryAPI": true,
  "transparent": false,
  "appCategory": ["home"]
}
APPINFO
}

do_umount () {
    n=0
    while is_mounted && [ "$n" -lt 4 ]; do
        "$UMOUNT" "$APP_DIR" 2>>"$LOG" || "$UMOUNT" -l "$APP_DIR" 2>>"$LOG"
        n=$((n + 1))
    done
    if is_mounted; then return 1; fi
    return 0
}

lock () {
    if [ -f "$LOCK" ]; then
        other=$(cat "$LOCK" 2>/dev/null)
        if [ -n "$other" ] && [ "$other" != "$$" ] && kill -0 "$other" 2>/dev/null; then return 1; fi
    fi
    echo "$$" > "$LOCK"
    return 0
}
unlock () { rm -f "$LOCK"; }

# LG Home back in its own place: unmount, make sam read LG's manifest, and only then close the shim's page.
# (Changing the app's type under a running instance leaves the TV with a black screen, so the page goes last.)
put_back () {
    stop_watcher
    do_umount || { log "the mount is held: LG Home could not be put back"; return 1; }
    if reread native; then
        lsend luna://com.palm.webappmanager/killApp "{\"appId\":\"$LG_HOME\"}" >/dev/null
        log "LG Home is back in its place"
        return 0
    fi
    log "sam still reports the shim after unmounting: restart the TV to finish"
    return 1
}

# Hearth in LG Home's place. Prints one result word.
take_inner () {
    [ -f "$LAUNCHER/appinfo.json" ] || { log "Hearth is not installed: leaving LG Home alone"; echo launcher-missing; return 2; }
    [ -f "$DIR/shim.html" ] || { log "shim.html is missing"; echo files-missing; return 4; }
    stage || { log "could not write the shim"; echo failed; return 1; }
    if is_mounted && [ "$(sam_type)" = web ]; then start_watcher; echo applied; return 0; fi
    if ! gentle_possible && ! restart_allowed; then
        log "this TV can only do it by restarting sam, which has not been allowed: nothing was changed"
        echo needs-restart
        return 6
    fi
    pids=$(lg_home_pids)
    probe before
    if ! is_mounted; then
        "$MOUNT" --bind "$STAGE" "$APP_DIR" 2>>"$LOG"
        is_mounted || { log "the mount did not take"; echo failed; return 1; }
    fi
    if reread web; then
        # sam has the shim; now LG's own process can go (where it was in front, the TV opens Home again as the shim)
        [ -n "$pids" ] && $KILL $pids 2>/dev/null
        log "Hearth is in LG Home's place (stopped LG Home: ${pids:-it was not running})"
        start_watcher
        echo applied
        return 0
    fi
    log "sam did not take the shim as LG Home: undoing"
    probe refused
    put_back
    probe after-undo
    echo sam-refused
    return 3
}

take () {
    lock || { echo busy; return 5; }
    take_inner
    rc=$?
    unlock
    return $rc
}

last_word () { tail -n 1; }

alive () { [ -f "$1" ] && other=$(cat "$1" 2>/dev/null) && [ -n "$other" ] && kill -0 "$other" 2>/dev/null; }

start_watcher () {
    alive "$WATCH_PID" && return 0
    log "starting the watcher"
    [ -n "$DRY_RUN" ] && return 0
    ( nohup sh "$0" watch >/dev/null 2>&1 </dev/null & )
}

# (a stop request is only noticed when the command it is waiting for ends, so the watcher and its children are killed outright)
stop_watcher () {
    pid=$(cat "$WATCH_PID" 2>/dev/null)
    if [ -n "$pid" ]; then
        pkill -9 -P "$pid" 2>/dev/null
        kill -9 "$pid" 2>/dev/null
    fi
    rm -f "$WATCH_PID"
}

open_hearth () {
    "$LUNA" -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$LAUNCHER_ID\",\"params\":{}}" 2>/dev/null
}

is_launcher_report () {
    case "$1" in
        *"\"appId\":\"$LAUNCHER_ID\""*|*"\"appId\": \"$LAUNCHER_ID\""*) return 0 ;;
    esac
    return 1
}

is_home_report () {
    case "$1" in
        *'"appId":"com.webos.app.home"'*|*'"appId": "com.webos.app.home"'*) return 0 ;;
    esac
    return 1
}

# webOS 4.x: Home opens LG's full-screen overlay (com.webos.app.fullhome), which the stand-in does not replace. It is
# usually shown over the app in front without becoming it (then only "Set Hearth as the TV's Home app" helps), but
# where the TV does report it in front, Hearth is opened as for LG Home.
is_full_home_report () {
    case "$1" in
        *'"appId":"com.webos.app.fullhome"'*|*'"appId": "com.webos.app.fullhome"'*) return 0 ;;
    esac
    return 1
}

# One report from the TV about the app in front. The launch comes first, so the hand-over is as quick as it can be.
home_seen=0
last_open=0
watch_report () {
    case "$1" in
        *'"appId"'*) ;;
        *) return ;;                                   # not a report about the app in front
    esac
    if ! is_home_report "$1" && ! is_full_home_report "$1"; then home_seen=0; return; fi
    now="${FAKE_NOW:-$(date +%s)}"
    # a repeat report while it is still in front: not again at once
    if [ "$home_seen" = 1 ] && [ $((now - last_open)) -lt "$DEBOUNCE_S" ]; then return; fi
    home_seen=1
    [ -f "$LAUNCHER/appinfo.json" ] || { log "watch: Hearth is not installed: switching the takeover off"; ( sh "$0" off >/dev/null 2>&1 & ); return; }
    touch "$MARK"
    open_hearth >/dev/null
    last_open="$now"
    if is_full_home_report "$1"; then
        log "watch: LG's full-screen Home (webOS 4.x) is in front: asked for Hearth"
    elif is_mounted; then
        log "watch: the stand-in is in front: asked for Hearth"
        # (only where the stand-in is in place: before that this is the helper's job, and LG Home in front is no failure)
        if [ -z "$DRY_RUN" ]; then ( nohup sh "$0" verify >/dev/null 2>&1 </dev/null & ); fi
    else
        log "watch: LG Home is in front (the stand-in is not in place yet): asked for Hearth"
    fi
}

cmd_watch () {
    if alive "$WATCH_PID" && [ "$other" != "$$" ]; then exit 0; fi
    echo "$$" > "$WATCH_PID"
    trap 'pkill -P $$ 2>/dev/null; rm -f "$WATCH_PID"; exit 0' TERM INT
    log "watcher started (pid $$)"
    quick=0
    while [ -f "$FLAG" ]; do
        started=$(date +%s)
        "$LUNA" -i "$FRONT_URI" '{"subscribe":true}' 2>/dev/null | while IFS= read -r report; do watch_report "$report"; done
        [ -n "$DRY_RUN" ] && break
        if [ $(( $(date +%s) - started )) -lt 5 ]; then quick=$((quick + 1)); else quick=0; fi
        if [ "$quick" -ge 2 ]; then
            log "watch: the subscription keeps ending: asking once a second instead"
            while [ -f "$FLAG" ]; do
                watch_report "$(lsend "$FRONT_URI" '{}')"
                sleep 1
            done
        fi
        sleep 1
    done
    log "watcher stopped"
    rm -f "$WATCH_PID"
}

# After Hearth was asked for: has it shown itself? It must touch the alive file after the mark, as under the release helper:
# the TV can report an app in front when its process has been closed, which is a black screen, so "something other than
# LG Home is in front" is not proof. If not, ask again; on the third ask Hearth is closed first, so it starts afresh.
# Hearth can take 20 s to load on a slow TV, so it is given time: six more asks, six seconds apart. Then the takeover
# is switched off, so a TV is never left on a black screen for good.
cmd_verify () {
    if alive "$VERIFY_PID" && [ "$other" != "$$" ]; then exit 0; fi
    echo "$$" > "$VERIFY_PID"
    [ -f "$MARK" ] || touch "$MARK"
    n=0
    while [ "$n" -le 6 ]; do
        $NAP 6
        if [ -f "$ALIVE" ] && [ "$ALIVE" -nt "$MARK" ]; then rm -f "$VERIFY_PID"; exit 0; fi   # Hearth has shown itself
        front=$(lsend "$FRONT_URI" '{}')
        if ! is_home_report "$front" && ! is_launcher_report "$front"; then rm -f "$VERIFY_PID"; exit 0; fi   # another app is in front
        [ "$n" -eq 6 ] && break
        n=$((n + 1))
        if is_home_report "$front"; then where="the stand-in"; else where="Hearth, reported in front"; fi
        log "verify: Hearth has not shown itself ($where is in front): asking again ($n of 6)"
        if [ "$n" -eq 3 ]; then
            log "verify: closing Hearth so it starts afresh"
            lsend luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$LAUNCHER_ID\"}" >/dev/null
            $NAP 1
        fi
        touch "$MARK"
        open_hearth >/dev/null
    done
    log "verify: Hearth did not show itself after six more tries: switching the takeover off"
    keep_log
    rm -f "$VERIFY_PID"
    sh "$0" off >/dev/null 2>&1
}

cmd_on () {
    [ -f "$LAUNCHER/appinfo.json" ] || { echo launcher-missing; return 2; }
    [ -f "$DIR/shim.html" ] || { echo files-missing; return 4; }
    : > "$FLAG"
    result=$(take | last_word)
    case "$result" in
        applied)
            mkdir -p "$(dirname "$LINK")" 2>/dev/null
            ln -sf "$DIR/takeover.sh" "$LINK" 2>/dev/null || log "could not add the start-at-boot link"
            ;;
        busy) ;;
        *) rm -f "$FLAG" "$LINK" ;;
    esac
    echo "$result"
}

stop_guard () {
    pid=$(cat "$GUARD_PID" 2>/dev/null)
    [ -n "$pid" ] && [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
    rm -f "$GUARD_PID"
}

cmd_off () {
    log "off: switching the takeover off"
    keep_log
    stop_guard
    stop_watcher
    rm -f "$FLAG" "$LINK"
    if lock; then
        if is_mounted; then put_back; fi
        unlock
    else
        log "off: another run holds the lock; waiting"
        $NAP 5
        if is_mounted; then put_back; fi
    fi
    echo removed
}

# LG's own Home is wanted: put it back now, and take the place again once LG Home has been left.
cmd_stock () {
    if [ "$(cat "$METHOD" 2>/dev/null)" = restart ]; then
        log "stock: LG Home can only be put back by restarting sam again; not done"
        echo unsupported
        return 0
    fi
    stop_guard
    stop_watcher
    if is_mounted; then
        lock || { echo busy; return 5; }
        put_back
        unlock
    fi
    if [ -z "$DRY_RUN" ]; then ( nohup sh "$0" guard >/dev/null 2>&1 </dev/null & ); fi
    echo stock
}

# Waits for LG Home to have been in front and left again (or 90 s), then takes the place again.
cmd_guard () {
    echo "$$" > "$GUARD_PID"
    trap 'rm -f "$GUARD_PID"; exit 0' TERM INT
    seen=0; waited=0
    while [ -f "$FLAG" ]; do
        front=$(lsend luna://com.webos.applicationManager/getForegroundAppInfo '{}' | tr -d '\n')
        case "$front" in
            *"\"appId\": \"$LG_HOME\""*|*"\"appId\":\"$LG_HOME\""*) seen=1 ;;
            *)
                if [ "$seen" = 1 ] || [ "$waited" -ge 90 ]; then
                    $NAP 1
                    result=$(take | last_word)
                    log "guard: LG Home was left: $result"
                    break
                fi
                ;;
        esac
        $NAP 2
        waited=$((waited + 2))
        [ -n "$DRY_RUN" ] && [ "$waited" -ge 8 ] && break
    done
    rm -f "$GUARD_PID"
}

cmd_apply () {
    [ -f "$FLAG" ] || { echo off; return 0; }
    # at once, whatever else is decided below: from now on Home opens Hearth (with a flash of LG Home until the stand-in is in place)
    start_watcher
    if [ -L "$LINK" ] && [ "$(cat "$METHOD" 2>/dev/null)" = restart ] && ! is_mounted; then
        up=$(cut -d. -f1 "$UPTIME_FILE" 2>/dev/null)
        # the start-up hook is about to do it; restarting sam this early in a start would be asking for trouble
        if [ "${up:-999}" -lt 120 ]; then echo busy; return 0; fi
    fi
    take
}

boot_job () {
    # Where this needs sam restarted, a start-up that never finishes (the TV left black and power-cycled) is not repeated:
    # the mark is only taken off once the take has come back, healthy or not.
    [ "$(cat "$METHOD" 2>/dev/null)" = restart ] && : > "$BOOT_ATTEMPT"
    n=0
    while [ "$n" -lt 2 ]; do
        result=$(take | last_word)
        log "boot, try $((n + 1)): $result"
        case "$result" in applied|launcher-missing|files-missing|needs-restart) break ;; esac
        n=$((n + 1))
        $NAP 15
    done
    rm -f "$BOOT_ATTEMPT"
    # not in place (this TV would not take it): the watcher still works as the release build's helper does
    case "$result" in applied) ;; *) [ -f "$FLAG" ] && [ -f "$LAUNCHER/appinfo.json" ] && start_watcher ;; esac
    keep_log
}

cmd_boot () {
    [ -f "$FLAG" ] || exit 0
    if [ -f "$BOOT_ATTEMPT" ]; then
        log "boot: the last start-up takeover was not seen to finish, so it is switched off (LG Home stays)"
        rm -f "$BOOT_ATTEMPT" "$FLAG" "$LINK" "$METHOD"
        exit 0
    fi
    log "boot: Hearth takes LG Home's place"
    start_watcher
    # a block cut short in an earlier run would leave LG Home unable to launch
    lsend luna://com.webos.applicationManager/releaseBlockSystemApp "{\"id\":\"$LG_HOME\"}" >/dev/null
    if [ -n "$DRY_RUN" ]; then boot_job; else ( nohup sh "$0" bootjob >/dev/null 2>&1 </dev/null & ); fi
}

cmd_status () {
    [ -f "$FLAG" ] && echo enabled
    is_mounted && echo mounted
    [ "$(sam_type)" = web ] && echo web
    [ -L "$LINK" ] && echo linked
    alive "$WATCH_PID" && echo watching
    [ -f "$ALLOW_RESTART" ] && echo restart-allowed
    [ "$(cat "$METHOD" 2>/dev/null)" = restart ] && echo restart-used
    true
}

cmd_diagnose () {
    {
    echo "== time"; date
    echo "== files"; ls -l "$DIR" "$STAGE" 2>&1
    echo "== switched on (flag file)?"; ls -l "$FLAG" 2>&1
    echo "== start-at-boot link"; ls -l "$LINK" 2>&1
    echo "== restart allowed / method used / start-up attempt pending"; ls -l "$ALLOW_RESTART" "$METHOD" "$BOOT_ATTEMPT" 2>&1
    echo "== mounted over LG Home's folder?"; grep " $APP_DIR " "$MOUNTS" || echo "no"
    echo "== what sam has for LG Home (type web = the shim)"; lsend luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$LG_HOME\"}"
    echo "== LG Home process(es) (should be none while the shim has the place)"; lg_home_pids
    echo "== app in front"; lsend luna://com.webos.applicationManager/getForegroundAppInfo '{}'
    echo "== which app the Home button opens (defaultApps.home; com.webos.app.fullhome on webOS 4.x is not replaced by the stand-in)"
    lsend luna://com.webos.settingsservice/getSystemSettings '{"category":"general","keys":["defaultApps"]}'
    echo "== is Hearth installed?"; ls "$LAUNCHER" 2>&1 | head -5
    echo "== the watcher that opens Hearth (pid file; should be alive while the takeover is on)"; cat "$WATCH_PID" 2>&1; alive "$WATCH_PID" && echo alive || echo "not running"
    echo "== the guard (runs only after 'LG Home' was chosen in Hearth)"; cat "$GUARD_PID" 2>&1
    echo "== log"; tail -n 60 "$LOG" 2>&1
    echo "== end"
    } 2>&1 | tee /tmp/launcher-takeover-diagnose.txt
}

case "${1:-boot}" in
    on) cmd_on ;;
    off) cmd_off ;;
    apply) cmd_apply ;;
    stock) cmd_stock ;;
    boot) cmd_boot ;;
    bootjob) boot_job ;;
    guard) cmd_guard ;;
    watch) cmd_watch ;;
    verify) cmd_verify ;;
    status) cmd_status ;;
    diagnose) cmd_diagnose ;;
    *) echo "usage: takeover.sh on|off|apply|stock|status|diagnose|boot"; exit 1 ;;
esac
