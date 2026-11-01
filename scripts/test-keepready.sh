#!/bin/sh
# Test of src/keepready/keepready.sh on a fake TV in a temp folder (fake luna-send, mount, umount, systemctl).
# Usage: sh scripts/test-keepready.sh   (prints "ok" lines, exits 1 on the first failure)
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SH="$HERE/src/keepready/keepready.sh"
S=$(mktemp -d); trap 'rm -rf "$S"' EXIT
mkdir -p "$S/bin" "$S/apps/tld.my.customlauncher" "$S/etc/mm" "$S/init"
echo '{}' > "$S/apps/tld.my.customlauncher/appinfo.json"
cat > "$S/etc/mm/memchute.json" <<'EOT'
{
  "Policy": "lite",
  "KeepOnLaunchEx": [
    "com.webos.app.home",
    "com.webos.app.fullhome"
  ],
  "Other": 1
}
EOT
cat > "$S/bin/luna" <<'EOT'
#!/bin/sh
if [ "$1" = -n ]; then U="$3"; B="$4"; else U="$2"; B="$3"; fi
case "$U" in
 *getForegroundAppInfo) cat "$FAKE/front" ;;
 *running) cat "$FAKE/running" ;;
 *launch) echo "$B" >> "$FAKE/launches"
    if [ -f "$FAKE/preload_fg" ] && echo "$B" | grep -q preload; then echo '{"returnValue":true,"appId":"tld.my.customlauncher"}' > "$FAKE/front"; fi
    echo '{"returnValue":true}' ;;
