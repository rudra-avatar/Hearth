#!/bin/sh
# Hearth key engine (test): starts the key hook that lets a remote button open Hearth, without any other app.
# Written to the TV by the launcher; nothing to copy by hand. Runs as root through the Homebrew Channel.
#
# What it does: injects the bundled library libinputhookpp.so (Input Hook's, GPL-3.0) into the TV's input processes with
# the bundled injector `ezinject`, exactly as the Input Hook app does (same processes, same logs /tmp/lginput-hook-*.log,
# same marker /tmp/inputhook, same settings file /home/root/.config/lginputhook/keybinds.json). Because the marker is the
# same, this does nothing when the Input Hook app has already started the hook in this boot, and the two never inject twice.
# The injection lives in memory only; a restart removes it. The "boot" link starts it again at every start while a button
# is mapped. Nothing on the TV's flash is changed except the settings file and the link.
#
# Failsafe: if Hearth is no longer installed, the start-up link (which outlives an uninstall) cleans up instead of starting the
# hook: Hearth's own button entry is taken out of the settings file (otherwise the Home button would try to open an app that
# is gone), its start-up link and its files are removed. When the Input Hook app is not installed either, what is left of it
# is removed too: the whole settings file and Input Hook's start-up script. A separately installed Input Hook app (and
# the buttons set in it) is never touched.
#
# Usage: sh homehook.sh status | start | boot | enable | disable
#   status   one line per fact: injected=0|1 files=0|1 ready=<n> link=0|1 hookapp=0|1
#   start    inject if not yet done this boot. Last line: result=already|started|nofiles|notarget|failed
#   cleanup  what the failsafe does (only when Hearth is not installed)
#   boot     (also: no argument, as run from the startup folder) start in the background, after waiting until the TV's input
#            service is up
#   enable   create the start-up link      disable   remove it

LAUNCHER_ID="tld.my.customlauncher"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/$LAUNCHER_ID}"
DIR="$LAUNCHER/homehook"
MARK="${MARK:-/tmp/inputhook}"
# The key engine has its own folder and start-up link: the helper watcher (replaceHome) uses launcher-homehook and
# 48-launcher-homehook, and sharing them made each overwrite the other (after a restart only one of the two started).
SELF="/media/developer/launcher-homekey/homehook.sh"
LINK="${LINK:-/var/lib/webosbrew/init.d/49-launcher-homekey}"
OLD_LINK="${OLD_LINK:-/var/lib/webosbrew/init.d/48-launcher-homehook}"
TARGETS="RELEASE lginput2 micomservice tvservice testapp"
APPS="${APPS:-/media/developer/apps/usr/palm/applications}"
HOOK_APP="${HOOK_APP:-$APPS/org.webosbrew.inputhook}"
KEYS="${KEYS:-/home/root/.config/lginputhook/keybinds.json}"
HOOK_LINK="${HOOK_LINK:-/var/lib/webosbrew/init.d/inputhook}"
ENGINE_DIR="${ENGINE_DIR:-/media/developer/launcher-homekey}"
LOGF="${LOGF:-/tmp/hearth-homehook.log}"

have_files () { [ -f "$DIR/ezinject" ] && [ -f "$DIR/libinputhookpp.so" ]; }
ready_count () { n=0; for f in /tmp/lginput-hook-*.log; do [ -f "$f" ] && grep -q 'InputHook initialized' "$f" 2>/dev/null && n=$((n+1)); done; echo $n; }

find_pids () {   # prints "comm pid" for each running target (one grep over /proc: cheap even while the TV is still starting)
    grep -sE "^($(echo $TARGETS | tr ' ' '|'))\$" /proc/[0-9]*/comm 2>/dev/null | sed -n 's#^/proc/\([0-9]*\)/comm:\(.*\)$#\2 \1#p'
}

do_status () {
    [ -f "$MARK" ] && echo injected=1 || echo injected=0
    have_files && echo files=1 || echo files=0
    echo ready=$(ready_count)
    [ -e "$LINK" ] && echo link=1 || echo link=0
    [ -d "$HOOK_APP" ] && echo hookapp=1 || echo hookapp=0
}

