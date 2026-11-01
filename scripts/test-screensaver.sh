#!/bin/sh
# Tests for src/screensaver/screensaver.sh on a fake TV (fake folders and mount).   Run: npm test
S="$(cd "$(dirname "$0")/../src/screensaver" && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }

mkdir -p "$T/dir" "$T/app/qml" "$T/launcher/wallpapers" "$T/photos" "$T/init"
cp "$S/screensaver.sh" "$T/dir/"; cp "$S/main.qml" "$T/dir/main.qml.template"
echo '{"id":"com.webos.app.screensaver","type":"qml","main":"qml/main.qml"}' > "$T/app/appinfo.json"
echo stock > "$T/app/qml/main.qml"; echo '{}' > "$T/launcher/appinfo.json"
touch "$T/launcher/wallpapers/photo-01.jpg" "$T/launcher/wallpapers/photo-02.jpg" "$T/photos/a b.jpg" "$T/photos/c.PNG" "$T/photos/bad#x.jpg" "$T/photos/note.txt" "$T/photos/anim.gif"
: > "$T/mounts"
printf '#!/bin/sh\necho "x $3 y z" >> "$MOUNTS"\n' > "$T/mount"
printf '#!/bin/sh\ngrep -v " $1 " "$MOUNTS" > "$MOUNTS.n"; cat "$MOUNTS.n" > "$MOUNTS"; rm -f "$MOUNTS.n"\n' > "$T/umount"
cat > "$T/luna" <<'EOF'
#!/bin/sh
printf "%s\n" "$*" >> "$T_LUNA"
case "$*" in
    *releaseBlockSystemApp*) touch "$T_STATE/released"; echo '{"returnValue": true}' ;;
    *blockSystemApp*) if [ -n "$FAIL_BLOCK" ]; then echo '{"returnValue": false, "errorText": "refused"}'; else echo '{"returnValue": true}'; fi ;;
    *getPowerState*) echo "{\"returnValue\": true, \"state\": \"$(cat "$T_STATE/power" 2>/dev/null)\"}" ;;
    *powerOff*) echo '{"returnValue": true}' ;;
    *getAppInfo*) if [ -f "$T_STATE/released" ]; then echo '{"returnValue": true, "appInfo": {"id": "x", "type": "qml"}}'; else echo '{"returnValue": true, "appInfo": {"id": "x", "type": "flutter"}}'; fi ;;
    *) echo '{"returnValue": true}' ;;
esac
EOF
mkdir -p "$T/state"
cat > "$T/now" <<'EOF'
#!/bin/sh
n=$(cat "$T_STATE/clock" 2>/dev/null || echo 0); n=$((n + 10)); echo "$n" > "$T_STATE/clock"; echo "$n"
EOF
chmod +x "$T/now"
chmod +x "$T/mount" "$T/umount" "$T/luna"
export DIR="$T/dir" APP="$T/app" LAUNCHER="$T/launcher" LINK="$T/init/49" LOG="$T/log" MOUNTS="$T/mounts" MOUNT_CMD="$T/mount" UMOUNT_CMD="$T/umount" LUNA_SEND="$T/luna" T_LUNA="$T/lunalog" T_STATE="$T/state" BLOCK_SCHEMA="$T/no-schema" NAP=true
run () { sh "$T/dir/screensaver.sh" "$@" 2>/dev/null | tail -n 1; }

printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\n' "$T/photos" > "$T/dir/settings"
check "on mounts ours over the app's main file" "$(run on)" applied
check "the mount is over the manifest's main file" "$(cut -d' ' -f2 "$T/mounts")" "$T/app/qml/main.qml"
check "the link was added" "$([ -L "$T/init/49" ] && echo yes)" yes
check "pictures and GIFs with safe names are listed" "$(grep -c 'file://' "$T/dir/main.qml")" 3
check "a GIF is listed" "$(grep -c 'anim.gif' "$T/dir/main.qml")" 1
head -c 3000 /dev/zero > "$T/photos/big.gif"
check "a big GIF is kept (no size cap)" "$(run apply >/dev/null; grep -c 'big.gif' "$T/dir/main.qml")" 1
rm -f "$T/photos/big.gif"; run apply >/dev/null
check "a space in a name is written as %20" "$(grep -c 'a%20b.jpg' "$T/dir/main.qml")" 1
check "settings are filled in" "$(grep -E 'property (int intervalSec|bool shuffle|bool dim):' "$T/dir/main.qml" | sed 's/.*: //' | tr '\n' ' ')" "20 true false "
printf 'source=%s\ninterval=7200\nshuffle=0\ndim=1\n' "$T/photos" > "$T/dir/settings"
check "dim on, shuffle off, interval capped at 3600 s" "$(run apply >/dev/null; grep -E 'property (int intervalSec|bool shuffle|bool dim):' "$T/dir/main.qml" | sed 's/.*: //' | tr '\n' ' ')" "3600 false true "
printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\ncare=2\n' "$T/photos" > "$T/dir/settings"
check "care is on or off only (2 counts as on)" "$(run apply >/dev/null; grep -E 'property int careMode:' "$T/dir/main.qml" | sed 's/.*: //')" 1
printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\n' "$T/photos" > "$T/dir/settings"
check "care defaults to on" "$(run apply >/dev/null; grep -E 'property int careMode:' "$T/dir/main.qml" | sed 's/.*: //')" 1
printf 'source=@photos\ninterval=20\nshuffle=1\ndim=0\n' > "$T/dir/settings"
check "@photos plays the bundled photos" "$(run apply >/dev/null; grep -c 'photo-0' "$T/dir/main.qml")" 2
printf 'source=@video\ninterval=20\nshuffle=1\ndim=0\n' > "$T/dir/settings"
check "@video without the built-in file says no-video" "$(run apply)" no-video
mkdir -p "$T/launcher/saver"; touch "$T/launcher/saver/builtin.mp4"
check "@video with the built-in file plays only that" "$(run apply >/dev/null; grep -c 'builtin.mp4' "$T/dir/main.qml")" 1
rm -rf "$T/launcher/saver"
printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\n' "$T/photos" > "$T/dir/settings"; run apply >/dev/null
printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\npoweroff=30\n' "$T/photos" > "$T/dir/settings"
export NOW_CMD="$T/now"
echo "Screen Saver" > "$T/state/power"; rm -f "$T/state/clock"; : > "$T/lunalog"
DRY_RUN=1 WATCH_LOOPS=8 run apply >/dev/null
check "power off: 30 s of screen saver switches the TV off, once" "$(grep -c 'powerOff' "$T/lunalog")" 1
check "the raw power state is logged" "$(grep -c "power state: 'Screen Saver'" "$T/log" | sed 's/^[1-9][0-9]*$/yes/')" yes
echo "Active" > "$T/state/power"; rm -f "$T/state/clock"; : > "$T/lunalog"
DRY_RUN=1 WATCH_LOOPS=8 run apply >/dev/null
check "no power off while the TV is Active" "$(grep -c 'powerOff' "$T/lunalog")" 0
printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\npoweroff=0\n' "$T/photos" > "$T/dir/settings"
echo "Screen Saver" > "$T/state/power"; rm -f "$T/state/clock"; : > "$T/lunalog"
DRY_RUN=1 WATCH_LOOPS=8 run apply >/dev/null
check "power off set to Off: the TV is left alone" "$(grep -c 'powerOff' "$T/lunalog")" 0
unset NOW_CMD
printf 'source=%s\ninterval=20\nshuffle=1\ndim=0\n' "$T/photos" > "$T/dir/settings"; run apply >/dev/null
check "a second apply does not stack mounts" "$(run apply >/dev/null; wc -l < "$T/mounts" | tr -d ' ')" 1
check "status says enabled, mounted, linked" "$(sh "$T/dir/screensaver.sh" status | tr '\n' ' ')" "enabled mounted linked "

