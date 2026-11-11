#!/bin/sh
# Test of the shared fdclean snippet (#54): the copy in every helper is identical, and a helper started the way the scripts
# start it holds only fds 0-2. Usage: sh scripts/test-fdclean.sh   (prints "ok" lines, exits 1 on the first failure)
HERE=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
check () { if [ "$2" = "$3" ]; then echo "ok  $1"; else echo "FAIL $1: got '$2', wanted '$3'"; exit 1; fi; }

FILES="src/homehook/apply.sh src/homehook/homehook.sh src/homehook/watch.sh src/remap/apply.sh src/screensaver/screensaver.sh src/takeover/takeover.sh src/preload/preload.sh src/keepready/keepready.sh"
ref=""
for f in $FILES; do
    sed -n '/^# >>> fdclean/,/^# <<< fdclean/p' "$HERE/$f" > "$T/snip"
    check "$f has the snippet" "$([ -s "$T/snip" ] && echo yes)" yes
    [ -n "$ref" ] || { ref="$T/ref"; cp "$T/snip" "$ref"; }
    check "$f snippet is the shared one" "$(cmp -s "$T/snip" "$ref" && echo same)" same
done
check "no helper starts a job with a bare nohup" "$(cd "$HERE" && grep -n 'nohup' $FILES | grep -v 'exec nohup' | grep -c . )" 0

# a parent with open files on fds 5, 9, 11 and 14; the job as the scripts start it. The job lists where its fds point
sed -n '/^fdclean ()/,/^fdnote/p' "$T/ref" > "$T/fns"
cat > "$T/job.sh" <<J
#!/bin/sh
. "$T/fns"
fdnote > "$T/count"
for f in /proc/self/fd/*; do readlink "\$f"; done > "$T/out"
J
for SH in sh bash; do
    command -v $SH >/dev/null 2>&1 || continue
    cat > "$T/parent.sh" <<P
. "$T/fns"
exec 5>"$T/f5"
exec 9>"$T/f9"
( { fdclean; exec nohup $SH "$T/job.sh"; } >/dev/null 2>&1 </dev/null & )
sleep 1
P
    rm -f "$T/out"; $SH "$T/parent.sh"
    check "$SH: fds 5 and 9 are closed in the job" "$(grep -c '/f[59]$' "$T/out")" 0
done
if command -v bash >/dev/null 2>&1; then
    cat > "$T/p2.sh" <<P
. "$T/fns"
exec 11>"$T/f11"
exec 14>"$T/f14"
( { fdclean; exec nohup bash "$T/job.sh"; } >/dev/null 2>&1 </dev/null & )
sleep 1
P
    rm -f "$T/out"; bash "$T/p2.sh"
    check "bash: fds 11 and 14 are closed in the job" "$(grep -c '/f1[14]$' "$T/out")" 0
    # control: without fdclean the same files stay open
    cat > "$T/p3.sh" <<P
exec 11>"$T/f11"
( { exec nohup bash "$T/job.sh"; } >/dev/null 2>&1 </dev/null & )
sleep 1
P
    rm -f "$T/out"; bash "$T/p3.sh"
    check "control: without fdclean fd 11 stays open" "$(grep -c '/f11$' "$T/out")" 1
fi
echo "all ok"
