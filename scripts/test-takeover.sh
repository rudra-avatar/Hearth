#!/bin/sh
# Tests for src/takeover/takeover.sh on a fake TV: fake folders, fake mount, fake processes and a fake luna-send
# that answers the way sam does.   Run: npm test
S="$(cd "$(dirname "$0")/../src/takeover" && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }

D="$T/dir"; APP="$T/apps/com.webos.app.home"; L="$T/launcher"
mkdir -p "$D" "$APP" "$L" "$T/proc/100" "$T/proc/101" "$T/proc/102" "$T/init.d"
cp "$S/takeover.sh" "$S/shim.html" "$D/"
echo '{"id":"com.webos.app.home","type":"qml"}' > "$APP/appinfo.json"
echo '{}' > "$L/appinfo.json"; echo png > "$L/icon.png"; echo png > "$L/largeIcon.png"
printf '/usr/bin/com.webos.app.home\0' > "$T/proc/100/cmdline"                          # LG Home
printf '/usr/sbin/WebAppMgr\0--app=com.webos.app.home\0' > "$T/proc/101/cmdline"       # must never be killed
printf 'luna-send\0-n\0com.webos.app.home\0' > "$T/proc/102/cmdline"                   # must never be killed
: > "$T/mounts"; echo native > "$T/samtype"

cat > "$T/mount" <<'M'
#!/bin/sh
# mount --bind SRC DST
echo "$2 $3 none rw 0 0" >> "$MOUNTS"
M
cat > "$T/umount" <<'M'
#!/bin/sh
[ "$1" = "-l" ] && shift
grep -v " $1 " "$MOUNTS" > "$MOUNTS.new"; cat "$MOUNTS.new" > "$MOUNTS"; rm -f "$MOUNTS.new"
M
cat > "$T/kill" <<'M'
#!/bin/sh
echo "$@" >> "$KILL_LOG"
M
# sam: reports the type of the app folder it last scanned; scans on a nudge or a block, if this fake TV allows it
cat > "$T/luna" <<'M'
#!/bin/sh
case "$*" in
  *getAppInfo*) printf '{\n "returnValue": true,\n "appInfo": {\n  "id": "com.webos.app.home",\n  "type": "%s"\n }\n}\n' "$(cat "$T/samtype")" ;;
  *getConfigs*) [ -f "$T/no_list" ] || printf '{\n "configs": {\n  "profile.blockedAppList": [ "some.blocked.app" ]\n },\n "returnValue": true\n}\n' ;;
  *setConfigs*) echo "setConfigs $*" >> "$T/luna.log"
                case "$*" in *tld.my.customlauncher.rescan*) [ -f "$T/obey_nudge" ] && { if grep -q " $APP_DIR " "$MOUNTS"; then echo web > "$T/samtype"; else echo native > "$T/samtype"; fi; } ;; esac
                echo '{"returnValue": true}' ;;
  *blockSystemApp*) echo "block $*" >> "$T/luna.log"
                [ -f "$T/obey_block" ] && { if grep -q " $APP_DIR " "$MOUNTS"; then echo web > "$T/samtype"; else echo native > "$T/samtype"; fi; echo '{"returnValue": true}'; } || echo '{"returnValue": false, "errorText": "unknown method"}' ;;
  *releaseBlockSystemApp*) echo "release $*" >> "$T/luna.log"; echo '{"returnValue": true}' ;;
  *applicationManager/scan*) echo "scan $*" >> "$T/luna.log"
                [ -f "$T/obey_scan" ] && { if grep -q " $APP_DIR " "$MOUNTS"; then echo web > "$T/samtype"; else echo native > "$T/samtype"; fi; echo '{"returnValue": true}'; } || echo '{"returnValue": false, "errorText": "unknown method"}' ;;
  *killApp*) echo "killApp $*" >> "$T/luna.log"; echo '{"returnValue": true}' ;;
  *getForegroundAppInfo*) cat "$T/front" 2>/dev/null ;;
  *listLaunchPoints*) echo '{"returnValue": true, "launchPoints": [{"id": "a.app.one", "title": "One"}, {"id": "a.app.two", "title": "Two"}, {"id": "a.app.three", "title": "Three"}]}' ;;
  *closeByAppId*) echo "closeByAppId $*" >> "$T/luna.log"; echo '{"returnValue": true}' ;;
  *applicationManager/launch*) echo "launch $*" >> "$T/luna.log"; echo '{"returnValue": true}' ;;
