#!/bin/sh
# Hearth: a network folder (SMB share on a NAS, a router with a disk or a computer) as one more place in the file
# pickers (rooted TVs). Ships inside Hearth; nothing to copy by hand. Only READS are needed (pictures, themes, languages).
#
# The way to connect (kernel SMB client, server asked by IP address, SMB versions tried 3.0 to 1.0, guest as
# "guest" and then anonymous) follows PR #53 by lordmax895-oss (Apple TV Aerials); the code here is our own.
# Mounted on demand only: no start-up link, nothing runs at boot. The mount lives in /tmp, so a restart of the TV
# drops it and the next use connects again from the saved settings.
#
# Settings: $CONFDIR/net.conf (mode 600): host, share, user and pass (base64). Never written to a log.
#
# Usage: sh netfolder.sh set HOST SHARE [USER PASS]   save and connect              -> result=...
#        sh netfolder.sh mount                        connect from the saved settings (on demand) -> result=...
#        sh netfolder.sh forget                       disconnect and forget         -> result=ok
#        sh netfolder.sh status                       -> "net none" | "net on|off HOST SHARE guest|user MOUNTPOINT" (spaces in SHARE as +)
# result=ok | none (nothing saved) | badhost | badshare | baduser | badpass (refused before anything is saved)
#        | login (user name or password refused) | guest (guests not let in) | share (no such shared folder)
#        | down (the server does not answer) | host (the address is not found) | other TEXT
# Every command ends well (exit 0) so Hearth can read the result line.

CONFDIR="${CONFDIR:-/media/developer/launcher-netfolder}"
NETCONF="$CONFDIR/net.conf"
NETMNT="${NETMNT:-/tmp/hearth-netfolder}"
MOUNTS="${MOUNTS:-/proc/mounts}"
LOG="${LOG:-/tmp/hearth-netfolder.log}"

log () { echo "$(date '+%H:%M:%S') $*" >> "$LOG" 2>/dev/null; }

conf () { sed -n "s/^$1=//p" "$NETCONF" 2>/dev/null | head -n 1; }
net_mounted () { awk -v m="$NETMNT" '$2 == m {f = 1} END {exit !f}' "$MOUNTS" 2>/dev/null; }
# a mount whose server went away makes ls wait for ever: give it 5 seconds where the TV has `timeout`
answers () {
	if command -v timeout >/dev/null 2>&1; then timeout 5 ls "$NETMNT" >/dev/null 2>&1; else ls "$NETMNT" >/dev/null 2>&1; fi
}
unmount () { umount "$NETMNT" 2>/dev/null || umount -l "$NETMNT" 2>/dev/null; }

resolve () {
	case "$1" in *[!0-9.]*) ;; *) echo "$1"; return 0 ;; esac
	nslookup "$1" 2>/dev/null | awk '/^Address/ {a = $NF} END {print a}' | grep -E '^[0-9]+(\.[0-9]+){3}$'
}

