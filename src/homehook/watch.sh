#!/bin/sh
# Watches which app is in front. When the TV brings LG Home to the front (Home button, leaving
# an app with Back, boot) it opens the launcher instead, then CHECKS that the launcher really
# showed itself and asks again if it did not. Started by apply.sh; stopped by a reboot or by
# turning the setting off. Writes to /tmp/launcher-homehook.log.
#
# It listens to the TV's own "app in front" reports (a subscription). If that subscription keeps
# ending at once on some TV, it asks once a second instead.
#
# How it knows the launcher showed itself: the launcher touches /tmp/launcher-alive each time it
# becomes visible (when the setting is on). After opening it, this script waits a few seconds and
# looks for that file being newer than its own mark.

LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/tld.my.customlauncher}"
LUNA="${LUNA_SEND:-luna-send}"
PIDFILE="${PIDFILE:-/tmp/launcher-homehook-watch.pid}"
LOG="${LOG:-/tmp/launcher-homehook.log}"
ALLOW="${ALLOW:-/tmp/launcher-allow-stock-home}"     # exists while the user asked for LG's own Home
ALIVE="${ALIVE:-/tmp/launcher-alive}"                # touched by the launcher whenever it becomes visible
MARK="${MARK:-/tmp/launcher-launch-mark}"            # touched when the launcher is asked for
VLOCK="${VLOCK:-/tmp/launcher-verify-lock}"          # holds the time a check started: only one check runs at a time
VFIX="${VFIX:-/tmp/launcher-verify-fix}"             # holds the time a check last had to ask for the launcher again
FRONT_URI="luna://com.webos.applicationManager/getForegroundAppInfo"
HOME_PATTERN='*"appId":"com.webos.app.home"*'
# webOS 4.x: Home opens LG's full-screen overlay (com.webos.app.fullhome) instead. It is usually shown over the app in
# front without becoming it (then only "Set Hearth as the TV's Home app" helps), but where the TV does report it, it is
# handled like LG Home. (PR #18, Obednal97)
FULLHOME_PATTERN='*"appId":"com.webos.app.fullhome"*'
LAUNCHER_PATTERN="*\"appId\":\"$LAUNCHER_ID\"*"
# webOS 3 has no LG Home app: Home shows a launcher bar over the app in front, which never changes
# the app in front. The surface manager logs each time the bar is shown, so on those TVs this
# script watches the system log for that line instead.
HOME_APP_DIR="${HOME_APP_DIR:-/usr/palm/applications/com.webos.app.home}"
SYSLOG="${SYSLOG:-/var/log/messages}"
BAR_PATTERN='*NL_HOME_SHOWN*'
BAR_ON_LAUNCHER="*\"foregroundId\":\"$LAUNCHER_ID\"*"

log () { { read _up _ < /proc/uptime; } 2>/dev/null; echo "$(date '+%H:%M:%S') up=${_up%%.*}s watcher: $*" >> "$LOG"; }   # P70e: no extra process for the uptime
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

# "Keep Hearth ready" (on; its own script makes the file) makes every opening that starts the launcher ask for keepAlive,
# so the TV keeps the launcher in memory when another app is opened (P69, one switch since P73).
KEEP_FLAG="${KEEP_FLAG:-/media/developer/launcher-keepready/on}"
# P70e: the clock and the log note use shell built-ins only (no extra process while the hand-over is running).
now_cs () { { read _u _ < /proc/uptime; } 2>/dev/null; NOW_CS="${_u%.*}${_u#*.}"; }   # uptime in 1/100 s
LAUNCH_NOTE="no keepAlive"
keep_note () { echo "$LAUNCH_NOTE"; }   # for the log: how the last opening was made, and how long it took
open_launcher () {
    # keepAlive only when the launcher is not in memory: a relaunch of a kept page that carries launch parameters made the TV
    # load the page again (P70c; TV log of P70b). A plain launch of a kept page is just brought to the front.
    if [ -s "$KEEP_FLAG" ]; then
        now_cs; t0="$NOW_CS"
        run=$("$LUNA" -n 1 luna://com.webos.applicationManager/running '{}' 2>/dev/null)
        now_cs; tq=$(( (NOW_CS - t0) * 10 ))
        case "$run" in
            *"\"id\":\"$LAUNCHER_ID\""*)
                "$LUNA" -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$LAUNCHER_ID\"}" >/dev/null 2>&1
                now_cs; LAUNCH_NOTE="keep on, plain launch (launcher in memory), running-query $tq ms, launch done $(( (NOW_CS - t0) * 10 )) ms"
                return ;;
        esac
        "$LUNA" -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$LAUNCHER_ID\",\"keepAlive\":true}" >/dev/null 2>&1
        now_cs; LAUNCH_NOTE="keep on, keepAlive launch (launcher not in memory), running-query $tq ms, launch done $(( (NOW_CS - t0) * 10 )) ms"
    else
        "$LUNA" -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$LAUNCHER_ID\"}" >/dev/null 2>&1
        LAUNCH_NOTE="no keepAlive"
    fi
}

