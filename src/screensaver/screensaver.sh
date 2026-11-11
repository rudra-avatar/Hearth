#!/bin/sh
# Hearth screen saver (experimental): photos, animated GIFs and videos. Written to the TV by the launcher; nothing to copy by hand.
#
# What it does: the TV's own screen saver is a small app (com.webos.app.screensaver) whose picture is drawn by one QML
# file. This puts a QML file of ours over that one file with a bind mount, so when the TV starts its screen saver (the
# idle timer set in the TV's own settings, or "show now") it plays a slideshow of the wallpaper photos. The TV reads the
# file each time the screen saver starts, so unlike LG Home's replacement nothing has to be restarted and nothing
# depends on the start-up having settled. The mount lives in memory only: a restart puts LG's own screen saver back,
# and the start-at-boot link (49-launcher-screensaver) mounts ours again. Nothing on the TV's flash is changed.
# TVs whose own screen saver is QML (webOS up to 9): one QML file is mounted. webOS 10 and later (EXPERIMENTAL, the stock
# saver is a Flutter app there): a staged copy of the app folder, with the manifest changed to QML and our QML inside, is
# mounted over the whole app folder and the TV's app manager (sam) is made to read it again with blockSystemApp then
# releaseBlockSystemApp for that one app id (no restart of sam, ever; if sam does not take it the mount is undone and
# LG's saver stays: result "not-taken"). A TV without that call is left alone ("unsupported"). This is the method
# Glasshouse (Rory Gallagher, MIT) documents and uses on webOS 10 and 11; the code here is our own.
# The idea (bind-mounting a QML file over the screen saver app) is the one used by Glasshouse (Rory Gallagher, MIT)
# and by custom-screensaver (Piotr Dobrowolski and others, MIT); the code here is our own. How video is shown on the
# TV (the PunchThrough area, the QtMultimedia imports) was learned from the QML of custom-screensaver-aerial (aabytt, MIT).
#
# Usage: sh screensaver.sh on | apply | off | show | status | diagnose | boot
#   on        mount ours and keep it on at boot. Prints applied, launcher-missing, files-missing, unsupported,
#             no-target, no-photos, no-video, not-taken or failed.
#   apply     rebuild the QML from the settings file and mount it again (cheap). Same words as "on".
#   off       switch off: LG's own screen saver is back. Prints removed.
#   show      start the TV's screen saver now (to try it). Prints shown or failed.
#   status    one word per line: enabled, mounted, linked.
#   boot      (also: no argument, as run from the startup folder) apply after a restart, in the background. If Hearth is
#             no longer installed, this switches itself off and deletes its own files.
#   diagnose  everything needed to see what is going on.
#
# settings (a file next to this script, one key=value per line): source (a folder or one picture; empty or missing =
# the bundled photos), interval (seconds between pictures, 5 to 3600), shuffle (1 or 0), dim (1 or 0: a black
# layer over the picture, about 60% brightness), poweroff (seconds of screen saver before the TV is switched off; 0 = never), care (1 on, 0 off: a thin frame and a slow drift for one picture, GIF or video), fill (0 fit the whole picture, 1 crop to fill the screen; pictures, GIFs and videos).
# dimlevel (10 to 80: how dark Dim is, % opacity of the black layer; default 40). driftms (4000 to 60000, default 60000; Tests tab only). overlay (0 or 1, default 0: the Q6 probe overlay; Tests tab only).
# recursive (1: a folder's sub-folders are used too, all levels; 0: only the folder itself). There is no limit on the number of items.
# source may also be @photos (the bundled photos), @video (the built-in video) or @photo:photo-NN (one bundled photo).
# A source under /tmp/hearth-netfolder (the network folder, see public/netfolder/netfolder.sh) is connected first, here at
# apply and in the boot job; when the share cannot be reached the saver default is used: the built-in video (the bundled
# photos when that file is missing).