do_start () {
    if [ -f "$MARK" ]; then
        # a marker with no working hook behind it (an earlier start that did not take) must not block a new try
        if [ "$(ready_count)" -gt 0 ]; then echo result=already; return 0; fi
        rm -f "$MARK"
    fi
    if ! have_files; then echo result=nofiles; return 0; fi
    mkdir -p "$(dirname "$KEYS")" 2>/dev/null
    [ -f "$KEYS" ] || echo '{}' > "$KEYS"
    chmod 755 "$DIR/ezinject" "$DIR/libinputhookpp.so" 2>/dev/null
    pids="$(find_pids)"
    if [ -z "$pids" ]; then echo result=notarget; return 0; fi
    echo "$pids" | while read -r name pid; do
        : > "/tmp/lginput-hook-$name.log"
        "$DIR/ezinject" -l "/tmp/lginput-hook-$name.log" "$pid" "$DIR/libinputhookpp.so" > "/tmp/ezinject-$name.log" 2>&1 < /dev/null &
    done
    sleep 4
    c="$(ready_count)"
    if [ "$c" -gt 0 ]; then : > "$MARK"; echo "ready=$c"; echo result=started; else echo result=failed; fi
}

log () { echo "$(date +%H:%M:%S) up=$(cut -d. -f1 /proc/uptime 2>/dev/null)s $*" >> "$LOGF" 2>/dev/null; }

# Hearth is gone only when the apps folder is there and our appinfo.json is not (checked twice, so a slow mount cannot fool it).
hearth_gone () {
    [ -d "$APPS" ] || return 1
    [ -f "$LAUNCHER/appinfo.json" ] && return 1
    sleep "${GONE_WAIT:-15}"
    [ -d "$APPS" ] && [ ! -f "$LAUNCHER/appinfo.json" ]
}

drop_hearth_entries () {   # takes every "launch Hearth" entry out of the settings file
    [ -f "$KEYS" ] || return 0
    if command -v node >/dev/null 2>&1; then
        node -e 'var fs=require("fs"),f=process.argv[1],o;try{o=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){process.exit(3)}Object.keys(o).forEach(function(k){var b=o[k];if(b&&((b.action==="launch"&&b.id==="'"$LAUNCHER_ID"'")||(b.action==="exec"&&typeof b.command==="string"&&b.command.indexOf("launcher-homekey/open.sh")>-1)))delete o[k]});fs.writeFileSync(f,JSON.stringify(o))' "$KEYS" 2>/dev/null && return 0
    fi
    # no node (or unreadable): the compact form Hearth itself writes
    sed -i -e 's/"[0-9]*":{"action":"launch","id":"'"$LAUNCHER_ID"'"},\{0,1\}//g' -e 's/"[0-9]*":{"action":"exec","command":"sh [^"]*launcher-homekey\/open.sh"},\{0,1\}//g' -e 's/,}/}/g' "$KEYS" 2>/dev/null
}

cleanup () {
    log "Hearth is not installed: cleaning up"
    drop_hearth_entries
    if [ ! -d "$HOOK_APP" ]; then
        rm -f "$KEYS" "$HOOK_LINK"
        log "Input Hook is not installed either: its settings file and start-up script were removed"
    fi
    rm -f "$LINK"
    case "$(readlink "$OLD_LINK" 2>/dev/null)" in */launcher-homehook/homehook.sh) rm -f "$OLD_LINK" ;; esac
    rm -rf "$ENGINE_DIR"
}

# At every start: for about 3 minutes watch for the TV's input processes and inject the hook into each one as soon as it has
# been seen (a process that is restarted gets it again; one whose hook did not come up in 10 s gets one more try).
# Polls every 0.25 s for the first 10 s, every second up to 1 minute, then every 4 s (about 3 minutes in all).
# Every step is logged to $LOGF.
inject_one () {   # name pid
    : > "/tmp/lginput-hook-$1.log"
    "$DIR/ezinject" -l "/tmp/lginput-hook-$1.log" "$2" "$DIR/libinputhookpp.so" > "/tmp/ezinject-$1.log" 2>&1 < /dev/null &
}

