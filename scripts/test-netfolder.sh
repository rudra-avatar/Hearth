#!/bin/sh
# Test of public/netfolder/netfolder.sh on a fake TV in a temp folder (fake mount, umount, nslookup, a fake /proc/mounts).
# Usage: sh scripts/test-netfolder.sh   (prints "ok" lines, exits 1 on the first failure)
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SH="$HERE/public/netfolder/netfolder.sh"
S=$(mktemp -d); trap 'rm -rf "$S"' EXIT
mkdir -p "$S/bin"
: > "$S/mounts"; : > "$S/mount_calls"
cat > "$S/bin/mount" <<'EOT'
#!/bin/sh
# mount -t cifs //IP/SHARE MNT -o OPTIONS ; FAKE_ERR (text) makes it fail with that message
echo "$*" >> "$FAKE/mount_calls"
if [ -n "$FAKE_ERR" ]; then echo "mount error: $FAKE_ERR" >&2; exit 1; fi
echo "//x $4 cifs ro 0 0" >> "$FAKE/mounts"
EOT
cat > "$S/bin/umount" <<'EOT'
#!/bin/sh
[ "$1" = -l ] && shift
grep -v " $1 " "$FAKE/mounts" > "$FAKE/mounts.new"; mv "$FAKE/mounts.new" "$FAKE/mounts"; echo "$1" >> "$FAKE/umounted"
EOT
cat > "$S/bin/nslookup" <<'EOT'
#!/bin/sh
[ -n "$FAKE_NOHOST" ] && exit 1
printf 'Server: 1.1.1.1\nAddress: 1.1.1.1:53\n\nName: %s\nAddress: 192.168.1.71\n' "$1"
EOT
chmod +x "$S/bin/"*
export FAKE="$S" PATH="$S/bin:$PATH" CONFDIR="$S/conf" NETMNT="$S/mnt" MOUNTS="$S/mounts" LOG="$S/log"
mkdir -p "$S/mnt"
fail () { echo "FAIL $1"; exit 1; }
ok () { echo "ok   $1"; }
run () { sh "$SH" "$@"; }
calls () { wc -l < "$S/mount_calls" | tr -d ' '; }

[ "$(run status)" = "net none" ] && ok "status: nothing saved" || fail "status none"
[ "$(run mount)" = "result=none" ] && ok "mount: nothing saved" || fail "mount none"

[ "$(run set 'evil;h' Video)" = result=badhost ] && [ "$(run set 192.168.1.71 "V';x")" = result=badshare ] && [ "$(run set 192.168.1.71 V "u'x" p)" = result=baduser ] && ok "bad text refused" || fail "bad text"
[ ! -e "$S/conf/net.conf" ] && [ "$(calls)" = 0 ] && ok "nothing saved or mounted after a refusal" || fail "refusal side effects"

# guest, by IP address
[ "$(run set 192.168.1.71 'My Videos')" = result=ok ] && ok "guest: connected" || fail "guest connect"
[ "$(stat -c %a "$S/conf/net.conf")" = 600 ] && ok "net.conf is mode 600" || fail "mode"
grep -q '^user=$' "$S/conf/net.conf" && ok "guest: no user saved" || fail "guest user"
head -n 1 "$S/mount_calls" | grep -q 'username=guest,password=' && head -n 1 "$S/mount_calls" | grep -q 'vers=3.0' && head -n 1 "$S/mount_calls" | grep -q ',ro,' && ok "first try: guest, SMB 3.0, read-only" || fail "first mount call"
[ "$(run status)" = "net on 192.168.1.71 My+Videos guest $S/mnt" ] && ok "status: on, share with a plus, guest, mount point" || fail "status on"
n=$(calls); [ "$(run mount)" = result=ok ] && [ "$(calls)" = "$n" ] && ok "mount when connected: no second mount" || fail "mount twice"

# a user with a comma in the password
: > "$S/mount_calls"
[ "$(run set nas.local Video max 'p,w d')" = result=ok ] && ok "user: connected by name (looked up)" || fail "user connect"
grep -q 'username=max,password=p,,w d' "$S/mount_calls" && ok "a comma in the password is doubled" || fail "comma"
grep -q 'p,w d' "$S/conf/net.conf" && fail "password in clear text"; ok "the password is not in clear text"
grep -q '^pass=' "$S/conf/net.conf" && [ "$(run status | cut -d' ' -f5)" = user ] && ok "status: user" || fail "status user"

# failures: the reason, and the earlier settings stay
try () { : > "$S/mounts"; : > "$S/mount_calls"; FAKE_ERR="$1" run set "${2:-192.168.1.71}" Video ${3:-} ${4:-}; }
[ "$(try 'Permission denied' 192.168.1.71 max pw)" = result=login ] && ok "refused user: login" || fail "login"
[ "$(try 'Permission denied')" = result=guest ] && ok "refused guest: guest" || fail "guest"
[ "$(try 'Host is down')" = result=down ] && ok "no answer: down" || fail "down"
[ "$(try 'cannot resolve: No such file or directory')" = result=share ] && ok "no such folder: share" || fail "share"
[ "$(try 'weird failure')" = "result=other weird failure" ] && ok "other: the text" || fail "other"
[ "$(FAKE_NOHOST=1 run set nas.local Video)" = result=host ] && ok "unknown address: host" || fail "host"
grep -q '^host=nas.local' "$S/conf/net.conf" && ok "a failed set keeps the earlier settings" || fail "kept settings"
try 'Permission denied' > /dev/null
[ "$(calls)" = 2 ] && sed -n 2p "$S/mount_calls" | grep -q 'sec=none' && ok "a guest is tried as guest, then anonymous" || fail "guest tries"

# forget
rm -f "$S/umounted"; run set 192.168.1.71 Video > /dev/null
[ "$(run forget)" = result=ok ] && [ ! -e "$S/conf/net.conf" ] && [ -s "$S/umounted" ] && [ "$(run status)" = "net none" ] && ok "forget: unmounted, settings gone" || fail "forget"
[ ! -e "$S/conf/net.conf.old" ] && [ ! -e "$S/conf/net.conf.new" ] && ok "no leftover files" || fail "leftovers"
echo "all ok"
