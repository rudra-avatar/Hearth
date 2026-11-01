#!/bin/sh
# Tests for src/poweron/guard.sh (the start-up check of "When the TV turns on, open...") with fake folders.
# Run: npm test
S="$(cd "$(dirname "$0")/../src/poweron" && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }
check "guard.sh is valid shell" "$(sh -n "$S/guard.sh" && echo ok)" "ok"

sum () { md5sum "$1" | cut -d ' ' -f 1; }
# a fake TV: LG's file, Hearth's copy of it with its notes, the start-up link, Hearth installed
reset () {
    rm -rf "$T/dir" "$T/launcher" "$T/prefs" "$T/etc" "$T/init.d" "$T/loaded" "$T/log"
    mkdir -p "$T/dir" "$T/launcher" "$T/prefs" "$T/etc" "$T/init.d"
    echo '{"common":{"firstAppByPowerOnReason":{"remoteKey":"{LAST_APP}"}}}' > "$T/etc/bootd.json"
    echo '{"common":{"firstAppByPowerOnReason":{"remoteKey":"youtube.leanback.v4"}}}' > "$T/prefs/bootd.json"
    sum "$T/prefs/bootd.json" > "$T/dir/override.md5"; sum "$T/etc/bootd.json" > "$T/dir/stock.md5"
    echo youtube.leanback.v4 > "$T/dir/app"
    : > "$T/init.d/45-launcher-poweron"; echo '{}' > "$T/launcher/appinfo.json"
}
guard () { DIR="$T/dir" LINK="$T/init.d/45-launcher-poweron" OVERRIDE="$T/prefs/bootd.json" STOCK="$T/etc/bootd.json" LOADED="$T/loaded" LAUNCHER="$T/launcher" LOG="$T/log" sh "$S/guard.sh" "$@"; }
there () { [ -e "$1" ] && echo yes || echo no; }

reset
check "all in place: nothing to do" "$(guard check)" "in place: youtube.leanback.v4"
check "it notes what the TV loaded" "$(cat "$T/loaded")" "youtube.leanback.v4"
check "the copy stays" "$(there "$T/prefs/bootd.json")" "yes"
check "and the check stays for the next start" "$(there "$T/init.d/45-launcher-poweron")" "yes"

reset; echo '{"common":{"firstAppByPowerOnReason":{"remoteKey":"youtube.leanback.v4","wakeOnWiFi":"youtube.leanback.v4"}}}' > "$T/prefs/bootd.json"; sum "$T/prefs/bootd.json" > "$T/dir/override.md5"
check "network wake-ups too: noted in what was loaded" "$(guard check; cat "$T/loaded")" "in place: youtube.leanback.v4
youtube.leanback.v4+network"

reset; rm -rf "$T/launcher"
check "Hearth uninstalled: the copy is removed" "$(guard check)" "removed: no launcher"
check "the TV loaded it this time (noted)" "$(cat "$T/loaded")" "youtube.leanback.v4"
check "the copy is gone, so the next start is the TV's own" "$(there "$T/prefs/bootd.json")" "no"
check "the check removes its link" "$(there "$T/init.d/45-launcher-poweron")" "no"
check "and its folder" "$(there "$T/dir")" "no"
check "and says so in the log" "$(grep -c 'not installed' "$T/log")" "1"

reset; echo '{"common":{"firstAppByPowerOnReason":{"remoteKey":"{LAST_APP}","new":"x"}}}' > "$T/etc/bootd.json"
check "LG's file changed (software update): the old copy is removed" "$(guard check)" "removed: stock changed"
check "the copy is gone" "$(there "$T/prefs/bootd.json")" "no"
check "and so is the check" "$(there "$T/init.d/45-launcher-poweron")" "no"

reset; echo '{"someone":"else"}' > "$T/prefs/bootd.json"
check "the copy was changed by someone else: left alone" "$(guard check)" "not ours"
check "it is still there, as they left it" "$(cat "$T/prefs/bootd.json")" '{"someone":"else"}'
check "the TV did not load Hearth's choice" "$(cat "$T/loaded")" "stock"
check "the check removes only itself" "$(there "$T/init.d/45-launcher-poweron")$(there "$T/dir")" "nono"

reset; rm -f "$T/prefs/bootd.json"
check "the copy was removed by hand: the check removes itself" "$(guard check)" "not ours"
check "nothing loaded" "$(cat "$T/loaded")" "stock"

reset; echo "{\"common\":{\"firstAppByPowerOnReason\":{\"remoteKey\":\"x'; reboot\"}}}" > "$T/prefs/bootd.json"; sum "$T/prefs/bootd.json" > "$T/dir/override.md5"
guard check >/dev/null
check "an app in the copy that is not an app id is not used" "$(cat "$T/loaded")" "stock"

reset; : > "$T/prefs/bootd.json"
check "an empty copy (power cut) is removed" "$(guard check)" "removed: empty"
check "it is gone" "$(there "$T/prefs/bootd.json")" "no"
check "nothing loaded" "$(cat "$T/loaded")" "stock"

reset; { echo 0123456789abcdef0123456789abcdef; sum "$T/prefs/bootd.json"; } > "$T/dir/override.md5"
check "two sums noted (a change being finished): still Hearth's copy" "$(guard check)" "in place: youtube.leanback.v4"
check "and the log says it is in place" "$(grep -c 'in place' "$T/log")" "1"

reset
check "run from the startup folder, it prints nothing" "$(guard)" ""
check "and still notes what was loaded" "$(cat "$T/loaded")" "youtube.leanback.v4"

rm -rf "$T"
exit $fail