esac
M
cat > "$T/systemctl" <<'M'
#!/bin/sh
# only what the restart uses; killing or restarting sam makes it scan again, so it then reports the folder as mounted
case "$*" in
  *"kill -s 9 sam.service"*|*"restart --no-block sam"*)
      echo "sam restarted (boot-attempt present: $([ -f "$DIR/boot-attempt" ] && echo yes || echo no))" >> "$T/restarts"
      if grep -q " $APP_DIR " "$MOUNTS"; then echo web > "$T/samtype"; else echo native > "$T/samtype"; fi ;;
  *is-failed*) exit 1 ;;
esac
exit 0
M
printf '#!/bin/sh\necho "killall $*" >> "$T/restarts"\n' > "$T/killall"
chmod +x "$T/mount" "$T/umount" "$T/kill" "$T/luna" "$T/systemctl" "$T/killall"

run () {
    T="$T" DIR="$D" APP_DIR="$APP" LAUNCHER="$L" LINK="$T/init.d/47-launcher-takeover" LOG="$T/log" LOCK="$T/lock" \
    GUARD_PID="$T/guard.pid" PROC="$T/proc" MOUNTS="$T/mounts" LUNA_SEND="${LUNA_OVERRIDE:-$T/luna}" MOUNT_CMD="$T/mount" UMOUNT_CMD="$T/umount" \
    WATCH_PID="$T/watch.pid" VERIFY_PID="$T/verify.pid" FAKE_NOW="$FAKE_NOW" ALIVE_FILE="$T/alive" MARK_FILE="$T/mark" KEEP_LOG="$T/keep.log" \
    KILL_CMD="$T/kill" KILL_LOG="$T/kills" BLOCK_SCHEMA="$T/schema" SYSTEMCTL="$T/systemctl" KILLALL="$T/killall" UPTIME_FILE="$T/uptime" NAP=true WAIT_SAM=3 DRY_RUN=1 sh "$D/takeover.sh" "$@"
}
echo 5000 > "$T/uptime"
reset () { [ -f "$T/watch.pid" ] && kill -9 "$(cat "$T/watch.pid")" 2>/dev/null; rm -f "$T/watch.pid" "$T/verify.pid" "$T/fg_once" "$T/alive" "$T/mark" "$T/keep.log"; FAKE_NOW=; unset LUNA_OVERRIDE; : > "$T/mounts"; echo native > "$T/samtype"; echo 5000 > "$T/uptime"; rm -f "$T/restarts" "$T/schema" "$D/allow-restart" "$D/method" "$D/boot-attempt" "$T/kills" "$T/luna.log" "$T/log" "$D/enabled" "$T/init.d/47-launcher-takeover" "$T/lock" "$T/obey_nudge" "$T/obey_block" "$T/obey_scan" "$T/no_list" "$T/front"; }
mounted () { grep -q " $APP " "$T/mounts" && echo yes || echo no; }
kills () { [ -f "$T/kills" ] && tr '\n' ' ' < "$T/kills" | sed 's/ $//' || echo none; }

check "takeover.sh is valid shell" "$(sh -n "$S/takeover.sh" && echo ok)" "ok"

# ---- switching on: the TV takes the nudge ----
reset; touch "$T/obey_nudge"
check "on: reports applied" "$(run on | tail -n 1)" "applied"
check "on: the shim is mounted over LG Home" "$(mounted)" "yes"
check "on: sam reports the shim" "$(cat "$T/samtype")" "web"
check "on: LG Home's own process (and only that) is stopped" "$(kills)" "100"
check "on: it is kept on at boot (flag)" "$([ -f "$D/enabled" ] && echo yes)" "yes"
check "on: it is kept on at boot (link)" "$([ -L "$T/init.d/47-launcher-takeover" ] && echo yes)" "yes"
check "on: the shim has LG Home's id" "$(grep -c '"id": "com.webos.app.home"' "$D/stage/appinfo.json")" "1"
check "on: the shim is a web app" "$(grep -c '"type": "web"' "$D/stage/appinfo.json")" "1"
check "on: the shim declares the home category" "$(grep -c '"appCategory": \["home"\]' "$D/stage/appinfo.json")" "1"
check "on: the shim's page is plain black, with no script (a page with LG Home's id cannot make Luna calls)" "$(grep -c '<script' "$D/stage/index.html")" "0"
check "on: LG's blocked-app list was put back as it was" "$(grep setConfigs "$T/luna.log" | tail -n 1 | grep -c '\[ "some.blocked.app" \]')" "1"
check "apply again: nothing to do, nothing stopped" "$(run apply | tail -n 1; kills)" "applied
100"
check "status: all four" "$(run status | tr '\n' ' ')" "enabled mounted web linked "

