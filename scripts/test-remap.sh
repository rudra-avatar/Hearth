#!/bin/sh
# Tests for src/remap/apply.sh with a fake luna-send (it keeps the key filter list in a file).   Run: npm test
S="$(cd "$(dirname "$0")/../src/remap" && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }
mkdir -p "$T/remap" "$T/launcher" "$T/initd" "$T/snap"
echo old > "$T/snap/configd_1_before_load.json"; echo old > "$T/snap/configd_0_before_setConfigs.json"
echo '{}' > "$T/launcher/appinfo.json"
echo '// filter' > "$T/remap/keyfilter.js"
echo '{"on":true,"keys":{"Key_webOS_Netflix":{"t":"app","id":"com.example.app"}}}' > "$T/remap/map.json"

STOCK='[{"handler":"handleScreenSaver","file":"/usr/lib/qt5/qml/KeyFilters/systemUi.js"},{"handler":"handleCPHotkeys","file":"/usr/lib/qt5/qml/KeyFilters/appLaunch.js"}]'
echo "$STOCK" > "$T/list"
# The fake keeps one value for the filter list (the TV's own list when nothing is set in memory) and logs every setConfigs.
cat > "$T/luna.sh" <<LUNA
#!/bin/sh
case "\$3" in
  *getConfigs*) printf '{"subscribed":false,"configs":{"com.webos.surfacemanager.keyFilters":%s},"returnValue":true}\n' "\$(cat '$T/list')" ;;
  *setConfigs*)
    echo "\$4" >> '$T/sets'
    n=\$(wc -l < '$T/sets' | tr -d ' '); echo x > '$T/snap/configd_'\$n'_before_setConfigs.json'
    if [ -f '$T/refuse' ]; then echo '{"returnValue":false,"errorText":"no"}'; exit 0; fi
    v="\$(printf '%s' "\$4" | sed -n 's/.*"com.webos.surfacemanager.keyFilters":\(\[[^]]*\]\).*/\1/p')"
    if printf '%s' "\$4" | grep -q '"com.webos.surfacemanager.keyFilters":null'; then echo '$STOCK' > '$T/list'; elif [ -n "\$v" ]; then echo "\$v" > '$T/list'; fi
    echo '{"returnValue":true}' ;;
esac
LUNA
chmod +x "$T/luna.sh"
run () { SNAPDIR="$T/snap" LUNA="$T/luna.sh" REMAP="$T/remap" LAUNCHER="$T/launcher" LINK="$T/initd/47-launcher-remap" LOG="$T/log" sh "$S/apply.sh" "$@"; }
sets () { [ -f "$T/sets" ] && wc -l < "$T/sets" | tr -d ' ' || echo 0; }
entry="{\"handler\":\"hearthRemap\",\"file\":\"$T/remap/keyfilter.js\"}"

check "apply.sh is valid shell" "$(sh -n "$S/apply.sh" && echo ok)" "ok"
check "on puts the filter in place" "$(run on)" "applied"
check "Hearth's filter goes first, the TV's own follow unchanged" "$(cat "$T/list")" "[$entry,${STOCK#[}"
check "the change is in memory only (volatile)" "$(grep -c '"volatile":true' "$T/sets")" "1"
check "the map goes with it" "$(grep -c 'tld.my.customlauncher.remap":{"on":true' "$T/sets")" "1"
check "configd's copies made by these calls are deleted, older ones kept" "$(ls "$T/snap" | tr '\n' ' ')" "configd_0_before_setConfigs.json configd_1_before_load.json "
check "check does nothing when it is in place" "$(run check; sets)" "applied
1"
check "on again changes only the map, not the chain" "$(run on; tail -1 "$T/sets" | grep -c keyFilters)" "applied
0"
check "the filter is never added twice" "$(grep -o hearthRemap "$T/list" | wc -l | tr -d ' ')" "1"
check "reload takes it out and puts it in again" "$(run reload; tail -2 "$T/sets" | grep -c keyFilters)" "applied
2"
check "still once after reload" "$(grep -o hearthRemap "$T/list" | wc -l | tr -d ' ')" "1"
"check" "" ""
check "capture tells the filter, with the map" "$(run capture; tail -1 "$T/sets")" "applied
{\"volatile\":true,\"configs\":{\"tld.my.customlauncher.remap\":{\"on\":true,\"keys\":{\"Key_webOS_Netflix\":{\"t\":\"app\",\"id\":\"com.example.app\"}},\"capture\":1}}}"
check "nocapture sends the plain map" "$(run nocapture; tail -1 "$T/sets" | grep -c capture)" "applied
0"
check "capture does not touch the chain" "$(tail -2 "$T/sets" | grep -c keyFilters)" "0"
check "off takes it out" "$(run off)" "removed"
check "and the TV's own list is back" "$(cat "$T/list")" "$STOCK"
check "off sets both to null" "$(tail -1 "$T/sets" | grep -c 'keyFilters":null,"tld.my.customlauncher.remap":null')" "1"
check "check puts it back when the TV forgot it" "$(run check; grep -c hearthRemap "$T/list")" "applied
1"
run off >/dev/null
mv "$T/remap/map.json" "$T/remap/x"
check "on refuses without map.json" "$(run on)" "files-missing"
mv "$T/remap/x" "$T/remap/map.json"
echo 'not json' > "$T/remap/bad"; cp "$T/remap/map.json" "$T/remap/good"; cp "$T/remap/bad" "$T/remap/map.json"
check "on refuses a broken map.json" "$(run on)" "failed"
check "and the chain is left alone" "$(grep -c hearthRemap "$T/list")" "0"
cp "$T/remap/good" "$T/remap/map.json"
touch "$T/initd/47-launcher-remap"
mv "$T/launcher/appinfo.json" "$T/launcher/x"
check "on refuses when Hearth is not installed" "$(run on)" "launcher-missing"
check "and removes its boot link" "$([ -e "$T/initd/47-launcher-remap" ] && echo there || echo gone)" "gone"
mv "$T/launcher/x" "$T/launcher/appinfo.json"
touch "$T/refuse"
check "a refusal by the TV is reported" "$(run on)" "failed"
rm -f "$T/refuse"
echo '[]' > "$T/list"
check "an empty chain gets just the filter" "$(run on; cat "$T/list")" "applied
[$entry]"
echo 'garbage' > "$T/list"
check "an unreadable chain is not touched" "$(run on)" "failed"

rm -rf "$T"
exit $fail
