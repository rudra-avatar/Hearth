#!/bin/sh
# R6: the repair lines in docs/troubleshooting.md (and README) are RUN on a fake TV: /media, /var and /home are a temp folder,
# luna-send is a fake that records the call.   Run: npm test
D="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }

# the command lines exactly as the guide shows them (a line starting with sh /media/... or rm -f /var/... or rm -f /home/...)
lines () { grep -E '^ *(sh /media/developer/launcher-remap/apply\.sh off|rm -f /(var|home)/)' "$1" | sed 's/^ *//'; }
lines "$D/docs/troubleshooting.md" > "$T/guide.txt"
lines "$D/README.md" > "$T/readme.txt"
check "the guide shows 4 command lines" "$(wc -l < "$T/guide.txt" | tr -d ' ')" "4"
check "README shows the same lines as the guide" "$(cmp -s "$T/guide.txt" "$T/readme.txt" && echo same)" "same"

# the fake TV
mkdir -p "$T/media/developer/launcher-remap" "$T/var/lib/webosbrew/init.d" "$T/home/root/.config/lginputhook" "$T/bin"
cp "$D/src/remap/apply.sh" "$T/media/developer/launcher-remap/apply.sh"
for l in 47-launcher-remap 48-launcher-homehook 49-launcher-homekey inputhook 50-other; do : > "$T/var/lib/webosbrew/init.d/$l"; done
echo '{}' > "$T/home/root/.config/lginputhook/keybinds.json"
cat > "$T/bin/luna-send" <<LUNA
#!/bin/sh
echo "\$4" >> '$T/sets'
echo '{"returnValue":true}'
LUNA
chmod +x "$T/bin/luna-send"
run () { PATH="$T/bin:$PATH" sh -c "$(sed -e "s#/media/developer#$T/media/developer#g" -e "s#/var/lib#$T/var/lib#g" -e "s#/home/root#$T/home/root#g" "$1")"; }

# step 2 = the first two lines; step 3 = the last two
head -2 "$T/guide.txt" > "$T/step2.txt"; tail -2 "$T/guide.txt" > "$T/step3.txt"
# the fake can't use the default REMAP path in apply.sh, but 'off' needs only luna-send; run the first line from the copy
out="$(run "$T/step2.txt" 2>&1)"
check "step 2 first line prints removed" "$(printf '%s' "$out" | head -1)" "removed"
check "it sends null for the filter list and the map, in memory only" "$(grep -c 'keyFilters":null.*tld.my.customlauncher.remap":null' "$T/sets")" "1"
check "volatile" "$(grep -c '"volatile":true' "$T/sets")" "1"
check "step 2 removes the 47, 48 and 49 links" "$(ls "$T/var/lib/webosbrew/init.d" | tr '\n' ' ')" "50-other inputhook "
check "step 2 leaves the Input Hook app's settings" "$(ls "$T/home/root/.config/lginputhook")" "keybinds.json"
run "$T/step3.txt" >/dev/null 2>&1
check "step 3 removes the Input Hook link and the settings file" "$(ls "$T/var/lib/webosbrew/init.d" | tr '\n' ' ')$(ls "$T/home/root/.config/lginputhook" | wc -l | tr -d ' ')" "50-other 0"
# a TV that never used reassigned buttons: the first line fails, the second still runs
rm -rf "$T/media/developer/launcher-remap"; : > "$T/var/lib/webosbrew/init.d/49-launcher-homekey"
run "$T/step2.txt" >/dev/null 2>&1
check "without the remap folder the links are still removed" "$(ls "$T/var/lib/webosbrew/init.d" | tr '\n' ' ')" "50-other "

rm -rf "$T"
[ "$fail" = 0 ] && echo "all ok" || { echo "SOME FAILED"; exit 1; }