# ---- LG's own Home wanted ----
printf '%s\n' '{"appId": "com.webos.app.home"}' > "$T/front"
check "stock: reports itself done" "$(run stock | tail -n 1)" "stock"
check "stock: LG Home's folder is back" "$(mounted)" "no"
check "stock: sam has LG's own manifest again" "$(cat "$T/samtype")" "native"
check "stock: the shim's page was closed last" "$(grep -c killApp "$T/luna.log")" "1"
check "stock: still switched on (it comes back)" "$([ -f "$D/enabled" ] && echo yes)" "yes"
# the guard: LG Home in front, then left
echo web > /dev/null
printf '%s\n' '{"appId": "youtube.leanback.v4"}' > "$T/front"
run guard >/dev/null 2>&1
check "guard: LG Home never seen and not waited long: nothing yet" "$(mounted)" "no"
# seen then left
( printf '%s\n' '{"appId": "com.webos.app.home"}' > "$T/front"; ) ; cat > "$T/luna2" <<'M'
#!/bin/sh
# first foreground answer: LG Home, afterwards: another app
case "$*" in
  *getForegroundAppInfo*) if [ -f "$T/seen_once" ]; then echo '{"appId": "youtube.leanback.v4"}'; else touch "$T/seen_once"; echo '{"appId": "com.webos.app.home"}'; fi ;;
  *) exec "$T/luna" "$@" ;;
esac
M
chmod +x "$T/luna2"; rm -f "$T/seen_once"; touch "$T/obey_nudge"
T="$T" DIR="$D" APP_DIR="$APP" LAUNCHER="$L" LINK="$T/init.d/47-launcher-takeover" LOG="$T/log" LOCK="$T/lock" GUARD_PID="$T/guard.pid" PROC="$T/proc" MOUNTS="$T/mounts" LUNA_SEND="$T/luna2" MOUNT_CMD="$T/mount" UMOUNT_CMD="$T/umount" KILL_CMD="$T/kill" KILL_LOG="$T/kills" NAP=true WAIT_SAM=3 sh "$D/takeover.sh" guard >/dev/null 2>&1
check "guard: after LG Home was left, Hearth has the place again" "$(mounted)" "yes"
check "guard: and sam has the shim" "$(cat "$T/samtype")" "web"

# ---- switching off ----
check "off: reports removed" "$(run off | tail -n 1)" "removed"
check "off: LG Home's folder is back" "$(mounted)" "no"
check "off: sam has LG's manifest" "$(cat "$T/samtype")" "native"
check "off: nothing left to start at boot" "$([ -e "$D/enabled" ] || [ -e "$T/init.d/47-launcher-takeover" ] || echo none)" "none"
check "off when it was never on is harmless" "$(run off | tail -n 1)" "removed"

# ---- the TV does not take it: everything is undone ----
reset
check "refused: reports sam-refused" "$(run on | tail -n 1)" "sam-refused"
check "refused: LG Home's folder is back" "$(mounted)" "no"
check "refused: LG Home's process was not stopped" "$(kills)" "none"
check "refused: nothing is kept for boot" "$([ -e "$D/enabled" ] || [ -e "$T/init.d/47-launcher-takeover" ] || echo none)" "none"
check "refused: both methods were tried" "$(grep -c 'setConfigs\|block' "$T/luna.log" | awk '{print ($1>=3)?"yes":"no"}')" "yes"

# ---- no blocked-app list on this TV (webOS 4): the block and release is used ----
reset; touch "$T/no_list" "$T/obey_block" "$T/schema"
check "no list, block works: applied" "$(run on | tail -n 1)" "applied"
check "block is always released" "$(grep -c '^release' "$T/luna.log" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