DIR="${DIR:-/media/developer/launcher-screensaver}"
APP="${APP:-/usr/palm/applications/com.webos.app.screensaver}"
LAUNCHER_ID="${LAUNCHER_ID:-tld.my.customlauncher}"
LAUNCHER="${LAUNCHER:-/media/developer/apps/usr/palm/applications/$LAUNCHER_ID}"
LINK="${LINK:-/var/lib/webosbrew/init.d/49-launcher-screensaver}"
FLAG="${FLAG:-$DIR/enabled}"
SETTINGS="${SETTINGS:-$DIR/settings}"
TEMPLATE="${TEMPLATE:-$DIR/main.qml.template}"
QML="${QML:-$DIR/main.qml}"
TARGET_FILE="${TARGET_FILE:-$DIR/target}"
STAGE="${STAGE:-$DIR/app}"                                   # webOS 10 and later: the staged app folder
BLOCK_SCHEMA="${BLOCK_SCHEMA:-/etc/palm/schemas/sam/applicationManager.blockSystemApp.schema}"
SAM_ID="${SAM_ID:-com.webos.app.screensaver}"
LOG="${LOG:-/tmp/launcher-screensaver.log}"
MOUNTS="${MOUNTS:-/proc/mounts}"
LUNA="${LUNA_SEND:-luna-send}"
MOUNT="${MOUNT_CMD:-mount}"
UMOUNT="${UMOUNT_CMD:-umount}"
NAP="${NAP:-sleep}"
LOWPRI=""; command -v nice >/dev/null 2>&1 && LOWPRI="nice -n 19"   # the boot job must not compete with the Home button start-up (P52d)
NETSH="${NETSH:-$LAUNCHER/netfolder/netfolder.sh}"          # the network folder script (Hearth's own)
NETMNT="${NETMNT:-/tmp/hearth-netfolder}"                   # where it mounts the share
NETFAIL="${NETFAIL:-$DIR/netfail}"                          # exists while the chosen share could not be reached at the last build
WATCH_PID="${WATCH_PID:-$DIR/watch.pid}"                     # the power-off watcher (one process)
POLL="${POLL:-5}"                                            # seconds between looks at the TV's power state

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

# the QML file the TV's screen saver app loads: the "main" of its manifest, else the usual names
find_target () {
    main=$(sed -n 's/.*"main"[^"]*"\([^"]*\)".*/\1/p' "$APP/appinfo.json" 2>/dev/null | head -n 1)
    for candidate in "$main" qml/main.qml qml/ScreensaverMain.qml main.qml; do
        case "$candidate" in *.qml) [ -f "$APP/$candidate" ] && { echo "$APP/$candidate"; return 0; } ;; esac
    done
    return 1
}

stock_type () { sed -n 's/.*"type"[^"]*"\([^"]*\)".*/\1/p' "$APP/appinfo.json" 2>/dev/null | head -n 1; }

is_mounted () { [ -n "$1" ] && grep -q " $1 " "$MOUNTS" 2>/dev/null; }

setting () {
    [ -f "$SETTINGS" ] || return 0
    while IFS='=' read -r k v; do
        [ "$k" = "$1" ] && { echo "$v"; return 0; }
    done < "$SETTINGS"
}

num () { case "$1" in ''|*[!0-9]*) echo "$2" ;; *) echo "$1" ;; esac }

# one photo as a QML list line, or nothing when its name could not be written safely
photo_line () {
    case "$1" in *'"'*|*'\'*|*'#'*|*'%'*|*'?'*) return 0 ;; esac
    [ -f "$1" ] || return 0
    printf '        "file://%s",\n' "$(printf '%s' "$1" | sed 's/ /%20/g')"
}

# a folder as QML list lines, A to Z: one find (with "recursive=1" in the settings, all levels of folders; no limit on the
# count), only picture, GIF and video names, hidden files and names that cannot be written safely left out, then one sed
# turns the lines into list entries
folder_lines () {
    depth="-maxdepth 1"
    [ "$(setting recursive)" = 1 ] && depth=""
    find -L "$1" $depth -type f 2>/dev/null | grep -i -E '\.(jpe?g|png|gif|mp4|m4v|mov|mkv|webm)$' | sort | grep -v '/\.' | grep -v '["\#%?]' | sed -e 's/ /%20/g' -e 's|^|        "file://|' -e 's|$|",|'
}