# Connects from the saved settings. Prints result=...; returns 0 when connected.
net_mount () {
	[ -s "$NETCONF" ] || { echo result=none; return 1; }
	if net_mounted; then
		answers && { echo result=ok; return 0; }
		unmount
		net_mounted && { echo "result=other the old connection did not close"; return 1; }
	fi
	host=$(conf host); share=$(conf share)
	user=$(conf user | base64 -d 2>/dev/null); pass=$(conf pass | base64 -d 2>/dev/null)
	ip=$(resolve "$host"); [ -n "$ip" ] || { log "cannot find the address"; echo result=host; return 1; }
	mkdir -p "$NETMNT"
	# the ways to log in, one per line: the user's name (a comma in it or in the password is doubled), or as a guest in
	# the two ways servers take one
	if [ -n "$user" ]; then
		creds="username=$(printf %s "$user" | sed 's/,/,,/g'),password=$(printf %s "$pass" | sed 's/,/,,/g')"
	else
		creds="username=guest,password=
sec=none"
	fi
	# The reason comes from mount's own message: "Permission denied": login refused; "does not exist" / "No such file":
	# no such shared folder; "not supported": try an older SMB version; "Host is down", "No route", "timed out",
	# "refused": no answer.
	denied=0; reason=""; detail=""
	while IFS= read -r cred; do
		for v in 3.0 2.1 2.0 1.0; do
			err=$(mount -t cifs "//$ip/$share" "$NETMNT" -o "$cred,ip=$ip,vers=$v,ro,uid=0,gid=0,file_mode=0644,dir_mode=0755,noperm" 2>&1)
			if net_mounted; then
				if answers; then log "connected (SMB $v)"; echo result=ok; return 0; fi
				unmount
				detail="the shared folder cannot be read"
				break
			fi
			case "$err" in
				*"Permission denied"*) denied=1; break ;;
				*"does not exist"*|*"No such file"*) reason=share; break 2 ;;
				*"not supported"*) continue ;;
				*"Host is down"*|*"No route"*|*"timed out"*|*refused*|*unreachable*) reason=down; break 2 ;;
				*) detail="${err##*: }" ;;
			esac
		done
	done <<EOT
$creds
EOT
	if [ -z "$reason" ] && [ "$denied" = 1 ]; then
		if [ -n "$user" ]; then reason=login; else reason=guest; fi
	fi
	log "not connected: ${reason:-other}"
	if [ -n "$reason" ]; then echo "result=$reason"; else echo "result=other $(printf %.120s "${detail:-could not connect}")"; fi
	return 1
}

cmd_set () {
	host="$1"; share="$2"; user="$3"; pass="$4"
	case "$host" in ''|*[!A-Za-z0-9.-]*) echo result=badhost; return 0 ;; esac
	case "$share" in ''|*[!A-Za-z0-9._\$/\ -]*) echo result=badshare; return 0 ;; esac
	case "$user" in *[!A-Za-z0-9._@\\-]*) echo result=baduser; return 0 ;; esac
	[ "${#pass}" -le 200 ] || { echo result=badpass; return 0; }
	mkdir -p "$CONFDIR"
	rm -f "$NETCONF.old"
	[ -s "$NETCONF" ] && cp -p "$NETCONF" "$NETCONF.old"
	net_mounted && unmount
	(
		umask 077
		{ echo "host=$host"; echo "share=$share"; printf 'user=%s\n' "$(printf %s "$user" | base64 | tr -d '\n')"; printf 'pass=%s\n' "$(printf %s "$pass" | base64 | tr -d '\n')"; } > "$NETCONF.new"
	)
	chmod 600 "$NETCONF.new"
	mv -f "$NETCONF.new" "$NETCONF"
	out=$(net_mount)
	echo "$out"
	if [ "$out" != result=ok ]; then
		# nothing that does not work stays saved: the earlier settings (if any) come back
		if [ -s "$NETCONF.old" ]; then mv -f "$NETCONF.old" "$NETCONF"; else rm -f "$NETCONF"; fi
	fi
	rm -f "$NETCONF.old"
	return 0
}

cmd_forget () {
	net_mounted && unmount
	rm -f "${NETCONF:?}" "${NETCONF:?}.old" "${NETCONF:?}.new"
	rmdir "$NETMNT" 2>/dev/null
	echo result=ok
}

cmd_status () {
	if [ -s "$NETCONF" ]; then
		kind=guest; [ -n "$(conf user)" ] && kind=user
		state=off; net_mounted && state=on
		echo "net $state $(conf host) $(conf share | tr ' ' '+') $kind $NETMNT"
	else
		echo "net none"
	fi
}

case "$1" in
	set) shift; cmd_set "$@" ;;
	mount) net_mount; exit 0 ;;
	forget) cmd_forget ;;
	status) cmd_status ;;
	*) echo "usage: $0 set HOST SHARE [USER PASS]|mount|forget|status" >&2; exit 1 ;;
esac
exit 0