JOBPID="${JOBPID:-/tmp/hearth-hook-job.pid}"

boot_job () {
    # one job at a time (the boot link and the launcher may both start it)
    other="$(cat "$JOBPID" 2>/dev/null)"
    if [ -n "$other" ] && [ "$other" != "$$" ] && kill -0 "$other" 2>/dev/null; then log "boot: a job is already running ($other)"; return 0; fi
    echo $$ > "$JOBPID"
    log "boot: key engine start-up began"
    if hearth_gone; then cleanup; return 0; fi
    if [ -f "$MARK" ] && [ "$(ready_count)" -gt 0 ]; then log "boot: a hook is already running"; return 0; fi
    if ! have_files; then log "boot: files missing in $DIR"; return 0; fi
    mkdir -p "$(dirname "$KEYS")" 2>/dev/null
    [ -f "$KEYS" ] || echo '{}' > "$KEYS"
    chmod 755 "$DIR/ezinject" "$DIR/libinputhookpp.so" 2>/dev/null
    # poll step: 0.25 s for the first 10 s when this TV's sleep takes fractions (busybox may not: then 1 s), then 1 s, then 4 s
    if sleep 0.01 2>/dev/null; then fast=0.25; else fast=1; fi
    log "boot: poll step ${fast}s"
    rounds=0
    while [ $rounds -lt 150 ]; do
        find_pids > /tmp/hearth-hook-pids
        now="$(date +%s)"
        while read -r name pid; do
            [ -n "$pid" ] || continue
            f="/tmp/hearth-hooked-$name-$pid"
            if [ -f "$f" ]; then
                # injected: if its log shows no start after 10 s, one more try
                if [ ! -f "$f.retry" ] && [ $((now - $(cat "$f" 2>/dev/null || echo "$now"))) -gt 10 ] && ! grep -q 'InputHook initialized' "/tmp/lginput-hook-$name.log" 2>/dev/null; then
                    : > "$f.retry"; inject_one "$name" "$pid"; log "boot: $name did not start, trying again"
                fi
                continue
            fi
            log "boot: saw $name ($pid)"    # injected at the first look (no settle wait since P35l; a failed injection gets the retry above)
            inject_one "$name" "$pid"
            echo "$now" > "$f"
            log "boot: injecting into $name ($pid)"
        done < /tmp/hearth-hook-pids
        if [ ! -f "$MARK" ] && [ "$(ready_count)" -gt 0 ]; then : > "$MARK"; log "boot: hook ready ($(ready_count) process(es))"; fi
        rounds=$((rounds+1))
        if [ $rounds -lt 40 ]; then sleep "$fast"; elif [ $rounds -lt 90 ]; then sleep 1; else sleep 4; fi
    done
    log "boot: finished watching; ready=$(ready_count)"
}

do_boot () { ( nohup sh "$0" bootjob >/dev/null 2>&1 </dev/null & ); }

case "${1:-boot}" in
    status) do_status ;;
    start) do_start ;;
    boot) do_boot ;;
    bootjob) boot_job ;;
    cleanup) if hearth_gone; then cleanup; echo result=cleaned; else echo result=kept; fi ;;
    enable)
        # an older version put its link under the helper's name: take it away only when it points at this script
        case "$(readlink "$OLD_LINK" 2>/dev/null)" in */launcher-homehook/homehook.sh) rm -f "$OLD_LINK" ;; esac
        mkdir -p "$(dirname "$LINK")" && ln -sf "$SELF" "$LINK" && echo result=enabled || echo result=failed ;;
    disable) rm -f "$LINK"; echo result=disabled ;;
    *) echo "usage: sh homehook.sh status|start|boot|enable|disable"; exit 2 ;;
esac