# connects the network folder from its saved settings (on demand, nothing is kept at start-up). 0 = the share answers.
# Where the TV has `timeout` the connect gives up after 25 s (an unreachable NAS must not hold the apply for long).
net_connect () {
    [ -f "$NETSH" ] || { log "network folder: its script is missing"; return 1; }
    if command -v timeout >/dev/null 2>&1; then out=$(timeout 25 sh "$NETSH" mount 2>/dev/null); else out=$(sh "$NETSH" mount 2>/dev/null); fi
    if printf '%s\n' "$out" | grep -q '^result=ok'; then log "network folder: connected"; return 0; fi
    log "network folder: not connected ($(printf '%s\n' "$out" | sed -n 's/^result=//p' | tail -n 1))"
    return 1
}

list_photos () {
    src=$(setting source)
    case "$src" in
        @photos) src="" ;;                                  # the bundled photos
        @video) src="$LAUNCHER/saver/builtin.mp4" ;;        # the built-in video
        @probe) src="$LAUNCHER/saver/probe-light.mp4" ;;    # Q5 test only: a 1 s light video (Tests tab 49-51)
        @photo:photo-[0-9][0-9]) src="$LAUNCHER/wallpapers/${src#@photo:}.jpg" ;;   # one built-in photo (the wallpaper)
    esac
    # a source on the network folder: connect it first; not reachable = the saver default (the built-in video), and a mark
    # for the boot job
    rm -f "$NETFAIL"
    case "$src" in
        "$NETMNT"|"$NETMNT"/*) if ! net_connect; then : > "$NETFAIL"; src="$LAUNCHER/saver/builtin.mp4"; fi ;;
    esac
    part="$DIR/photos.part"
    : > "$part"
    if [ -n "$src" ] && [ -f "$src" ]; then
        photo_line "$src" > "$part"
    elif [ -n "$src" ] && [ -d "$src" ]; then
        folder_lines "$src" > "$part"
    fi
    if [ -s "$part" ]; then
        cat "$part"
    else
        # nothing usable chosen (or its folder is empty): the bundled photos
        for f in "$LAUNCHER"/wallpapers/photo-*.jpg; do photo_line "$f"; done
    fi
    rm -f "$part"
}

build_qml () {
    [ -f "$TEMPLATE" ] || return 1
    [ "$(setting source)" = "@video" ] && [ ! -f "$LAUNCHER/saver/builtin.mp4" ] && return 3
    [ "$(setting source)" = "@probe" ] && [ ! -f "$LAUNCHER/saver/probe-light.mp4" ] && return 3
    list="$DIR/photos.tmp"
    list_photos > "$list"
    [ -s "$list" ] || { rm -f "$list"; return 2; }
    interval=$(num "$(setting interval)" 60); [ "$interval" -lt 5 ] && interval=5; [ "$interval" -gt 3600 ] && interval=3600
    shuffle=false; [ "$(setting shuffle)" = 1 ] && shuffle=true
    dim=false; [ "$(setting dim)" = 1 ] && dim=true
    care=$(num "$(setting care)" 1); [ "$care" -gt 1 ] && care=1
    fill=$(num "$(setting fill)" 0); [ "$fill" -gt 1 ] && fill=1
    dimlevel=$(num "$(setting dimlevel)" 40); [ "$dimlevel" -lt 10 ] && dimlevel=10; [ "$dimlevel" -gt 80 ] && dimlevel=80
    # Q5 test only: the care drift step in ms (default 60000, one step a minute); the Tests tab sets 8000 to watch the slide
    driftms=$(num "$(setting driftms)" 60000); [ "$driftms" -lt 4000 ] && driftms=4000; [ "$driftms" -gt 60000 ] && driftms=60000
    # Q6 test only: 1 draws the probe overlay (Tests tab 49-53); never set in normal use
    overlay=$(num "$(setting overlay)" 0); [ "$overlay" -gt 1 ] && overlay=1
    # the settings first (one sed), then the photo list in place of its marker line (no program started per line)
    sed -e "s/__INTERVAL__/$interval/" -e "s/__SHUFFLE__/$shuffle/" -e "s/__DIM__/$dim/" -e "s/__CARE__/$care/" -e "s/__FILL__/$fill/" -e "s/__DIMLEVEL__/$dimlevel/" -e "s/__DRIFTMS__/$driftms/" -e "s/__OVERLAY__/$overlay/" "$TEMPLATE" > "$QML.tmp" || return 1
    : > "$QML.new"
    while IFS= read -r line; do
        case "$line" in
            *@PHOTOS@*) cat "$list" >> "$QML.new" ;;
            *) printf '%s\n' "$line" >> "$QML.new" ;;
        esac
    done < "$QML.tmp"
    rm -f "$QML.tmp"
    rm -f "$list"
    mv -f "$QML.new" "$QML"
}

# --- webOS 10 and later (experimental) -------------------------------------------------------------------------------
luna_ok () { grep -q '"returnValue"[[:space:]]*:[[:space:]]*true'; }

# the type of the screen saver app as sam holds it (empty: no answer)
sam_type () {
    "$LUNA" -n 1 luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$SAM_ID\"}" 2>/dev/null | tr -d '\n' | tr ',' '\n' | sed -n 's/.*"type"[^"]*"\([^"]*\)".*/\1/p' | head -n 1
}