esac
EOT
cat > "$S/bin/mount" <<'EOT'
#!/bin/sh
[ -f "$FAKE/mount_fail" ] && exit 1
cp "$3" "$FAKE/orig.$(basename "$3")"; cp "$2" "$FAKE/mounted_src"; cp "$2" "$3"; echo "$3" > "$FAKE/mounted_on"
EOT
cat > "$S/bin/umount" <<'EOT'
#!/bin/sh
echo "$1" > "$FAKE/umounted"; [ -f "$FAKE/orig.$(basename "$1")" ] && cp "$FAKE/orig.$(basename "$1")" "$1"
EOT
cat > "$S/bin/systemctl" <<'EOT'
#!/bin/sh
case "$1" in list-units) [ -f "$FAKE/no_unit" ] || echo "memorymanager.service loaded active running x" ;; restart) echo "$2" >> "$FAKE/restarts" ;; is-active) if [ -f "$FAKE/inactive" ]; then echo failed; else echo active; fi ;; esac
EOT
chmod +x "$S"/bin/*
export FAKE="$S" DIR="$S/dir" LINK="$S/init/51" APPS="$S/apps" LUNA_SEND="$S/bin/luna" NAP=true DELAY=0 LOG="$S/log" PIDFILE="$S/pid" CHECKPID="$S/cpid" SYSLOG="$S/syslog" SEARCH_DIRS="$S/etc" MOUNT_CMD="$S/bin/mount" UMOUNT_CMD="$S/bin/umount" SYSTEMCTL="$S/bin/systemctl" DISCOVERED="$S/discovered"
fail () { echo "FAIL: $*"; echo "--- log"; cat "$S/log" 2>/dev/null; exit 1; }
ok () { echo "ok: $*"; }
has () { grep -q -- "$2" "$1" 2>/dev/null; }

echo 'x APP_CLOSED {"app_id":"tld.my.customlauncher"} request close by launch(lite/policy)' > "$S/syslog"
echo '{"returnValue":true,"appId":"com.webos.app.hdmi1"}' > "$S/front"
echo '{"returnValue":true,"running":[{"id":"com.webos.app.hdmi1","pid":"1"}]}' > "$S/running"

[ "$(sh "$SH" apply 3)" = "result=bad-argument" ] || fail "old level argument accepted"; ok "only on and off are accepted"
# on: apply starts run in the background; call run in the foreground instead for a deterministic test
mkdir -p "$DIR"; echo on > "$DIR/on"
sh "$SH" run >/dev/null 2>&1 </dev/null
has "$S/log" "discover: .*memchute.json" || fail "discover"; ok "discover finds the list"
has "$S/log" "memory list: Hearth added" || fail "patch"; ok "memory list patched"
grep -c tld.my.customlauncher "$S/mounted_src" | grep -q '^1$' || fail "id once in copy"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$S/mounted_src" 2>/dev/null || command -v node >/dev/null && ok "copy is valid JSON" || ok "(no node here)"
grep -q 'memorymanager.service' "$S/restarts" || fail "restart"; ok "memory manager restarted"
has "$S/log" "check: 0s after com.webos.app.hdmi1 .*Hearth is NOT in memory" || sleep 1
has "$S/log" "front: com.webos.app.hdmi1" || fail "front line"; ok "watcher saw the app in front"
sleep 1
has "$S/log" "Hearth is NOT in memory" || fail "not in memory"; ok "missing Hearth noticed"
has "$S/log" "why:   .*APP_CLOSED" || fail "why lines"; ok "system log reason logged"
[ ! -f "$S/launches" ] || fail "something was launched"; ok "the watcher launches nothing"
sh "$SH" status | grep -q 'on=yes .*memlist=changed relaunch=no state=ok' || fail "status: $(sh "$SH" status)"; ok "status (state ok after a good run)"
grep -q -i -E 'free|VmRSS|MemAvailable| MB' "$S/log" && fail "memory figures in the log"; ok "no memory figures logged"

# Hearth still in memory: left alone, no numbers
rm -f "$S/launches"
echo '{"returnValue":true,"running":[{"id":"tld.my.customlauncher","pid":"9","keepAlive":true}]}' > "$S/running"
echo '{"returnValue":true,"appId":"com.webos.app.hdmi1"}' > "$S/front"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
has "$S/log" "Hearth IS in memory" || fail "in memory"; [ ! -f "$S/launches" ] || fail "launched though alive"; ok "alive Hearth left alone"

# an older install (file level with 3) counts as on and is converted
rm -f "$DIR/on"; echo 3 > "$DIR/level"
sh "$SH" status | grep -q 'on=yes' || fail "old level 3 not read as on"
[ -f "$DIR/on" ] && [ ! -f "$DIR/level" ] || fail "old level file not converted"; ok "old level 3 file converted to on"
echo 2 > "$DIR/level"; rm -f "$DIR/on"
sh "$SH" status | grep -q 'on=no' || fail "old level 2 read as on"; ok "old level 2 reads as off"

# apply on from nothing: flag, link, ok
rm -f "$DIR/on" "$DIR/level" "$LINK" "$S/discovered"
[ "$(sh "$SH" apply on)" = "result=ok" ] || fail "apply on"
[ -f "$DIR/on" ] && [ -L "$LINK" ] || fail "apply on left no flag or link"; ok "apply on: flag and start-up link"
sleep 1; sh "$SH" status | grep -q 'on=yes' || fail "status after apply on"

# off: everything removed, mount undone
rm -f "$S/restarts"
sh "$SH" apply off | grep -q result=off || fail "off"
[ ! -d "$DIR" ] && [ ! -e "$LINK" ] || fail "files left"
has "$S/umounted" "memchute.json" || fail "umount"; ok "off removes files and the mount"

# Hearth uninstalled: start-up run cleans up
mkdir -p "$DIR"; echo on > "$DIR/on"; ln -sf "$DIR/keepready.sh" "$LINK"; rm -f "$S/apps/tld.my.customlauncher/appinfo.json"
sh "$SH" run >/dev/null 2>&1 </dev/null
[ ! -d "$DIR" ] && [ ! -e "$LINK" ] || fail "no cleanup"; ok "uninstalled Hearth: cleaned up"

# P74: every failure writes a code the launcher turns into plain words
restore_list () { printf '{\n  "KeepOnLaunchEx": [\n    "com.webos.app.home"\n  ]\n}\n' > "$S/etc/mm/memchute.json"; echo '{}' > "$S/apps/tld.my.customlauncher/appinfo.json"; rm -f "$S/mounted_src" "$S/restarts" "$S/mount_fail" "$S/no_unit" "$S/inactive" "$S/launches"; rm -rf "$DIR" "$LINK" "$S/discovered"; mkdir -p "$DIR"; echo on > "$DIR/on"; }
state_is () { [ "$(cat "$DIR/state" 2>/dev/null)" = "$1" ]; }
restore_list; touch "$S/mount_fail"; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
state_is mount-failed || fail "mount failure state: $(cat "$DIR/state")"; ok "state mount-failed"
sh "$SH" status | grep -q 'state=mount-failed' || fail "status shows the failure"; ok "status shows the failure code"
has "$S/log" "run: the memory list was not changed" || fail "run continued after failure"; ok "no watcher after a failure"
restore_list; touch "$S/no_unit"; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
state_is no-service || fail "no-service state: $(cat "$DIR/state")"; ok "state no-service"
restore_list; touch "$S/inactive"; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
state_is restart-failed || fail "restart-failed state: $(cat "$DIR/state")"; ok "state restart-failed"
restore_list; rm -rf "$S/etc/mm"; mkdir -p "$S/etc/mm"; echo '{}' > "$S/etc/mm/x.json"; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
state_is no-list || fail "no-list state: $(cat "$DIR/state")"; ok "state no-list"
restore_list; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
state_is ok || fail "ok state: $(cat "$DIR/state")"; ok "a good run ends with state ok"
[ "$(sh "$SH" apply on relaunch)" = "result=ok" ] && [ -f "$DIR/relaunch" ] || fail "apply on relaunch"; ok "apply on relaunch sets the file"
sh "$SH" status | grep -q 'relaunch=yes' || fail "status relaunch"; ok "status shows relaunch"
[ "$(sh "$SH" apply on)" = "result=ok" ] && [ ! -f "$DIR/relaunch" ] || fail "apply on clears relaunch"; ok "apply on without relaunch removes the file"

# P75: the optional reopening
echo '{"returnValue":true,"running":[{"id":"com.webos.app.hdmi1","pid":"1"}]}' > "$S/running"
echo on > "$DIR/relaunch"; rm -f "$S/launches"
echo '{"returnValue":true,"appId":"com.webos.app.home"}' > "$S/front"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
has "$S/launches" '"keepAlive":true' || fail "relaunch with LG Home in front"; ok "relaunch: Hearth opened with keepAlive when LG Home is in front"
rm -f "$S/launches"; echo '{"returnValue":true,"appId":"com.webos.app.hdmi1"}' > "$S/front"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
[ ! -f "$S/launches" ] && has "$S/log" "not interrupting" || fail "relaunch interrupted an app"; ok "relaunch: an app in front is never interrupted"
echo '{"returnValue":true,"running":[{"id":"tld.my.customlauncher","pid":"9"}]}' > "$S/running"; echo '{"returnValue":true,"appId":"com.webos.app.home"}' > "$S/front"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
[ ! -f "$S/launches" ] && has "$S/log" "relaunch: not needed" || fail "relaunch though Hearth is in memory"; ok "relaunch: not needed when Hearth is in memory"
rm -f "$DIR/relaunch"; echo '{"returnValue":true,"running":[{"id":"com.webos.app.hdmi1","pid":"1"}]}' > "$S/running"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
[ ! -f "$S/launches" ] || fail "relaunch without the file"; ok "relaunch off: nothing is opened"

# P75b: after a restart of the TV the earlier copy is mounted again without a search
restore_list; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
state_is ok && [ -f "$DIR/memlist.sum" ] && [ -f "$DIR/memlist.copy" ] || fail "first run left no copy or sum"; ok "the first run keeps the copy and the checksum of the original"
cp "$S/orig.memchute.json" "$S/etc/mm/memchute.json"      # a restart of the TV: the mount is gone, the file is the TV's own again
rm -f "$S/mounted_src" "$S/restarts"
SEARCH_DIRS="$S/nowhere" sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
has "$S/log" "mounted again over" && state_is ok && grep -q tld.my.customlauncher "$S/etc/mm/memchute.json" || fail "fast re-mount: $(tail -3 "$S/log")"; ok "restart of the TV: the earlier copy is mounted again, no search"
[ -f "$S/restarts" ] || fail "no restart after the fast mount"; ok "the memory manager is still restarted once"
# the TV's own file changed (firmware update): the copy is built again
cp "$S/orig.memchute.json" "$S/etc/mm/memchute.json"; printf '{\n  "KeepOnLaunchEx": [\n    "com.webos.app.home"\n  ],\n  "NewKey": 5\n}\n' > "$S/etc/mm/memchute.json"
rm -f "$S/mounted_src"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
has "$S/log" "has changed since the copy was made" && grep -q NewKey "$S/mounted_src" && state_is ok || fail "changed original not rebuilt: $(tail -4 "$S/log")"; ok "a changed list file: the copy is built again from the new one"

# P75b: a watcher started by the start-up link records its own pid, and apply stops it
restore_list; sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1; rm -f "$PIDFILE"
sh "$SH" boot; sleep 1
bp=$(cat "$PIDFILE" 2>/dev/null)
[ -n "$bp" ] && kill -0 "$bp" 2>/dev/null || fail "boot: the pid file names no live process ($bp)"; ok "boot: the pid file names the live watcher"
sh "$SH" apply on >/dev/null; sleep 1
# a stopped child nobody has collected yet (zombie, state Z) counts as stopped: the sandbox has no init to collect it
st=$(ps -o stat= -p "$bp" 2>/dev/null | cut -c1)
if kill -0 "$bp" 2>/dev/null && [ "$st" != Z ]; then fail "the boot watcher survived apply"; fi; ok "apply stops the watcher the start-up link made"

# a list without an LG Home entry is left alone
echo '{"KeepOnLaunchEx":["x.y"]}' > "$S/etc/mm/memchute.json"; echo '{}' > "$S/apps/tld.my.customlauncher/appinfo.json"
mkdir -p "$DIR"; echo on > "$DIR/on"; rm -f "$S/mounted_src"
sh "$SH" run >/dev/null 2>&1 </dev/null; sleep 1
[ ! -f "$S/mounted_src" ] && has "$S/log" "no LG Home entry" || fail "unknown list was changed"; ok "unknown list format: nothing changed"
echo "all ok"