: > "$T/dir/settings"
check "with no source the bundled photos are used" "$(run apply >/dev/null; grep -c 'photo-0' "$T/dir/main.qml")" 2
echo 'source=/nonexistent' > "$T/dir/settings"
check "a missing folder falls back to the bundled photos" "$(run apply >/dev/null; grep -c 'photo-0' "$T/dir/main.qml")" 2

check "show says shown" "$(run show)" shown
check "show asks the TV's power service" "$(grep -c 'turnOnScreenSaver' "$T/lunalog")" 1
check "off takes it all away" "$(run off)" removed
check "after off nothing is mounted" "$(wc -l < "$T/mounts" | tr -d ' ')" 0
check "after off the link and flag are gone" "$([ -e "$T/init/49" ] || [ -e "$T/dir/enabled" ] || echo gone)" gone

check "apply while off does nothing" "$(run apply)" off
echo '{"id":"com.webos.app.screensaver","type":"flutter"}' > "$T/app/appinfo.json"
check "a TV whose own screen saver is not QML is left alone" "$(run on)" unsupported
check "nothing was mounted there" "$(wc -l < "$T/mounts" | tr -d ' ')" 0
echo '{"id":"com.webos.app.screensaver","type":"flutter","main":"main.dart"}' > "$T/app/appinfo.json"
touch "$T/schema"; export BLOCK_SCHEMA="$T/schema"
check "webOS 10: LG's flutter saver is replaced by the staged app" "$(run on)" applied
check "the staged manifest is QML" "$(grep -c '"type": "qml"' "$T/dir/app/appinfo.json")" 1
check "the staged manifest points at our QML" "$(grep -c '"main": "qml/main.qml"' "$T/dir/app/appinfo.json")" 1
check "our QML is inside the staged folder" "$([ -f "$T/dir/app/qml/main.qml" ] && echo yes)" yes
check "the staged folder is mounted over the app folder" "$(cut -d' ' -f2 "$T/mounts")" "$T/app"
check "sam was asked to block and release the app" "$(grep -c -i 'blocksystemapp' "$T/lunalog")" 2
check "a second apply does not stack mounts there" "$(run apply >/dev/null; wc -l < "$T/mounts" | tr -d ' ')" 1
check "off puts LG's saver back" "$(run off)" removed
check "nothing is mounted after off" "$(wc -l < "$T/mounts" | tr -d ' ')" 0
rm -f "$T/state/released"
check "webOS 10: if sam will not read it, nothing is kept" "$(FAIL_BLOCK=1 run on)" not-taken
check "nothing is mounted after that" "$(wc -l < "$T/mounts" | tr -d ' ')" 0
check "and no flag or link is left" "$([ -e "$T/init/49" ] || [ -e "$T/dir/enabled" ] || echo gone)" gone
export BLOCK_SCHEMA="$T/no-schema"
echo '{"id":"com.webos.app.screensaver","type":"qml"}' > "$T/app/appinfo.json"; rm -f "$T/app/qml/main.qml"
check "no QML file: no-target" "$(run on)" no-target
echo stock > "$T/app/qml/main.qml"

check "on again" "$(run on)" applied
rm -f "$T/launcher/appinfo.json"
DRY_RUN=1 sh "$T/dir/screensaver.sh" boot >/dev/null 2>&1
check "boot without Hearth removes its own folder" "$([ -d "$T/dir" ] && echo left || echo gone)" gone
check "boot without Hearth removes the link" "$([ -e "$T/init/49" ] && echo left || echo gone)" gone
check "boot without Hearth takes the mount off" "$(wc -l < "$T/mounts" | tr -d ' ')" 0

rm -rf "$T"
[ "$fail" = 0 ] && echo "screensaver script: all ok"
exit "$fail"
