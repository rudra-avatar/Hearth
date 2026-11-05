#!/bin/sh
# Boot guard for webOS 3 (2.0.3 S3b). Written to the TV by the launcher (rooted TVs, legacy bundle only); nothing to copy by hand.
# It runs from the Homebrew start-up folder at every TV start while "Add Hearth as a TV input" or "When the TV turns on,
# open..." is on. State is plain key=value lines in $STATE (input, powerOn, tries, reverted), the same text as
# src/lib/bootguardcmd.ts. At each start:
#   1. nothing in $STATE or both rows off: stop at once;
#   2. tries = tries + 1 (Hearth sets it back to 0 when it reaches its screen: action "reached");
#   3. tries <= RETRY_BOOTS: wait for the TV's app manager, start Hearth if it is not in front;
#   4. more: revert. Delete the Hearth input (proved by reading the input list, deleteDevice gives no answer), then remove
#      the power-on app copy (only Hearth's own). A step counts as done only when the read proves it; `reverted=1` says so.
# While a row is on, a boot trace goes to $TRACE (on /media/developer, so it survives a hang and a restart): per start a
# header, then one line each ROUND_SECS (uptime, app in front, Hearth input listed?), the guard's own log lines, and the
# bootd.log lines about the first app. It stops when Hearth has been in front twice, or after TRACE_ROUNDS lines. Two
# files (trace + .old), each cut at 60 KB. No memory figures. Nothing is traced when both rows are off.
# The work runs in the background (the start-up folder must not wait). Usage: sh guard.sh [start|check|reached]
#   start (default, from the startup folder)  check: the same, in the foreground, printing the decision.  reached: tries=0.

DIR="${DIR:-/media/developer/launcher-bootguard}"
STATE="${STATE:-$DIR/state}"
LINK="${LINK:-/var/lib/webosbrew/init.d/44-launcher-bootguard}"
LOG="${LOG:-/tmp/launcher-bootguard.log}"
APP_ID="${APP_ID:-tld.my.customlauncher}"
RETRY_BOOTS="${RETRY_BOOTS:-2}"
NAP="${NAP:-sleep}"
PO_DIR="${PO_DIR:-/media/developer/launcher-poweron}"
PO_LINK="${PO_LINK:-/var/lib/webosbrew/init.d/45-launcher-poweron}"
OVERRIDE="${OVERRIDE:-/var/luna/preferences/bootd.json}"
EIM="luna://com.webos.service.eim"
if [ -z "$SEND" ]; then SEND=luna-send-pub; command -v luna-send-pub >/dev/null 2>&1 || SEND=luna-send; fi

TRACE="${TRACE:-$DIR/boot-trace.log}"
BOOTD_LOG="${BOOTD_LOG:-/var/log/bootd.log}"
ROUND_SECS="${ROUND_SECS:-10}"
TRACE_ROUNDS="${TRACE_ROUNDS:-18}"
TRACING=0
tr_line () { [ "$TRACING" = 1 ] || return 0; echo "$(date '+%H:%M:%S') up=$(cut -d ' ' -f 1 /proc/uptime 2>/dev/null) $*" >> "$TRACE"; sync; }
log () { echo "$(date '+%H:%M:%S') bootguard: $*" >> "$LOG"; tr_line "log: $*"; }
val () { sed -n "s/^$1=\([0-9]*\)\$/\1/p" "$STATE" 2>/dev/null | head -n 1; }
put () { # input powerOn tries reverted: write the state, then flush
    printf 'input=%s\npowerOn=%s\ntries=%s\nreverted=%s\n' "$1" "$2" "$3" "$4" > "$STATE.tmp" && mv -f "$STATE.tmp" "$STATE"; sync
}
# Hearth's own power-on copy is in place (its sum is listed in override.md5), same test as src/poweron/guard.sh
po_ours () { [ -s "$OVERRIDE" ] && grep -qx "$(md5sum "$OVERRIDE" 2>/dev/null | cut -d ' ' -f 1)" "$PO_DIR/override.md5" 2>/dev/null; }
# the input list: yes (Hearth listed), no (list read, Hearth not in it), unknown (no readable answer: proves nothing)
listed () {
    r=$($SEND -n 1 "$EIM/getAllInputStatus" '{}' 2>&1)
    case "$r" in *'"returnValue":true'*|*'"returnValue": true'*) ;; *) echo unknown; return 0 ;; esac
    case "$r" in *"$APP_ID"*) echo yes ;; *) echo no ;; esac
}

wait_eim () { n=0; while [ "$n" -lt 60 ]; do [ "$(listed)" != unknown ] && return 0; n=$((n + 1)); $NAP 2; done; return 1; }