# ---- no gentle way at all (webOS 7), and restarting sam not allowed: refused up front, nothing touched ----
reset; touch "$T/no_list"
check "no gentle way, no permission: needs-restart" "$(run on | tail -n 1)" "needs-restart"
check "no gentle way, no permission: nothing was mounted" "$(mounted)" "no"
check "no gentle way, no permission: sam was not restarted" "$([ -f "$T/restarts" ] && echo restarted || echo no)" "no"
check "no gentle way, no permission: nothing is kept for boot" "$([ -e "$D/enabled" ] || [ -e "$T/init.d/47-launcher-takeover" ] || echo none)" "none"

# ---- only the plain scan works (nothing else does) ----
reset; touch "$T/no_list" "$T/obey_scan" "$T/schema"
check "only scan works: applied" "$(run on | tail -n 1)" "applied"
check "only scan works: the shim is mounted" "$(mounted)" "yes"

# ---- what a refusing TV said is in the log ----
reset; touch "$T/no_list" "$T/schema"
run on >/dev/null
check "the log says what configd answered" "$(grep -c 'configd said' "$T/log")" "1"
check "the log says what blockSystemApp answered" "$(grep -c 'blockSystemApp said: .*unknown method' "$T/log")" "1"
check "the log says what scan answered" "$(grep -c 'scan said: .*unknown method' "$T/log")" "1"
check "the log has a before, refused and after-undo probe of sam" "$(grep -c 'probe (before)\|probe (refused)\|probe (after-undo)' "$T/log" | awk '{print ($1>=3)?"yes":"no"}')" "yes"
check "the probe records what getAppInfo said" "$(grep -c 'getAppInfo said:.*qml\|getAppInfo said:.*native' "$T/log" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

# ---- webOS 7: no gentle way, restarting sam allowed ----
reset; touch "$T/no_list"; : > "$D/allow-restart"
printf '%s\n' '{"returnValue": true, "appId": "tld.my.customlauncher"}' > "$T/front"
check "restart allowed: applied" "$(run on | tail -n 1)" "applied"
check "restart allowed: the shim is mounted" "$(mounted)" "yes"
check "restart allowed: sam was restarted exactly once" "$(grep -c '^sam restarted' "$T/restarts")" "1"
check "restart allowed: the AirPlay helper was stopped first" "$(grep -c '^killall -9 LunaExecutable' "$T/restarts")" "1"
check "restart allowed: sam reports the shim" "$(cat "$T/samtype")" "web"
check "restart allowed: the app that was in front is opened again" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "1"
check "restart allowed: LG Home's own process is stopped" "$(kills)" "100"
check "restart allowed: it is remembered that a restart was needed" "$(cat "$D/method")" "restart"
check "apply again: no second restart" "$(run apply | tail -n 1; grep -c '^sam restarted' "$T/restarts")" "applied
1"
check "status: restart-allowed and restart-used" "$(run status | grep restart | tr '\n' ' ')" "restart-allowed restart-used "
check "stock where only a restart can put LG Home back: unsupported" "$(run stock | tail -n 1)" "unsupported"
check "stock: and nothing was changed" "$(mounted)" "yes"
rm -f "$D/allow-restart"
check "off: works even after the permission was withdrawn" "$(run off | tail -n 1)" "removed"
check "off: LG Home's folder is back" "$(mounted)" "no"
check "off: sam was restarted again to read LG's manifest" "$(grep -c '^sam restarted' "$T/restarts")" "2"
check "off: sam has LG's own manifest" "$(cat "$T/samtype")" "native"
check "off: the restart note is gone" "$([ -e "$D/method" ] && echo kept || echo gone)" "gone"

# a restart that does not produce the shim is undone
reset; touch "$T/no_list"; : > "$D/allow-restart"
printf '%s\n' '{"returnValue": true, "appId": "x.y"}' > "$T/front"
cp "$T/systemctl" "$T/systemctl.good"; printf '#!/bin/sh\nexit 0\n' > "$T/systemctl"
check "restart that changes nothing: sam-refused" "$(run on | tail -n 1)" "sam-refused"
check "restart that changes nothing: LG Home's folder is back" "$(mounted)" "no"
check "restart that changes nothing: nothing is kept for boot" "$([ -e "$D/enabled" ] || [ -e "$D/method" ] || echo none)" "none"
cp "$T/systemctl.good" "$T/systemctl"; chmod +x "$T/systemctl"