# After the launcher was asked for: wait, and if it has not shown itself (or LG Home is still
# in front) ask again, up to three times. Runs in the background.
verify () {
    [ -f "$MARK" ] || touch "$MARK"
    tries=0
    polls="${VERIFY_FIRST:-8}"                                   # P67: a reloaded page needs 5-6.5 s to draw its first frame
    while [ "$tries" -lt 3 ]; do
        waited=0
        while [ "$waited" -lt "$polls" ]; do                     # one-second steps; stops as soon as the launcher shows itself
            sleep "${VERIFY_WAIT:-1}"
            waited=$((waited + 1))
            [ -f "$ALIVE" ] && [ "$ALIVE" -nt "$MARK" ] && return   # the launcher has shown itself
            [ -f "$ALLOW" ] && return                                # LG's own Home was asked for
        done
        polls="${VERIFY_LATER:-4}"
        front=$("$LUNA" -n 1 "$FRONT_URI" '{}' 2>/dev/null)
        case "$front" in
            $HOME_PATTERN|$FULLHOME_PATTERN|$LAUNCHER_PATTERN) ;; # nothing showing yet: ask again
            *) return ;;                                         # another app is in front: done
        esac
        tries=$((tries + 1))
        case "$front" in
            $HOME_PATTERN|$FULLHOME_PATTERN) where="LG Home" ;;
            *) where="the launcher" ;;
        esac
        log "the launcher has not shown itself ($where is in front): opening it again (try $tries of 3; $(keep_note))"
        echo "${FAKE_NOW:-$(date +%s)}" > "$VFIX"
        open_launcher
        touch "$MARK"
    done
}

# Runs a check in the background, unless one is already running. (Every report that the launcher is in
# front used to start its own check; with several at once, each could ask for the launcher again and
# take the screen back from an app that was just being opened, over and over.) A lock older than 30 s
# is taken to be left over.
start_verify () {
    [ -n "$NO_VERIFY" ] && return
    now="${FAKE_NOW:-$(date +%s)}"
    if [ -f "$VLOCK" ]; then
        began=$(cat "$VLOCK" 2>/dev/null); began="${began:-0}"
        [ $((now - began)) -lt 30 ] && return
    fi
    echo "$now" > "$VLOCK"
    ( ( verify; rm -f "$VLOCK" ) >/dev/null 2>&1 & )
}

# True when a check had to ask for the launcher again less than 15 s ago.
recently_fixed () {
    now="${FAKE_NOW:-$(date +%s)}"
    [ -f "$VFIX" ] || return 1
    at=$(cat "$VFIX" 2>/dev/null); at="${at:-0}"
    [ $((now - at)) -lt 15 ]
}

# One report from the TV about the app in front. The launch comes first (no commands are run
# before it, so the hand-over is as quick as it can be); the log line and the check come after.
was_home=0
last_launch=0
handle () {
    line="$1"
    case "$line" in
        *'"appId":"'*) ;;
        *) return ;;                                  # not a report about the app in front
    esac
    case "$line" in
        $HOME_PATTERN|$FULLHOME_PATTERN)
            if [ "$was_home" = 1 ]; then              # LG Home was already in front: a repeat report
                now="${FAKE_NOW:-$(date +%s)}"
                [ $((now - last_launch)) -lt 3 ] && return
            fi
            was_home=1
            [ -f "$ALLOW" ] && return                 # the user asked for LG's own Home: leave it
            [ -f "$LAUNCHER/appinfo.json" ] || return # nothing to open (launcher uninstalled)
            open_launcher
            last_launch="${FAKE_NOW:-$(date +%s)}"
            log "LG Home is in front: opened the launcher ($(keep_note))"
            touch "$MARK"                             # a check that is already running waits for this opening
            start_verify
            ;;
        $LAUNCHER_PATTERN)
            # The TV says the launcher is in front. Make sure it is really there (the TV can report
            # an app in front when its process has been closed, which is a black screen). Not right
            # after the watcher itself opened the launcher or asked for it again: that opening is
            # already being checked, and checking again could take the screen back from an app.
            was_home=0
            now="${FAKE_NOW:-$(date +%s)}"
            if [ $((now - last_launch)) -ge 15 ] && ! recently_fixed; then
                log "the launcher is in front: checking that it really showed itself"
                touch "$MARK"
                start_verify
            fi
            ;;
        *)
            was_home=0
            # LG Home is no longer in front: the request to see it is over (after a short grace
            # period, because the request is made just before LG Home arrives)
            if [ -f "$ALLOW" ]; then
                now="${FAKE_NOW:-$(date +%s)}"
                since=$(cat "$ALLOW" 2>/dev/null); since="${since:-0}"
                [ $((now - since)) -gt 10 ] && rm -f "$ALLOW"
            fi
            ;;
    esac
}

