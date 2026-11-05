#!/bin/sh
# Tests for src/bootguard/guard.sh (boot guard, 2.0.3 S3b) on a fake TV: fake luna-send, fake folders, NAP=true.   Run: npm test
S="$(cd "$(dirname "$0")/../src/bootguard" && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }
check "guard.sh is valid shell" "$(sh -n "$S/guard.sh" && echo ok)" "ok"
# fake luna-send: input list from $T/listed, delete removes it unless $T/stubborn, no list at all while $T/down, foreground from $T/fg
cat > "$T/send" <<'FAKE'
#!/bin/sh
D="$(dirname "$0")"; echo "$3" >> "$D/calls"
case "$3" in
  */getAllInputStatus) if [ -e "$D/down" ]; then echo '{"returnValue":false}'; elif [ -e "$D/listed" ]; then echo '{"returnValue":true,"devices":[{"appId":"tld.my.customlauncher"}]}'; else echo '{"returnValue":true,"devices":[]}'; fi ;;
  */deleteDevice) [ -e "$D/stubborn" ] || rm -f "$D/listed" ;;
  */getForegroundAppInfo) echo "{\"returnValue\":true,\"appId\":\"$(cat "$D/fg" 2>/dev/null)\"}" ;;
  */launch) echo "$4" > "$D/launched" ;;
esac
FAKE
reset () {
    rm -rf "$T/bootd.log" "$T/dir" "$T/po" "$T/init.d" "$T/log" "$T/calls" "$T/listed" "$T/stubborn" "$T/down" "$T/launched" "$T/fg" "$T/bootd.json"
    mkdir -p "$T/dir" "$T/po" "$T/init.d"; echo '{"appId":"x"}' > "$T/dir/input.json"
    : > "$T/init.d/44-launcher-bootguard"; : > "$T/listed"
}
g () { TRACE_ROUNDS="${TR:-3}" ROUND_SECS=0 BOOTD_LOG="$T/bootd.log" DIR="$T/dir" LINK="$T/init.d/44-launcher-bootguard" LOG="$T/log" SEND="sh $T/send" NAP=true PO_DIR="$T/po" PO_LINK="$T/init.d/45-launcher-poweron" OVERRIDE="$T/bootd.json" sh "$S/guard.sh" "$@"; }
st () { printf 'input=%s\npowerOn=%s\ntries=%s\nreverted=%s\n' "$1" "$2" "$3" "$4" > "$T/dir/state"; }
now () { tr '\n' ' ' < "$T/dir/state"; }
there () { [ -e "$1" ] && echo yes || echo no; }

reset
check "no marker: nothing to do" "$(g check)" "none"
st 0 0 0 0
check "both rows off: nothing to do" "$(g check)" "none"
check "and nothing is counted" "$(now)" "input=0 powerOn=0 tries=0 reverted=0 "

reset; st 1 0 0 0; echo other > "$T/fg"
check "boot 1 without Hearth: retry" "$(g check)" "retry"
check "the count is 1" "$(now)" "input=1 powerOn=0 tries=1 reverted=0 "
check "Hearth was started" "$(grep -c customlauncher "$T/launched")" "1"
check "the input was not touched" "$(grep -c deleteDevice "$T/calls")" "0"
check "the log says retry" "$(grep -c 'retry' "$T/log")" "2"

reset; st 1 0 1 0; echo tld.my.customlauncher > "$T/fg"
check "boot 2: retry again" "$(g check)" "retry"
check "Hearth already in front: not started twice" "$(there "$T/launched")" "no"

reset; st 1 0 2 0
check "boot 3: revert" "$(g check)" "revert"
check "the input is gone" "$(there "$T/listed")" "no"
check "state: input off, reverted noted, count 0" "$(now)" "input=0 powerOn=0 tries=0 reverted=1 "
check "nothing left: the start-up link is removed" "$(there "$T/init.d/44-launcher-bootguard")" "no"
check "the folder stays so the app can tell the user" "$(there "$T/dir/state")" "yes"

reset; st 1 0 2 0; : > "$T/stubborn"
check "delete does nothing: still revert" "$(g check)" "revert"
check "input still listed: kept in the state" "$(now)" "input=1 powerOn=0 tries=0 reverted=0 "
check "the link stays for the next boot" "$(there "$T/init.d/44-launcher-bootguard")" "yes"
check "delete was tried 3 times" "$(grep -c deleteDevice "$T/calls")" "3"

reset; st 1 0 2 0; : > "$T/down"
check "no readable input list: nothing proved" "$(g check)" "revert"
check "state unchanged but for the count" "$(now)" "input=1 powerOn=0 tries=0 reverted=0 "
check "no delete was sent into the dark" "$(grep -c deleteDevice "$T/calls")" "0"

# power-on app
reset; st 0 1 2 0
echo '{"x":1}' > "$T/bootd.json"; md5sum "$T/bootd.json" | cut -d ' ' -f 1 > "$T/po/override.md5"; : > "$T/init.d/45-launcher-poweron"
check "power-on app only: revert" "$(g check)" "revert"
check "Hearth's copy is removed" "$(there "$T/bootd.json")" "no"
check "and its check and folder" "$(there "$T/init.d/45-launcher-poweron")$(there "$T/po")" "nono"
check "state: all clear, reverted" "$(now)" "input=0 powerOn=0 tries=0 reverted=1 "