# makes sam read the app's manifest again: blockSystemApp then releaseBlockSystemApp for this one app, then waits until
# sam reports the wanted type. Never restarts sam. Returns 0 when sam took it.
sam_reread () {
    want="$1"
    params="{\"id\":\"$SAM_ID\"}"
    grep -q '"forceBlockSystemApp"' "$BLOCK_SCHEMA" 2>/dev/null && params="{\"id\":\"$SAM_ID\",\"forceBlockSystemApp\":false}"
    if ! "$LUNA" -n 1 luna://com.webos.applicationManager/blockSystemApp "$params" 2>>"$LOG" | luna_ok; then
        log "sam refused blockSystemApp"
        "$LUNA" -n 1 luna://com.webos.applicationManager/releaseBlockSystemApp "{\"id\":\"$SAM_ID\"}" >/dev/null 2>&1
        return 1
    fi
    n=0
    while [ "$n" -lt 3 ]; do
        "$LUNA" -n 1 luna://com.webos.applicationManager/releaseBlockSystemApp "{\"id\":\"$SAM_ID\"}" 2>>"$LOG" | luna_ok && break
        n=$((n + 1)); $NAP 1
    done
    [ "$n" -ge 3 ] && { log "could not release $SAM_ID: it stays blocked until released"; return 1; }
    n=0
    while [ "$n" -lt 8 ]; do
        [ "$(sam_type)" = "$want" ] && { log "sam reads the $want manifest (no restart)"; return 0; }
        n=$((n + 1)); $NAP 1
    done
    log "sam did not report type $want in time"
    return 1
}

# after our mount is gone: if sam still holds our QML manifest while LG's own files are back, make it read LG's again
restore_sam () {
    stock=$(stock_type); held=$(sam_type)
    [ -n "$stock" ] && [ -n "$held" ] && [ "$stock" != "$held" ] && sam_reread "$stock"
    return 0
}

# patch the stock manifest: type qml, main qml/main.qml
stage_manifest () {
    sed -e 's/"type"[[:space:]]*:[[:space:]]*"[^"]*"/"type": "qml"/' "$APP/appinfo.json" > "$STAGE/appinfo.json.tmp" || return 1
    if grep -q '"main"' "$STAGE/appinfo.json.tmp"; then
        sed -e 's|"main"[[:space:]]*:[[:space:]]*"[^"]*"|"main": "qml/main.qml"|' "$STAGE/appinfo.json.tmp" > "$STAGE/appinfo.json" || return 1
    else
        sed -e 's|"type": "qml"|"type": "qml", "main": "qml/main.qml"|' "$STAGE/appinfo.json.tmp" > "$STAGE/appinfo.json" || return 1
    fi
    rm -f "$STAGE/appinfo.json.tmp"
    grep -q '"type": "qml"' "$STAGE/appinfo.json" && grep -q '"main": "qml/main.qml"' "$STAGE/appinfo.json"
}