# One "home bar shown" line from the system log (webOS 3). Opens the launcher unless it is already
# the app under the bar, or the user asked for LG's own Home in the last 10 seconds.
handle_bar () {
    line="$1"
    case "$line" in
        $BAR_PATTERN) ;;
        *) return ;;
    esac
    case "$line" in
        $BAR_ON_LAUNCHER) return ;;
    esac
    if [ -f "$ALLOW" ]; then
        now="${FAKE_NOW:-$(date +%s)}"
        since=$(cat "$ALLOW" 2>/dev/null); since="${since:-0}"
        rm -f "$ALLOW"
        [ $((now - since)) -le 10 ] && return
    fi
    [ -f "$LAUNCHER/appinfo.json" ] || return
    open_launcher
    log "the home bar was shown: opened the launcher ($(keep_note))"
    start_verify
}

# Test modes: read reports from standard input (a line "TIME n" sets the clock), or run the check once.
if [ -n "$WATCH_STDIN" ]; then
    while IFS= read -r report; do
        case "$report" in
            "TIME "*) FAKE_NOW="${report#TIME }" ;;
            *) handle "$report" ;;
        esac
    done
    exit 0
fi
if [ -n "$WATCH_BAR_STDIN" ]; then
    while IFS= read -r report; do
        case "$report" in
            "TIME "*) FAKE_NOW="${report#TIME }" ;;
            *) handle_bar "$report" ;;
        esac
    done
    exit 0
fi
if [ -n "$WATCH_VERIFY_ONLY" ]; then
    verify
    exit 0
fi

# Only one watcher at a time.
if [ -f "$PIDFILE" ]; then
    other=$(cat "$PIDFILE" 2>/dev/null)
    if [ -n "$other" ] && [ "$other" != "$$" ] && kill -0 "$other" 2>/dev/null; then
        log "another watcher is already running (pid $other): exiting"
        exit 0
    fi
fi
echo $$ > "$PIDFILE"
rm -f "$VLOCK" "$VFIX"
# (a stop request is only noticed when the current command ends, so the launcher stops the watcher with kill -9 instead)
trap 'pkill -P $$ 2>/dev/null; [ "$(cat "$PIDFILE" 2>/dev/null)" = "$$" ] && rm -f "$PIDFILE"; exit 0' TERM INT
log "started (pid $$, $(fdnote))"

if [ ! -d "$HOME_APP_DIR" ]; then
    # webOS 3: look at the end of the system log a few times a second. Reading the last lines
    # (rather than following the file) keeps working when the log is rotated.
    log "no LG Home app on this TV: watching the system log for the home bar"
    last=$(tail -n 40 "$SYSLOG" 2>/dev/null | grep NL_HOME_SHOWN | tail -n 1)
    while true; do
        usleep 400000 2>/dev/null || sleep 1
        line=$(tail -n 40 "$SYSLOG" 2>/dev/null | grep NL_HOME_SHOWN | tail -n 1)
        if [ -n "$line" ] && [ "$line" != "$last" ]; then
            last="$line"
            handle_bar "$line"
        fi
    done
fi

quick_ends=0
while true; do
    started=$(date +%s)
    "$LUNA" -i "$FRONT_URI" '{"subscribe":true}' 2>/dev/null | while IFS= read -r report; do handle "$report"; done
    if [ $(( $(date +%s) - started )) -lt 5 ]; then quick_ends=$((quick_ends + 1)); else quick_ends=0; fi
    if [ "$quick_ends" -ge 2 ]; then
        log "the subscription keeps ending: asking once a second instead"
        while true; do
            handle "$("$LUNA" -n 1 "$FRONT_URI" '{}' 2>/dev/null)"
            sleep 1
        done
    fi
    sleep 1
done