# ---- boot, where a restart is needed ----
reset; touch "$T/no_list"; : > "$D/allow-restart"; : > "$D/enabled"; echo restart > "$D/method"
printf '%s\n' '{"returnValue": true, "appId": "com.webos.app.hdmi1"}' > "$T/front"
run boot >/dev/null
check "boot (restart needed): Hearth takes the place" "$(mounted)" "yes"
check "boot (restart needed): the start-up mark is set while sam restarts" "$(grep -c 'boot-attempt present: yes' "$T/restarts")" "1"
check "boot (restart needed): and taken off once it is done" "$([ -e "$D/boot-attempt" ] && echo pending || echo done)" "done"
check "boot (restart needed): the app in front at the start is opened again" "$(grep -c 'launch .*com.webos.app.hdmi1' "$T/luna.log")" "1"
# a start-up that never finished (power-cycled) is not repeated
reset; touch "$T/no_list"; : > "$D/enabled"; echo restart > "$D/method"; : > "$D/boot-attempt"; ln -sf "$D/takeover.sh" "$T/init.d/47-launcher-takeover"
run boot >/dev/null
check "boot after an unfinished start-up: nothing is mounted" "$(mounted)" "no"
check "boot after an unfinished start-up: sam is not restarted" "$([ -f "$T/restarts" ] && echo restarted || echo no)" "no"
check "boot after an unfinished start-up: the takeover is switched off" "$([ -e "$D/enabled" ] || [ -e "$T/init.d/47-launcher-takeover" ] || [ -e "$D/boot-attempt" ] || echo off)" "off"
check "and Hearth is then told it is off" "$(run apply | tail -n 1)" "off"

# ---- apply early in a start, where the start-up hook will do it ----
reset; touch "$T/no_list"; : > "$D/enabled"; echo restart > "$D/method"; ln -sf "$D/takeover.sh" "$T/init.d/47-launcher-takeover"; echo 40 > "$T/uptime"
check "apply in the first two minutes of a start: busy, nothing restarted" "$(run apply | tail -n 1; [ -f "$T/restarts" ] && echo restarted || echo no)" "busy
no"
echo 500 > "$T/uptime"; : > "$D/allow-restart"
printf '%s\n' '{"returnValue": true, "appId": "x.y"}' > "$T/front"
check "apply later: puts it in place" "$(run apply | tail -n 1; mounted)" "applied
yes"

# ---- the watcher: opens Hearth when the TV reports the stand-in (LG Home's id) in front ----
reset; touch "$T/obey_nudge"; run on >/dev/null; : > "$T/luna.log"
printf '%s\n' '{"returnValue":true,"subscribed":true,"appId":"com.webos.app.home"}' '{"returnValue":true,"subscribed":true,"appId":"com.webos.app.home"}' '{"returnValue":true,"subscribed":true,"appId":"com.webos.app.hdmi1"}' '{"returnValue":true,"subscribed":true,"appId":"com.webos.app.home"}' > "$T/front"
FAKE_NOW=100 run watch >/dev/null 2>&1
check "watch: Hearth is asked for when the stand-in comes to the front (a repeat report straight after is ignored)" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "2"
check "watch: it is asked for with params, as the launcher does" "$(grep -c 'launch .*"params":{}' "$T/luna.log" | awk '{print ($1>=1)?"yes":"no"}')" "yes"
check "watch: and written down" "$(grep -c 'the stand-in is in front' "$T/log")" "2"
printf '%s\n' '{"returnValue":true,"appId":"tld.my.customlauncher"}' '{"returnValue":true,"appId":"netflix"}' > "$T/front"; : > "$T/luna.log"
FAKE_NOW=100 run watch >/dev/null 2>&1
check "watch: another app in front: nothing is opened" "$(grep -c launch "$T/luna.log")" "0"
printf '%s\n' '{"returnValue": true, "appId": "com.webos.app.home"}' > "$T/front"; : > "$T/luna.log"
FAKE_NOW=100 run watch >/dev/null 2>&1
check "watch: also where the TV writes a space after the colon" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "1"
printf '%s\n' '{"returnValue": true, "appId": "com.webos.app.fullhome"}' > "$T/front"; : > "$T/luna.log"; : > "$T/log"
FAKE_NOW=100 run watch >/dev/null 2>&1
check "watch: LG's full-screen Home (webOS 4.x) in front: Hearth is asked for too" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "1"
check "watch: and the log says which Home it was (no check for the stand-in)" "$(grep -c "full-screen Home" "$T/log"; grep -c 'the stand-in is in front' "$T/log")" "1
0"
# Hearth uninstalled: nothing to open, the takeover goes off
mv "$L/appinfo.json" "$L/x"; : > "$T/luna.log"
FAKE_NOW=100 run watch >/dev/null 2>&1; sleep 1
check "watch: Hearth uninstalled: nothing is asked for" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "0"
check "watch: Hearth uninstalled: the takeover is switched off, LG Home's folder is back" "$(mounted)" "no"
mv "$L/x" "$L/appinfo.json"