take_staged () {
    log "this TV's own screen saver is '$1', not QML: staged app method (experimental)"
    [ -f "$BLOCK_SCHEMA" ] || { log "no blockSystemApp on this TV: left alone"; echo unsupported; return 5; }
    unmount_all                                     # a copy of ours from before goes first, so the real manifest can be read
    rm -rf "$STAGE"; mkdir -p "$STAGE/qml" 2>/dev/null || { echo failed; return 1; }
    stage_manifest || { log "could not make the staged manifest"; rm -rf "$STAGE"; echo failed; return 1; }
    cp "$QML" "$STAGE/qml/main.qml" || { log "could not copy the QML"; rm -rf "$STAGE"; echo failed; return 1; }
    if ! "$MOUNT" --bind "$STAGE" "$APP" 2>>"$LOG"; then log "mount failed"; rm -rf "$STAGE"; echo failed; return 1; fi
    echo "$APP" > "$TARGET_FILE"
    held=$(sam_type)
    n=0
    while [ -z "$held" ] && [ "$n" -lt 3 ]; do $NAP 2; held=$(sam_type); n=$((n + 1)); done
    if [ -z "$held" ]; then
        log "sam did not answer: undone"
        unmount_all; rm -rf "$STAGE"; echo failed; return 1
    fi
    if [ "$held" != qml ] && ! sam_reread qml; then
        log "sam did not take the new manifest: undone, LG's screen saver stays"
        unmount_all; rm -rf "$STAGE"; restore_sam; echo not-taken; return 8
    fi
    log "mounted the staged app over $APP"
    echo applied
}

unmount_all () {
    n=0
    while is_mounted "$APP" && [ "$n" -lt 5 ]; do
        "$UMOUNT" "$APP" 2>>"$LOG" || "$UMOUNT" -l "$APP" 2>>"$LOG" || break
        n=$((n + 1))
    done
    t=$(cat "$TARGET_FILE" 2>/dev/null)
    [ -n "$t" ] || t=$(find_target)
    n=0
    while is_mounted "$t" && [ "$n" -lt 5 ]; do
        "$UMOUNT" "$t" 2>>"$LOG" || "$UMOUNT" -l "$t" 2>>"$LOG" || break
        n=$((n + 1))
    done
}

# the work: check, build the QML from the settings, mount it
take () {
    [ -f "$LAUNCHER/appinfo.json" ] || { echo launcher-missing; return 2; }
    [ -f "$TEMPLATE" ] || { echo files-missing; return 4; }
    # staged (webOS 10 and later) when our staged folder is already mounted, or when LG's own saver is not QML
    staged=""
    if is_mounted "$APP"; then staged=staged; else
        type=$(stock_type)
        [ -n "$type" ] && [ "$type" != qml ] && staged="$type"
    fi
    if [ -z "$staged" ]; then target=$(find_target) || { log "no QML file found in $APP"; echo no-target; return 6; }; fi
    build_qml
    case $? in
        1) echo files-missing; return 4 ;;
        2) log "no photos found"; echo no-photos; return 7 ;;
        3) log "the built-in video is not in this build"; echo no-video; return 9 ;;
    esac
    if [ -n "$staged" ]; then
        [ "$staged" = staged ] && staged="not QML"
        take_staged "$staged"
        return $?
    fi
    # mounted already (an older copy of the QML, maybe): take it off and put the new one on
    unmount_all
    if "$MOUNT" --bind "$QML" "$target" 2>>"$LOG"; then
        echo "$target" > "$TARGET_FILE"
        log "mounted $QML over $target"
        echo applied
    else
        log "mount failed"
        echo failed; return 1
    fi
}

# --- power off after the screen saver (P29c) ---------------------------------------------------------------------------
# A small background process looks at the TV's power state every few seconds (one luna-send each, nothing else). When the
# state has been "Screen Saver" for "poweroff" seconds it asks the TV to switch off (standby). Any key puts the state
# back to Active, which starts the count again. The raw states are written to the log so a TV that words them
# differently can be seen.
now () { ${NOW_CMD:-date +%s}; }

power_state () {
    "$LUNA" -n 1 luna://com.webos.service.tvpower/power/getPowerState '{}' 2>/dev/null | tr -d '\n' | sed -n 's/.*"state"[^"]*"\([^"]*\)".*/\1/p' | head -n 1
}

in_saver () { case "$1" in *[Ss]creen*[Ss]aver*) return 0 ;; *) return 1 ;; esac; }

# #48 probe (log only): the app in front when the TV enters the saver (one luna-send, only on that change)
foreground_app () {
    "$LUNA" -n 1 luna://com.webos.service.applicationmanager/getForegroundAppInfo '{}' 2>/dev/null | tr -d '\n' | sed -n 's/.*"appId"[^"]*"\([^"]*\)".*/\1/p' | head -n 1
}

