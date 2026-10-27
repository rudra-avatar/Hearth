#!/bin/sh
# Tests for src/homeapp/guard.sh (the start-up check of "Set Hearth as the TV's Home app") with fake folders and a fake
# luna-send.   Run: npm test
S="$(cd "$(dirname "$0")/../src/homeapp" && pwd)"
T="$(mktemp -d)"; fail=0
check () { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', wanted '$3')"; fail=1; fi; }
check "guard.sh is valid shell" "$(sh -n "$S/guard.sh" && echo ok)" "ok"

# the fake settings service: answers with the Home app in $T/home (no answer at all while $T/down exists), notes each change
cat > "$T/luna.sh" <<'LUNA'
#!/bin/sh
case "$*" in
  *getSystemSettings*) [ -f "$T/down" ] && exit 1; printf '{\n    "settings": {\n        "defaultApps": {\n            "home": "%s"\n        }\n    },\n    "returnValue": true\n}\n' "$(cat "$T/home")" ;;
  *setSystemSettings*) printf '%s\n' "$*" >> "$T/sets"; sed 's/.*"home":"\([^"]*\)".*/\1/' <<EOF > "$T/home"
$*
EOF
  ;;
esac
LUNA
chmod +x "$T/luna.sh"
export T
reset () { rm -rf "$T/dir" "$T/launcher" "$T/sets" "$T/down" "$T/log"; mkdir -p "$T/dir" "$T/launcher" "$T/init.d"; : > "$T/init.d/46-launcher-homeapp"; echo '{}' > "$T/launcher/appinfo.json"; }
guard () { DIR="$T/dir" LINK="$T/init.d/46-launcher-homeapp" LAUNCHER="$T/launcher" LUNA_SEND="$T/luna.sh" NAP=true TRIES=3 LOG="$T/log" sh "$S/guard.sh" check; }
sets () { if [ -f "$T/sets" ]; then wc -l < "$T/sets" | tr -d ' '; else echo 0; fi; }
linked () { [ -e "$T/init.d/46-launcher-homeapp" ] && echo yes || echo no; }

reset; echo tld.my.customlauncher > "$T/home"; echo com.webos.app.fullhome > "$T/dir/previous"
check "Hearth installed: nothing to do" "$(guard)" "installed"
check "and the setting is not touched" "$(sets)" "0"
check "and the check stays for the next start" "$(linked)" "yes"

reset; echo tld.my.customlauncher > "$T/home"; echo com.webos.app.fullhome > "$T/dir/previous"; rm -rf "$T/launcher"
check "Hearth uninstalled, the setting still names it: the app from before is put back" "$(guard)" "restored com.webos.app.fullhome"
check "the setting now names it" "$(cat "$T/home")" "com.webos.app.fullhome"
check "the check removes its start-up link" "$(linked)" "no"
check "and its folder" "$([ -d "$T/dir" ] && echo yes || echo no)" "no"
check "and says so in the log" "$(grep -c 'opens com.webos.app.fullhome again' "$T/log")" "1"

reset; echo tld.my.customlauncher > "$T/home"; rm -rf "$T/launcher"; rm -f "$T/dir/previous"
check "nothing saved: LG Home (com.webos.app.home) is put back" "$(guard)" "restored com.webos.app.home"
reset; echo tld.my.customlauncher > "$T/home"; rm -rf "$T/launcher"; echo "x'; reboot; '" > "$T/dir/previous"
check "a saved value that is not an app id is not used" "$(guard)" "restored com.webos.app.home"

reset; echo com.example.otherhome > "$T/home"; rm -rf "$T/launcher"; echo com.webos.app.fullhome > "$T/dir/previous"
check "the setting was changed since: it is left alone" "$(guard)" "left alone"
check "nothing is written" "$(sets)" "0"
check "the check still removes itself" "$(linked)" "no"

reset; echo tld.my.customlauncher > "$T/home"; rm -rf "$T/launcher"; : > "$T/down"
check "the settings service does not answer: wait for the next start" "$(guard)" "waiting"
check "nothing is written" "$(sets)" "0"
check "the check stays" "$(linked)" "yes"

reset
check "run from the startup folder, it returns at once" "$(DIR="$T/dir" LINK="$T/init.d/46-launcher-homeapp" LAUNCHER="$T/launcher" LUNA_SEND="$T/luna.sh" NAP=true LOG="$T/log" sh "$S/guard.sh"; echo done)" "done"

rm -rf "$T"
exit $fail