# ---- before the stand-in is in place: the watcher is the release helper (LG Home may flash), and nothing is judged a failure ----
reset; : > "$D/enabled"; printf '%s\n' '{"returnValue":true,"appId":"com.webos.app.home"}' > "$T/front"; : > "$T/luna.log"
FAKE_NOW=100 run watch >/dev/null 2>&1
check "watch before the mount: Hearth is asked for when LG Home comes to the front" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "1"
check "watch before the mount: and it says it is the early phase" "$(grep -c 'the stand-in is not in place yet' "$T/log")" "1"
check "watch before the mount: the takeover is still switched on" "$([ -e "$D/enabled" ] && echo on || echo off)" "on"

# ---- the watcher starts at once: from apply (when Hearth opens) and from boot, before any mount or restart ----
reset; touch "$T/no_list"; : > "$D/enabled"; echo restart > "$D/method"; ln -sf "$D/takeover.sh" "$T/init.d/47-launcher-takeover"; echo 40 > "$T/uptime"
check "apply in the first two minutes: the watcher is started, the restart is left to the start-up hook" "$(run apply | tail -n 1; grep -c 'starting the watcher' "$T/log"; mounted)" "busy
1
no"
reset; : > "$T/log"
check "apply when switched off: no watcher" "$(run apply | tail -n 1; grep -c 'starting the watcher' "$T/log")" "off
0"
reset; touch "$T/obey_nudge"; : > "$D/enabled"; run boot >/dev/null
check "boot: the watcher is started before the mount" "$(grep -n 'starting the watcher\|Hearth is in LG Home' "$T/log" | head -n 1 | grep -c 'starting the watcher')" "1"
reset; : > "$D/enabled"; : > "$D/boot-attempt"; run boot >/dev/null
check "boot after an unfinished start-up: no watcher is started" "$(grep -c 'starting the watcher' "$T/log")" "0"

# ---- verify: Hearth did not come up ----
reset; touch "$T/obey_nudge"; run on >/dev/null; : > "$T/luna.log"
printf '%s\n' '{"returnValue":true,"appId":"com.webos.app.home"}' > "$T/front"
run verify >/dev/null 2>&1
check "verify: still the stand-in: Hearth is asked for six more times (it can take 20 s to load)" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "6"
check "verify: on the third ask Hearth is closed first, once" "$(grep -c 'closeByAppId' "$T/luna.log")" "1"
check "verify: then the takeover is switched off" "$(mounted; [ -e "$D/enabled" ] && echo flag || echo noflag)" "no
noflag"
check "verify: and sam has LG's own Home again" "$(cat "$T/samtype")" "native"
reset; touch "$T/obey_nudge"; run on >/dev/null; : > "$T/luna.log"
cat > "$T/luna3" <<'M'
#!/bin/sh
# the stand-in in front the first time it is asked, Hearth afterwards
case "$*" in
  *getForegroundAppInfo*) if [ -f "$T/fg_once" ]; then echo '{"returnValue":true,"appId":"tld.my.customlauncher"}'; else touch "$T/fg_once"; echo '{"returnValue":true,"appId":"com.webos.app.home"}'; fi ;;
  *applicationManager/launch*) sleep 0.05; touch "$T/alive"; exec "$T/luna" "$@" ;;
  *) exec "$T/luna" "$@" ;;