power_off_now () {
    st=$(power_state)
    in_saver "$st" || { log "power off skipped: the state is now '$st'"; return 0; }
    log "powering off: ${1}s of screen saver"
    out=$("$LUNA" -n 1 luna://com.webos.service.tvpower/power/powerOff '{"reason":"remoteKey"}' 2>&1)
    log "powerOff (remoteKey): $out"
    printf '%s' "$out" | luna_ok && return 0
    case "$out" in *[Bb]usy*) return 0 ;; esac
    $NAP 2
    st=$(power_state)
    if in_saver "$st"; then
        out=$("$LUNA" -n 1 luna://com.webos.service.tvpower/power/powerOff '{"reason":"localKey"}' 2>&1)
        log "powerOff (localKey): $out"
    else
        log "the state is now '$st': counted as off"
    fi
    return 0
}

watch_loop () {
    secs="$1"; since=0; fired=0; last="-"; loops=0
    log "power-off watcher started: $secs s"
    while :; do
        st=$(power_state)
        if [ "$st" != "$last" ]; then
            log "power state: '$st'"
            in_saver "$st" && log "saver start: app in front '$(foreground_app)' (was '$last')"
            last="$st"
        fi
        if in_saver "$st"; then
            t=$(now)
            [ "$since" -eq 0 ] && since="$t"
            if [ "$fired" -eq 0 ] && [ $((t - since)) -ge "$secs" ]; then fired=1; power_off_now "$secs"; fi
        else
            since=0; fired=0
        fi
        loops=$((loops + 1))
        [ -n "$WATCH_LOOPS" ] && [ "$loops" -ge "$WATCH_LOOPS" ] && break
        $NAP "$POLL"
    done
}

# the pid file holds "pid seconds" of the running watcher
watch_pid () { [ -f "$WATCH_PID" ] && { read -r p _ < "$WATCH_PID"; echo "$p"; }; return 0; }
watch_secs () { [ -f "$WATCH_PID" ] && { read -r _ s < "$WATCH_PID"; echo "$s"; }; return 0; }

stop_watcher () {
    pid=$(watch_pid)
    if [ -n "$pid" ] && grep -q screensaver "/proc/$pid/cmdline" 2>/dev/null; then kill "$pid" 2>/dev/null; log "power-off watcher stopped"; fi
    rm -f "$WATCH_PID"
}

start_watcher () {
    secs=$(num "$(setting poweroff)" 0)
    # the same watcher is already running with the same time: leave it (a restart would reset a count in progress)
    if [ -z "$DRY_RUN" ] && [ "$secs" -gt 0 ]; then
        pid=$(watch_pid)
        if [ -n "$pid" ] && grep -q screensaver "/proc/$pid/cmdline" 2>/dev/null && [ "$(watch_secs)" = "$secs" ]; then
            log "power-off watcher already running ($secs s): kept"
            return 0
        fi
    fi
    stop_watcher
    [ "$secs" -gt 0 ] || return 0
    if [ -n "$DRY_RUN" ]; then watch_loop "$secs"; else ( { fdclean; exec nohup sh "$0" watchjob; } >/dev/null 2>&1 </dev/null & ); fi
}

cmd_watchjob () {
    secs=$(num "$(setting poweroff)" 0)
    [ "$secs" -gt 0 ] || exit 0
    echo "$$ $secs" > "$WATCH_PID"
    watch_loop "$secs"
}

cmd_on () {
    : > "$FLAG"
    result=$(take | tail -n 1)
    case "$result" in
        applied)
            mkdir -p "$(dirname "$LINK")" 2>/dev/null
            ln -sf "$DIR/screensaver.sh" "$LINK" 2>/dev/null || log "could not add the start-at-boot link"
            start_watcher
            ;;
        *) rm -f "$FLAG" "$LINK"; stop_watcher ;;
    esac
    echo "$result"
}

cmd_apply () {
    [ -f "$FLAG" ] || { echo off; return 0; }
    result=$(take | tail -n 1)
    [ "$result" = applied ] && start_watcher
    echo "$result"
    [ "$result" = applied ]
}

cmd_off () {
    log "off"
    rm -f "$FLAG" "$LINK" "$NETFAIL"
    stop_watcher
    unmount_all
    restore_sam
    rm -rf "$STAGE"
    echo removed
}