reset; st 0 1 2 0
echo '{"someone":"else"}' > "$T/bootd.json"; echo 0123456789abcdef0123456789abcdef > "$T/po/override.md5"
g check >/dev/null
check "a copy that is not Hearth's is left alone" "$(cat "$T/bootd.json")" '{"someone":"else"}'
check "and the state is clear (nothing of ours is set)" "$(now)" "input=0 powerOn=0 tries=0 reverted=1 "

reset; st 1 1 2 0
echo '{"x":1}' > "$T/bootd.json"; md5sum "$T/bootd.json" | cut -d ' ' -f 1 > "$T/po/override.md5"
check "both on: revert" "$(g check)" "revert"
check "both undone" "$(there "$T/listed")$(there "$T/bootd.json")" "nono"
check "the input delete is sent after a list was read" "$([ "$(grep -n deleteDevice "$T/calls" | head -n 1 | cut -d: -f1)" -ge 2 ] && echo yes)" "yes"

# reached
reset; st 1 0 2 0
g reached
check "reached: the count is back to 0" "$(now)" "input=1 powerOn=0 tries=0 reverted=0 "
reset; st 1 0 0 1; touch -d '2020-01-01' "$T/dir/state"
g reached
check "reached with a clean count writes nothing" "$(stat -c %Y "$T/dir/state")" "$(date -d '2020-01-01' +%s)"
check "and keeps the reverted note" "$(now)" "input=1 powerOn=0 tries=0 reverted=1 "

# start (from the startup folder): decides in the foreground, works in the background, prints nothing
reset; st 1 0 0 0
check "start prints nothing" "$(g)" ""
sleep 1
check "start counted the boot" "$(now)" "input=1 powerOn=0 tries=1 reverted=0 "

# boot trace (S3d)
reset; st 1 0 0 0; echo other > "$T/fg"
g check >/dev/null
check "trace: a header for the boot" "$(grep -c 'boot, try 1' "$T/dir/boot-trace.log")" "1"
check "trace: one line per round (3)" "$(grep -c ' round ' "$T/dir/boot-trace.log")" "3"
check "trace: names the app in front" "$(grep -c 'front=other' "$T/dir/boot-trace.log")" "3"
check "trace: names whether the input is listed" "$(grep -c 'input=yes' "$T/dir/boot-trace.log")" "3"
check "trace: carries the uptime" "$(grep -c ' up=' "$T/dir/boot-trace.log")" "$(wc -l < "$T/dir/boot-trace.log" | tr -d ' ')"
check "trace: the guard's own decision is in it" "$(grep -c 'log: boot 1 without Hearth' "$T/dir/boot-trace.log")" "1"
check "trace: says when it ends without Hearth" "$(grep -c 'Hearth not in front after 3 rounds' "$T/dir/boot-trace.log")" "1"
check "trace: no memory figures" "$(grep -ci -E 'memfree|vmrss|memavail|free ram' "$T/dir/boot-trace.log")" "0"
check "trace: the TV does not read the check's own output" "$(g check < /dev/null | head -n 1)" "retry"

reset; st 1 0 0 0; echo tld.my.customlauncher > "$T/fg"
g check >/dev/null
check "trace: ends early when Hearth is in front twice" "$(grep -c ' round ' "$T/dir/boot-trace.log")" "2"
check "trace: says so" "$(grep -c 'Hearth is in front: trace ends' "$T/dir/boot-trace.log")" "1"

reset; st 1 0 0 0; echo other > "$T/fg"
printf '%s\n' 'coverui lastinput hdmi1' 'unrelated line about nothing' 'webappmanager asked for tld.my.customlauncher' > "$T/bootd.log"
TR=8 g check >/dev/null
check "trace: bootd lines about the first app are copied" "$(grep -c 'bootd: ' "$T/dir/boot-trace.log")" "4"
check "trace: unrelated bootd lines are not" "$(grep -c 'unrelated' "$T/dir/boot-trace.log")" "0"
reset; st 1 0 0 0
check "trace: no bootd.log is noted, not an error" "$(g check; grep -c 'bootd.log: not there' "$T/dir/boot-trace.log")" "retry
1"

reset; st 0 0 0 0; g check >/dev/null
check "trace: both rows off: no trace file" "$(there "$T/dir/boot-trace.log")" "no"
reset; g check >/dev/null
check "trace: no marker: no trace file" "$(there "$T/dir/boot-trace.log")" "no"
reset; st 1 0 3 0; g reached
check "trace: reached writes no trace" "$(there "$T/dir/boot-trace.log")" "no"

reset; st 1 0 0 0; head -c 61000 /dev/zero | tr '\0' 'x' > "$T/dir/boot-trace.log"
g check >/dev/null
check "trace: a big file becomes .old and a new one starts" "$(there "$T/dir/boot-trace.log.old")$(grep -c 'boot, try 1' "$T/dir/boot-trace.log")" "yes1"

reset; st 1 0 2 0
g check >/dev/null
check "trace: the revert is in it" "$(grep -c 'the Hearth input is gone' "$T/dir/boot-trace.log")" "1"

rm -rf "$T"
exit $fail