esac
M
chmod +x "$T/luna3"
LUNA_OVERRIDE="$T/luna3" run verify >/dev/null 2>&1
check "verify: one more ask, then Hearth shows itself (alive mark newer than the ask): stays on" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log"; mounted)" "1
yes"
reset; touch "$T/obey_nudge"; run on >/dev/null; : > "$T/luna.log"
printf '%s\n' '{"returnValue":true,"appId":"tld.my.customlauncher"}' > "$T/front"
touch -d '2000-01-01' "$T/mark"; touch "$T/alive"
run verify >/dev/null 2>&1
check "verify: Hearth in front and shown itself since the ask: no ask, stays on" "$(grep -c launch "$T/luna.log"; mounted)" "0
yes"
# the black screen the release helper also guards against: the TV reports Hearth in front, but it never shows itself
reset; touch "$T/obey_nudge"; run on >/dev/null; : > "$T/luna.log"
printf '%s\n' '{"returnValue":true,"appId":"tld.my.customlauncher"}' > "$T/front"
touch "$T/alive"; touch -d '2030-01-01' "$T/mark"
run verify >/dev/null 2>&1
check "verify: Hearth reported in front but not alive: it is asked for again, six times" "$(grep -c 'launch .*tld.my.customlauncher' "$T/luna.log")" "6"
check "verify: and closed once, so it starts afresh" "$(grep -c closeByAppId "$T/luna.log")" "1"
check "verify: and then the takeover is switched off, LG Home's folder is back" "$(mounted)" "no"
check "verify: the log is kept for after a restart" "$([ -s "$T/keep.log" ] && echo kept || echo none)" "kept"
check "verify: and says Hearth was reported in front" "$(grep -c 'Hearth, reported in front' "$T/log" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

# ---- the watcher and the restart of sam: stopped before, a fresh one started after ----
reset; touch "$T/no_list"; : > "$D/allow-restart"
printf '%s\n' '{"returnValue": true, "appId": "tld.my.customlauncher"}' > "$T/front"
sleep 60 & echo $! > "$T/watch.pid"; oldwatch=$!
run on >/dev/null
st=$(awk '/^State:/{print $2}' "/proc/$oldwatch/status" 2>/dev/null)
check "sam restart: the watcher that was running is stopped first" "$([ -z "$st" ] || [ "$st" = Z ] && echo stopped || echo running)" "stopped"
r=$(grep -n 'restarting sam' "$T/log" | head -n 1 | cut -d: -f1); w=$(grep -n 'starting the watcher' "$T/log" | head -n 1 | cut -d: -f1)
check "sam restart: a fresh watcher is started after it, not before" "$([ -n "$r" ] && [ -n "$w" ] && [ "$w" -gt "$r" ] && echo after || echo "wrong (restart line ${r:-none}, watcher line ${w:-none})")" "after"

# ---- a start-up that the TV would not take: the watcher is back as the helper ----
reset; touch "$T/no_list"; : > "$D/allow-restart"; : > "$D/enabled"; echo restart > "$D/method"
printf '%s\n' '{"returnValue": true, "appId": "tld.my.customlauncher"}' > "$T/front"
cp "$T/systemctl" "$T/systemctl.good"; printf '#!/bin/sh\nexit 0\n' > "$T/systemctl"
run boot >/dev/null
check "boot, the TV does not take it: LG Home's folder is back" "$(mounted)" "no"
check "boot, the TV does not take it: it stays switched on" "$([ -e "$D/enabled" ] && echo on || echo off)" "on"
check "boot, the TV does not take it: the watcher is running again, as the release helper" "$(grep -c 'starting the watcher' "$T/log" | awk '{print ($1>=2)?"yes":"no"}')" "yes"
cp "$T/systemctl.good" "$T/systemctl"; chmod +x "$T/systemctl"