# Hearth is gone (uninstalled without switching this off): nothing of ours stays behind
clean_self () {
    log "Hearth is not installed: removing the screen saver files"
    rm -f "$LINK" "$FLAG"
    stop_watcher
    unmount_all
    restore_sam
    rm -rf "$DIR"
}

boot_job () {
    log "boot job started ($(fdnote))"
    $NAP 20      # nothing here is needed in the first seconds of a start: the Home button work goes first (P52d)
    # the app storage can be slow to appear at start-up: look a few times before deciding Hearth is gone
    n=0
    while [ ! -f "$LAUNCHER/appinfo.json" ] && [ "$n" -lt 6 ]; do $NAP 5; n=$((n + 1)); done
    if [ ! -f "$LAUNCHER/appinfo.json" ]; then clean_self; return 0; fi
    result=$(take | tail -n 1)
    # on webOS 10 and later the app manager may not answer yet this early: try again a few times
    n=0
    while { [ "$result" = failed ] || [ "$result" = not-taken ]; } && [ "$n" -lt 4 ]; do
        log "boot: $result, trying again"
        $NAP 15; n=$((n + 1))
        result=$(take | tail -n 1)
    done
    # the chosen network folder may not be reachable this early (the network or the NAS comes up later): the built-in video
    # plays meanwhile; look again every 20 s for 2 minutes and rebuild the list once the share answers
    n=0
    while [ "$result" = applied ] && [ -f "$NETFAIL" ] && [ "$n" -lt 6 ]; do
        $NAP 20; n=$((n + 1))
        net_connect && result=$(take | tail -n 1)
    done
    [ -f "$NETFAIL" ] && log "boot: network folder not reachable, the built-in video is used"
    log "boot: $result"
    [ "$result" = applied ] && start_watcher
    return 0
}

cmd_boot () {
    [ -f "$FLAG" ] || exit 0
    if [ -n "$DRY_RUN" ]; then boot_job; else ( { fdclean; exec nohup $LOWPRI sh "$0" bootjob; } >/dev/null 2>&1 </dev/null & ); fi
}

cmd_show () {
    if "$LUNA" -n 1 luna://com.webos.service.tvpower/power/turnOnScreenSaver '{}' >>"$LOG" 2>&1; then echo shown; else echo failed; fi
}

cmd_status () {
    [ -f "$FLAG" ] && echo enabled
    is_mounted "$(cat "$TARGET_FILE" 2>/dev/null)" && echo mounted
    [ -L "$LINK" ] && echo linked
    pid=$(watch_pid)
    [ -n "$pid" ] && grep -q screensaver "/proc/$pid/cmdline" 2>/dev/null && echo watching
    return 0
}

cmd_diagnose () {
    echo "== version: $(cat "$DIR/version" 2>/dev/null)"
    echo "== TV's own screen saver app: type $(stock_type), file $(find_target)"
    echo "== manifest"; cat "$APP/appinfo.json" 2>&1 | head -n 30
    echo "== files in the app"; find "$APP" -name '*.qml' 2>/dev/null | head -n 20
    echo "== sam holds the app as type: $(sam_type); blockSystemApp schema: $([ -f "$BLOCK_SCHEMA" ] && echo yes || echo no)"
    echo "== power state now: '$(power_state)'; watcher pid: $(watch_pid) ($(watch_secs) s)"
    echo "== mounts"; grep -i screensaver "$MOUNTS" || echo none
    echo "== settings"; cat "$SETTINGS" 2>&1
    echo "== photos listed"; grep -c file:// "$QML" 2>/dev/null
    echo "== link"; ls -l "$LINK" 2>&1
    echo "== log"; tail -n 30 "$LOG" 2>&1
}

case "${1:-boot}" in
    on) cmd_on ;;
    apply) cmd_apply ;;
    off) cmd_off ;;
    show) cmd_show ;;
    status) cmd_status ;;
    diagnose) cmd_diagnose ;;
    boot) cmd_boot ;;
    bootjob) boot_job ;;
    watchjob) cmd_watchjob ;;
    *) echo "usage: $0 on|apply|off|show|status|diagnose|boot" >&2; exit 1 ;;
esac