retry () {
    n=0
    while [ "$n" -lt 45 ]; do
        fg=$($SEND -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>&1)
        case "$fg" in *'"returnValue":true'*|*'"returnValue": true'*) break ;; esac
        n=$((n + 1)); $NAP 2
    done
    case "$fg" in *"$APP_ID"*) log "retry: Hearth is in front"; return 0 ;; esac
    $SEND -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$APP_ID\"}" >/dev/null 2>&1
    log "retry: started Hearth"
}

revert () { # input powerOn
    in=$1; po=$2; was_in=$in; was_po=$po
    if [ "$in" = 1 ]; then
        wait_eim
        i=0
        while [ "$i" -lt 3 ] && [ "$(listed)" = yes ]; do
            $SEND -n 1 "$EIM/deleteDevice" "$(cat "$DIR/input.json" 2>/dev/null)" >/dev/null 2>&1
            i=$((i + 1)); $NAP 2
        done
        if [ "$(listed)" = no ]; then in=0; log "revert: the Hearth input is gone (read from the input list)"; else log "revert: the Hearth input is still listed or unreadable: kept in the state"; fi
    fi
    if [ "$po" = 1 ]; then
        if po_ours; then rm -f "$OVERRIDE"; fi
        rm -f "$PO_LINK"; rm -rf "$PO_DIR"; sync
        if po_ours; then log "revert: the power-on copy is still there"; else po=0; log "revert: the power-on app is cleared"; fi
    fi
    rv=0; [ "$in" != "$was_in" ] || [ "$po" != "$was_po" ] && rv=1
    put "$in" "$po" 0 "$rv"
    # nothing left to guard: the link goes (the folder stays: the page reads `reverted` from it)
    [ "$in" = 0 ] && [ "$po" = 0 ] && rm -f "$LINK"
    return 0
}

# lines of bootd.log about the first app (the pattern asked for in issue 23), the last 30, cut to 200 characters
bootd_excerpt () {
    [ -f "$BOOTD_LOG" ] || { tr_line "bootd.log: not there"; return 0; }
    grep -i -E 'lastinput|firstapp|mvpd|coverui|customlauncher|webappmanager|powerstatus|snapshot' "$BOOTD_LOG" 2>/dev/null | tail -n 30 | cut -c1-200 | while IFS= read -r l; do tr_line "bootd: $l"; done
}

trace () { # tries
    [ -f "$TRACE" ] && [ "$(wc -c < "$TRACE" 2>/dev/null)" -gt 60000 ] && mv -f "$TRACE" "$TRACE.old"
    tr_line "---- boot, try $1 ----"
    n=0; front=0
    while [ "$n" -lt "$TRACE_ROUNDS" ]; do
        fg=$($SEND -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>&1 | tr -d '\n' | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p')
        tr_line "round $n: front=${fg:-none} input=$(listed)"
        if [ "$fg" = "$APP_ID" ]; then front=$((front + 1)); else front=0; fi
        [ "$front" -ge 2 ] && { tr_line "Hearth is in front: trace ends"; return 0; }
        [ "$n" = 6 ] && bootd_excerpt
        n=$((n + 1)); $NAP "$ROUND_SECS"
    done
    tr_line "trace ends (Hearth not in front after $TRACE_ROUNDS rounds)"
    bootd_excerpt
}

work () {
    case "$1" in
        retry) retry ;;
        revert) revert "$2" "$3" ;;
    esac
}

main () { # mode: start | check
    [ -f "$STATE" ] || { [ "$1" = check ] && echo none; return 0; }
    in=$(val input); po=$(val powerOn); tries=$(val tries); rv=$(val reverted)
    in=${in:-0}; po=${po:-0}; tries=${tries:-0}; rv=${rv:-0}
    if [ "$in" = 0 ] && [ "$po" = 0 ]; then [ "$1" = check ] && echo none; return 0; fi
    tries=$((tries + 1))
    put "$in" "$po" "$tries" "$rv"
    TRACING=1
    if [ "$tries" -le "$RETRY_BOOTS" ]; then d=retry; else d=revert; fi
    log "boot $tries without Hearth reaching its screen: $d"
    [ "$1" = check ] && echo "$d"
    if [ "$1" = check ]; then ( trace "$tries" ) & work "$d" "$in" "$po"; wait
    else ( trace "$tries" ) >/dev/null 2>&1 & ( work "$d" "$in" "$po" ) >/dev/null 2>&1 & fi
}

case "${1:-start}" in
    start) main start ;;
    check) main check ;;
    reached) [ -f "$STATE" ] && [ "$(val tries)" != 0 ] && put "$(val input)" "$(val powerOn)" 0 "$(val reverted)"; exit 0 ;;
    *) echo "usage: guard.sh [start|check|reached]"; exit 1 ;;
esac