# ---- the real watcher as a background process: started, noticed, and gone for good when switched off ----
reset; touch "$T/obey_nudge"; : > "$D/enabled"
run on >/dev/null
unset DRY_RUN
WP="$T/watch.pid"
( T="$T" DIR="$D" APP_DIR="$APP" LAUNCHER="$L" LOG="$T/log" LOCK="$T/lock" GUARD_PID="$T/guard.pid" PROC="$T/proc" MOUNTS="$T/mounts" LUNA_SEND="$T/luna" MOUNT_CMD="$T/mount" UMOUNT_CMD="$T/umount" WATCH_PID="$WP" VERIFY_PID="$T/verify.pid" KILL_CMD="$T/kill" KILL_LOG="$T/kills" BLOCK_SCHEMA="$T/schema" SYSTEMCTL="$T/systemctl" KILLALL="$T/killall" LINK="$T/init.d/47-launcher-takeover" NAP=true sh "$D/takeover.sh" watch >/dev/null 2>&1 & )
sleep 2
wp=$(cat "$WP" 2>/dev/null)
check "watcher: a real watcher is running and has written its pid" "$([ -n "$wp" ] && kill -0 "$wp" 2>/dev/null && echo alive || echo not)" "alive"
check "watcher: status says so" "$(T="$T" DIR="$D" APP_DIR="$APP" LAUNCHER="$L" LOG="$T/log" MOUNTS="$T/mounts" LUNA_SEND="$T/luna" WATCH_PID="$WP" LINK="$T/init.d/47-launcher-takeover" sh "$D/takeover.sh" status | grep -c watching)" "1"
T="$T" DIR="$D" APP_DIR="$APP" LAUNCHER="$L" LOG="$T/log" LOCK="$T/lock" GUARD_PID="$T/guard.pid" PROC="$T/proc" MOUNTS="$T/mounts" LUNA_SEND="$T/luna" MOUNT_CMD="$T/mount" UMOUNT_CMD="$T/umount" WATCH_PID="$WP" VERIFY_PID="$T/verify.pid" KILL_CMD="$T/kill" KILL_LOG="$T/kills" BLOCK_SCHEMA="$T/schema" SYSTEMCTL="$T/systemctl" KILLALL="$T/killall" LINK="$T/init.d/47-launcher-takeover" NAP=true sh "$D/takeover.sh" off >/dev/null
sleep 1
# (a killed process nobody has reaped yet is a zombie, state Z, and still answers kill -0)
state=$(awk '/^State:/{print $2}' "/proc/$wp/status" 2>/dev/null)
check "watcher: switching off stops it (it must never open Hearth over LG's own Home)" "$([ -z "$state" ] || [ "$state" = Z ] && echo gone || echo alive)" "gone"
check "watcher: and removes its pid file" "$([ -e "$WP" ] && echo kept || echo gone)" "gone"
DRY_RUN=1

# ---- other refusals ----
reset; touch "$T/obey_nudge"; mv "$L/appinfo.json" "$L/x"
check "Hearth not installed: launcher-missing" "$(run on | tail -n 1)" "launcher-missing"
check "Hearth not installed: nothing mounted" "$(mounted)" "no"
mv "$L/x" "$L/appinfo.json"
mv "$D/shim.html" "$D/x"
check "shim missing: files-missing" "$(run on | tail -n 1)" "files-missing"
mv "$D/x" "$D/shim.html"
reset; touch "$T/obey_nudge"; echo "$$" > "$T/lock"
check "another run in progress: busy" "$(run on | tail -n 1)" "busy"
rm -f "$T/lock"

# ---- boot ----
reset; touch "$T/obey_nudge"
run boot >/dev/null
check "boot: not switched on: nothing is mounted" "$(mounted)" "no"
: > "$D/enabled"
run boot >/dev/null
check "boot: switched on: Hearth takes the place" "$(mounted)" "yes"
check "boot: a stale block is released first" "$(grep -c '^release' "$T/luna.log" | awk '{print ($1>=1)?"yes":"no"}')" "yes"
reset; touch "$T/obey_nudge"; : > "$D/enabled"; mv "$L/appinfo.json" "$L/x"
run boot >/dev/null
check "boot: Hearth uninstalled: LG Home is left alone" "$(mounted)" "no"
mv "$L/x" "$L/appinfo.json"

# ---- apply ----
reset; touch "$T/obey_nudge"
check "apply when switched off: says off, touches nothing" "$(run apply | tail -n 1; mounted)" "off
no"
: > "$D/enabled"
check "apply when switched on but not in place (after a reboot): puts it in place" "$(run apply | tail -n 1; mounted)" "applied
yes"

rm -rf "$T"
[ "$fail" = 0 ] && echo "takeover.sh: all passed" || { echo "takeover.sh: FAILURES"; exit 1; }
