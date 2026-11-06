#!/bin/sh
# Hearth: Apple TV Aerials for the screen saver (rooted TVs). Ships inside Hearth; nothing to copy by hand.
#
# The videos are Apple's, played from Apple's own servers the same way the Aerial screen saver for macOS does
# (github.com/AerialScreensaver/Aerial). Nothing of Apple's is shipped with Hearth: the list and the videos the
# user chooses are downloaded to this TV only.
#
# Every connection is checked. sylvan.apple.com is signed by "Apple Root CA", which the TV's own list lacks, so that
# one certificate is fetched from apple.com (whose certificate the TV can check), and only kept when its SHA-256
# fingerprint is the one written below.
#
# Folders: $DATA (certificate, list, download queue), $VIDEOS (the videos: the screen saver plays this folder),
# $FRAMES (one still per video, 1920x1080 BMP: the wallpaper slideshow).
#
# Usage: sh aerial.sh ca                      check / fetch the certificate              -> result=ok | result=failed <why>
#        sh aerial.sh catalog [refresh]       the video list (Apple's entries.json)      -> @@ok then the JSON | result=failed <why>
#        sh aerial.sh status                  the queue and what is on the TV            -> lines, see cmd_status
#        sh aerial.sh get NAME Q URL H264URL  queue a download (Q: 4k or 1080)           -> result=queued
#        sh aerial.sh rm NAME                 remove a video, its still and its job      -> result=ok
#        sh aerial.sh preview URL             Apple's preview picture, saved in /tmp     -> file PATH | result=badurl
#        sh aerial.sh sizes                   ask Apple for every video's size (background) -> result=started
#        sh aerial.sh sizelist                the sizes known so far                     -> @@sizes running|done, then "URL BYTES" lines
#        sh aerial.sh target [VALUE]          where new downloads go: internal, usb:/PATH or net
#        sh aerial.sh netset HOST SHARE [USER PASS]   save and connect a network folder (SMB; no user = guest)
#        sh aerial.sh netoff                  disconnect it and forget it
#        sh aerial.sh run                     (internal) the download worker

DATA="${DATA:-/media/developer/aerial}"
VIDEOS="${VIDEOS:-/media/developer/screensavers/aerial}"      # the TV's own memory (the default place)
NETMNT="$DATA/net"                                            # the network folder is connected here
SUB="hearth-aerials"                                          # the folder made on a USB drive or network folder
NETCONF="$DATA/net.conf"
NETLINK="${NETLINK:-/var/lib/webosbrew/init.d/57-hearth-aerial-net}"
FRAMES="${FRAMES:-/media/developer/wallpapers/aerial}"
JOBS="$DATA/jobs"
CA="$DATA/apple-root-ca.pem"
CA_URL="https://www.apple.com/appleca/AppleIncRootCertificate.cer"
CA_SHA256="b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024"
MANIFEST_URL="${MANIFEST_URL:-https://sylvan.apple.com/itunes-assets/Aerials126/v4/c0/45/d9/c045d9d0-9606-1535-62fe-189edb4f79eb/resources-atv-23J-2.tar}"
LOG="/tmp/hearth-aerial.log"
LOWPRI=""; command -v nice >/dev/null 2>&1 && LOWPRI="nice -n 19"

log () { echo "$(date '+%H:%M:%S') $*" >> "$LOG" 2>/dev/null; }

# a video name: lower-case letters, digits and dashes only (it becomes a file name)
valid_name () { case "$1" in ''|*[!a-z0-9-]*) return 1 ;; esac; return 0; }
# only Apple's video server, plain https and safe characters
valid_url () { case "$1" in https://sylvan.apple.com/*) ;; *) return 1 ;; esac; case "$1" in *[!A-Za-z0-9._/:%-]*) return 1 ;; esac; return 0; }

# ---------- where the videos are kept ----------

# mounted USB drives (the same test Hearth's picture picker uses)
usb_roots () {
	awk '$1 ~ /^\/dev\/sd[a-z]/ || $2 ~ /\/usb\// {print $2}' /proc/mounts 2>/dev/null | sed 's/\\040/ /g' | while read -r m; do
		case "$m" in *[!A-Za-z0-9._/\ -]*) continue ;; esac
		[ -d "$m" ] && echo "$m"
	done | sort -u
}
net_mounted () { awk -v m="$NETMNT" '$2 == m {f = 1} END {exit !f}' /proc/mounts 2>/dev/null; }
target () { t=$(cat "$DATA/target" 2>/dev/null); echo "${t:-internal}"; }
# the folder a place keeps its videos in (prints nothing when the place is not there now)
dir_of () {
	case "$1" in
		internal) echo "$VIDEOS" ;;
		net) net_mounted && echo "$NETMNT/$SUB" ;;
		usb:/*) r="${1#usb:}"; usb_roots | grep -qxF "$r" && echo "$r/$SUB" ;;
	esac
}
# every place that is there now, as "PLACE DIR"
places () {
	echo "internal $VIDEOS"
	usb_roots | while read -r r; do echo "usb:$r $r/$SUB"; done
	net_mounted && echo "net $NETMNT/$SUB"
}

cmd_target () {
	if [ -n "$1" ]; then
		case "$1" in internal|net) ;; usb:/*) case "$1" in *[!A-Za-z0-9._/:\ -]*) echo result=badtarget; return 1 ;; esac ;; *) echo result=badtarget; return 1 ;; esac
		[ "$1" = net ] && { net_mounted || net_mount >/dev/null || { echo "result=failed the network folder is not connected"; return 1; }; }
		d=$(dir_of "$1"); [ -n "$d" ] || { echo "result=failed that place is not there"; return 1; }
		mkdir -p "$d" 2>/dev/null && touch "$d/.hearth-write" 2>/dev/null && rm -f "${d:?}/.hearth-write" || { echo "result=failed cannot write there"; return 1; }
		mkdir -p "$DATA"; echo "$1" > "$DATA/target"
	fi
	echo "result=ok $(target)"
}

# ---------- the network folder (SMB) ----------
# net.conf keeps host, share and (base64) user and password; readable by root only. The kernel's own SMB client is
# used (the TV has no mount.cifs): the server is asked by its IP address; with no user, as a guest (sec=none).

conf () { sed -n "s/^$1=//p" "$NETCONF" 2>/dev/null | head -n 1; }
resolve () {
	case "$1" in *[!0-9.]*) ;; *) echo "$1"; return 0 ;; esac
	nslookup "$1" 2>/dev/null | awk '/^Address/ {a = $NF} END {print a}' | grep -E '^[0-9]+(\.[0-9]+){3}$'
}
net_mount () {
	[ -s "$NETCONF" ] || { echo "result=failed no network folder is set"; return 1; }
	net_mounted && { echo result=ok; return 0; }
	host=$(conf host); share=$(conf share)
	user=$(conf user | base64 -d 2>/dev/null); pass=$(conf pass | base64 -d 2>/dev/null)
	ip=$(resolve "$host"); [ -n "$ip" ] || { echo "result=failed cannot find $host on the network"; return 1; }
	mkdir -p "$NETMNT"
	# the ways to log in: the user's name, or as a guest both ways servers take one. The "guest" user first: a NAS
	# (TerraMaster, for one) gives an anonymous login read-only access while its guest account may write.
	if [ -n "$user" ]; then
		creds="username=$(printf %s "$user" | sed 's/,/,,/g'),password=$(printf %s "$pass" | sed 's/,/,,/g')"
	else
		creds="username=guest,password=
sec=none"
	fi
	# The reason comes from mount's own message (the kernel log is not readable from Hearth):
	#   "read-only" / "Permission denied": login refused; "does not exist" / "No such file": no such shared folder;
	#   "not supported": try an older SMB version; "Host is down", "No route", "timed out", "refused": no answer.
	# A login that connects but may not write is not kept: the next way is tried.
	denied=0; readonly=0; reason=""
	while IFS= read -r cred; do
		for v in 3.0 2.1 2.0 1.0; do
			err=$(mount -t cifs "//$ip/$share" "$NETMNT" -o "$cred,ip=$ip,vers=$v,uid=0,gid=0,file_mode=0644,dir_mode=0755,noperm" 2>&1)
			if net_mounted; then
				if mkdir -p "$NETMNT/$SUB" 2>/dev/null && touch "$NETMNT/$SUB/.hearth-write" 2>/dev/null; then
					rm -f "$NETMNT/$SUB/.hearth-write"
					log "network folder connected (SMB $v)"
					echo result=ok; return 0
				fi
				umount "$NETMNT" 2>/dev/null
				readonly=1
				break
			fi
			case "$err" in
				*read-only*|*"Permission denied"*) denied=1; break ;;
				*"does not exist"*|*"No such file"*) reason="there is no shared folder called $share"; break 2 ;;
				*"not supported"*) continue ;;
				*"Host is down"*|*"No route"*|*"timed out"*|*refused*|*unreachable*) reason="the NAS does not answer"; break 2 ;;
				*) reason="could not connect (${err##*: })" ;;
			esac
		done
	done <<EOT
$creds
EOT
	# a login that could only read, or a refused one, says more than a vague error from another try
	if [ -z "$reason" ] || [ "${reason#could not connect}" != "$reason" ]; then
		if [ "$readonly" = 1 ]; then reason="the NAS lets this login read but not write"
		elif [ "$denied" = 1 ]; then
			if [ -n "$user" ]; then reason="the NAS refused the login"; else reason="the NAS does not let guests in"; fi
		fi
	fi
	log "network folder: $reason"
	echo "result=failed ${reason:-could not connect}"
	return 1
}

cmd_netset () {
	host="$1"; share="$2"; user="$3"; pass="$4"
	case "$host" in ''|*[!A-Za-z0-9.-]*) echo result=badhost; return 1 ;; esac
	case "$share" in ''|*[!A-Za-z0-9._\$/\ -]*) echo result=badshare; return 1 ;; esac
	case "$user" in *[!A-Za-z0-9._@\\-]*) echo result=baduser; return 1 ;; esac
	net_mounted && umount "$NETMNT" 2>/dev/null
	mkdir -p "$DATA"; umask 077
	{ echo "host=$host"; echo "share=$share"; printf 'user=%s\n' "$(printf %s "$user" | base64 | tr -d '\n')"; printf 'pass=%s\n' "$(printf %s "$pass" | base64 | tr -d '\n')"; } > "$NETCONF"
	chmod 600 "$NETCONF"
	out=$(net_mount); echo "$out"
	case "$out" in result=ok) mkdir -p "$(dirname "$NETLINK")"; ln -sf "$0" "$NETLINK" ;; *) return 1 ;; esac
}

cmd_netoff () {
	net_mounted && umount "$NETMNT" 2>/dev/null
	rm -f "${NETCONF:?}" "${NETLINK:?}"
	[ "$(target)" = net ] && echo internal > "$DATA/target"
	echo result=ok
}

# at a start of the TV (the start-up link): connect the network folder once the network is up, in the background
cmd_netboot () {
	[ -s "$NETCONF" ] || { rm -f "${NETLINK:?}"; exit 0; }
	( i=0; while [ $i -lt 24 ]; do net_mount >/dev/null && exit 0; i=$((i + 1)); sleep 5; done ) </dev/null >/dev/null 2>&1 &
}

fingerprint () { openssl x509 -in "$1" -noout -fingerprint -sha256 2>/dev/null | sed 's/.*=//' | tr -d ':' | tr 'A-F' 'a-f'; }

cmd_ca () {
	mkdir -p "$DATA"
	[ -s "$CA" ] && [ "$(fingerprint "$CA")" = "$CA_SHA256" ] && { echo result=ok; return 0; }
	rm -f "$DATA/ca.der" "$DATA/ca.new"
	if ! curl -s -m 20 -o "$DATA/ca.der" "$CA_URL"; then echo "result=failed could not reach apple.com"; return 1; fi
	if ! openssl x509 -inform DER -in "$DATA/ca.der" -out "$DATA/ca.new" 2>/dev/null; then rm -f "$DATA/ca.der"; echo "result=failed not a certificate"; return 1; fi
	rm -f "$DATA/ca.der"
	if [ "$(fingerprint "$DATA/ca.new")" != "$CA_SHA256" ]; then rm -f "$DATA/ca.new"; log "certificate fingerprint did not match"; echo "result=failed the certificate is not the expected one"; return 1; fi
	mv -f "$DATA/ca.new" "$CA"
	echo result=ok
}

cmd_catalog () {
	out=$(cmd_ca) || { echo "$out"; return 1; }
	list="$DATA/entries.json"
	if [ "$1" = refresh ] || [ ! -s "$list" ] || [ -n "$(find "$list" -mtime +7 2>/dev/null)" ]; then
		rm -f "$DATA/manifest.tar"
		if curl -s -m 120 --cacert "$CA" -o "$DATA/manifest.tar" "$MANIFEST_URL" \
			&& tar -xOf "$DATA/manifest.tar" ./entries.json > "$list.new" 2>/dev/null && [ -s "$list.new" ]; then
			mv -f "$list.new" "$list"
		else
			rm -f "$list.new"
			log "the video list could not be fetched"
			[ -s "$list" ] || { rm -f "$DATA/manifest.tar"; echo "result=failed could not fetch the video list"; return 1; }
		fi
		rm -f "$DATA/manifest.tar"
	fi
	echo @@ok
	cat "$list"
}

# One line per known video and per job, then the free space:
#   file NAME BYTES          a finished video in $VIDEOS
#   frame NAME               its still in $FRAMES
#   job NAME STATE BYTES TOTAL   a queued or running download (STATE: queued, downloading, frame, failed:<why>)
#   free KB
#   place PLACE DIR          every place that is there now (internal, usb:/PATH, net)
#   target PLACE ok|missing DIR   where new downloads go
#   net none | net on|off HOST SHARE guest|user   the network folder (spaces in SHARE as +)
cmd_status () {
	mkdir -p "$DATA"
	places > "$DATA/places.now"
	while read -r place dir; do
		echo "place $place $dir"
		for f in "$dir"/*.mov; do [ -f "$f" ] || continue; n=$(basename "$f" .mov); echo "file $n $(stat -c %s "$f") $place"; done
	done < "$DATA/places.now"
	for f in "$FRAMES"/*.bmp; do [ -f "$f" ] || continue; echo "frame $(basename "$f" .bmp)"; done
	for s in "$JOBS"/*.state; do
		[ -f "$s" ] || continue
		n=$(basename "$s" .state)
		jdir=$(awk '{print $4}' "$JOBS/$n.want" 2>/dev/null)
		bytes=0; [ -n "$jdir" ] && [ -f "$jdir/$n.mov.part" ] && bytes=$(stat -c %s "$jdir/$n.mov.part")
		total=$(cat "$JOBS/$n.total" 2>/dev/null); echo "job $n $(cat "$s") $bytes ${total:-0}"
	done
	t=$(target); d=$(dir_of "$t")
	if [ -n "$d" ]; then echo "target $t ok $d"; else echo "target $t missing -"; fi
	if [ -s "$NETCONF" ]; then
		kind=guest; [ -n "$(conf user)" ] && kind=user
		state=off; net_mounted && state=on
		echo "net $state $(conf host) $(conf share | tr ' ' '+') $kind"
	else
		echo "net none"
	fi
	# -P: one line per disk even when the name is long (a network folder's name would otherwise wrap and shift the columns)
	echo "free $(df -kP "${d:-$VIDEOS}" 2>/dev/null | tail -n 1 | awk '{print $4}')"
}

le32 () { v=$1; printf "\\$(printf %03o $((v & 255)))\\$(printf %03o $(((v >> 8) & 255)))\\$(printf %03o $(((v >> 16) & 255)))\\$(printf %03o $(((v >> 24) & 255)))"; }

# A 1920x1080 still from an H.264 video file, as a top-down 24-bit BMP (the TV has no JPEG or PNG encoder; Hearth's
# wallpaper reads BMP). The 30th frame, about one second in.
frame_from () {
	src="$1"; out="$2"; tmp="/tmp/hearth-aerial-frame"
	rm -rf "$tmp"; mkdir -p "$tmp"
	$LOWPRI gst-launch-1.0 -q filesrc location="$src" ! qtdemux ! h264parse ! avdec_h264 ! identity eos-after=30 ! videoconvert ! videoscale \
		! video/x-raw,format=BGR,width=1920,height=1080 ! multifilesink location="$tmp/f%03d.raw" max-files=1 >/dev/null 2>&1
	raw=$(ls "$tmp"/f*.raw 2>/dev/null | tail -n 1)
	W=1920; H=1080; IMG=$((W * H * 3))
	if [ -z "$raw" ] || [ "$(stat -c %s "$raw")" != "$IMG" ]; then rm -rf "$tmp"; return 1; fi
	mkdir -p "$(dirname "$out")"
	{ printf BM; le32 $((IMG + 54)); le32 0; le32 54; le32 40; le32 $W; le32 $((0 - H)); printf '\001\000\030\000'; le32 0; le32 $IMG; le32 2835; le32 2835; le32 0; le32 0; cat "$raw"; } > "$out.new" \
		&& mv -f "$out.new" "$out"
	rm -rf "$tmp"
	[ -s "$out" ]
}

# The still for a 4K video comes from the H.264 copy of the same shot, without downloading all of it: its index (moov)
# is at the end, so only the first 12 MB and the last 4 MB are fetched into a sparse file of the full size.
frame_remote () {
	url="$1"; out="$2"; part="$DATA/frame-source.mov"; M=1048576
	size=$(curl -sI -m 20 --cacert "$CA" "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')
	case "$size" in ''|*[!0-9]*) return 1 ;; esac
	[ "$size" -gt $((20 * M)) ] || return 1
	rm -f "$part"
	dd if=/dev/zero of="$part" bs=1 count=0 seek="$size" 2>/dev/null
	curl -s -m 120 --cacert "$CA" -r 0-$((12 * M - 1)) "$url" | dd of="$part" bs=$M conv=notrunc 2>/dev/null
	tail=$(( (size - 4 * M) / M ))
	curl -s -m 120 --cacert "$CA" -r $((tail * M))- "$url" | dd of="$part" bs=$M seek=$tail conv=notrunc 2>/dev/null
	frame_from "$part" "$out"; ok=$?
	rm -f "$part"
	return $ok
}

cmd_get () {
	name="$1"; quality="$2"; url="$3"; h264="$4"
	valid_name "$name" || { echo result=badname; return 1; }
	case "$quality" in 4k|1080) ;; *) echo result=badquality; return 1 ;; esac
	valid_url "$url" && valid_url "$h264" || { echo result=badurl; return 1; }
	t=$(target); [ "$t" = net ] && ! net_mounted && net_mount >/dev/null
	dir=$(dir_of "$t"); [ -n "$dir" ] || { echo result=noplace; return 1; }
	mkdir -p "$JOBS" "$dir" "$FRAMES"
	if [ -f "$FRAMES/$name.bmp" ] && places | while read -r place pdir; do [ -f "$pdir/$name.mov" ] && exit 0; done; then echo result=present; return 0; fi
	echo "$quality $url $h264 $dir" > "$JOBS/$name.want"
	echo queued > "$JOBS/$name.state"
	( nohup sh "$0" run >/dev/null 2>&1 </dev/null & )
	echo result=queued
}

# Apple's preview picture of one video (PNG, about 900x580): the web view cannot check Apple's certificate, so the
# picture is fetched here into memory (/tmp, the newest 20 are kept) and Hearth reads that file in pieces.
PREVIEWS="/tmp/hearth-aerial-preview"
cmd_preview () {
	url="$1"
	valid_url "$url" || { echo result=badurl; return 1; }
	case "$url" in *.png|*.jpg|*.jpeg) ;; *) echo result=badurl; return 1 ;; esac
	mkdir -p "$PREVIEWS"
	file="$PREVIEWS/$(echo "$url" | md5sum | cut -c1-16).${url##*.}"
	if [ ! -s "$file" ]; then
		out=$(cmd_ca) || { echo "$out"; return 1; }
		curl -s -m 20 --cacert "$CA" -o "$file.part" "$url" && [ -s "$file.part" ] && mv -f "$file.part" "$file" \
			|| { rm -f "$file.part"; echo "result=failed could not fetch the preview"; return 1; }
		ls -t "$PREVIEWS"/* 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null
	fi
	echo "file $file"
}

# The size of every video in both qualities, asked from Apple once (headers only) and kept in $DATA/sizes.txt as
# "URL BYTES" lines. `sizes` starts the job in the background; `sizelist` prints "@@sizes running|done" and the lines.
SIZES="$DATA/sizes.txt"
size_of () {
	n=$(curl -sI -m 15 --cacert "$CA" "$1" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')
	case "$n" in ''|*[!0-9]*) return 0 ;; esac
	echo "$1 $n"
}
cmd_sizes () {
	[ -s "$DATA/entries.json" ] || { echo result=nolist; return 1; }
	( nohup sh "$0" sizejob >/dev/null 2>&1 </dev/null & )
	echo result=started
}
cmd_sizejob () {
	exec 8>"$DATA/sizes.lock"
	flock -n 8 || exit 0
	out=$(cmd_ca) || exit 1
	touch "$SIZES"
	grep -oE '"url-(4K-SDR|1080-H264)":"[^"]*"' "$DATA/entries.json" | sed 's/^"[^"]*":"//; s/"$//; s#\\/#/#g' | while read -r u; do
		valid_url "$u" || continue
		grep -q "^$u " "$SIZES" || echo "$u"
	done > "$DATA/sizes.todo"
	export CA
	xargs -P 4 -n 1 sh "$0" sizeone < "$DATA/sizes.todo" >> "$SIZES"
	rm -f "$DATA/sizes.todo"
}
cmd_sizelist () {
	if [ -f "$DATA/sizes.todo" ]; then echo "@@sizes running"; else echo "@@sizes done"; fi
	cat "$SIZES" 2>/dev/null
}

cmd_rm () {
	name="$1"
	valid_name "$name" || { echo result=badname; return 1; }
	rm -f "$JOBS/$name.want" "$JOBS/$name.state" "$JOBS/$name.total"
	# a download of this video that is running now: stop it
	if [ "$(cat "$JOBS/current" 2>/dev/null)" = "$name" ]; then
		pid=$(cat "$JOBS/current.pid" 2>/dev/null); [ -n "$pid" ] && kill "$pid" 2>/dev/null
	fi
	places | while read -r place dir; do rm -f "${dir:?}/${name:?}.mov" "${dir:?}/${name:?}.mov.part"; done
	rm -f "${FRAMES:?}/${name:?}.bmp"
	echo result=ok
}

# One worker at a time (flock); it takes the queued videos one by one, oldest first, until none is left.
cmd_run () {
	mkdir -p "$JOBS"
	exec 9>"$JOBS/worker.lock"
	flock -n 9 || exit 0
	while :; do
		want=$(ls -tr "$JOBS"/*.want 2>/dev/null | head -n 1)
		[ -n "$want" ] || break
		name=$(basename "$want" .want)
		read -r quality url h264 dir < "$want"
		[ -n "$dir" ] || dir="$VIDEOS"
		echo "$name" > "$JOBS/current"
		state () { [ -f "$JOBS/$name.want" ] && echo "$1" > "$JOBS/$name.state"; }
		if [ ! -f "$dir/$name.mov" ]; then
			state downloading
			total=$(curl -sI -m 20 --cacert "$CA" "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')
			echo "${total:-0}" > "$JOBS/$name.total"
			curl -s -C - -m 3600 --cacert "$CA" -o "$dir/$name.mov.part" "$url" &
			echo $! > "$JOBS/current.pid"
			wait $!; rc=$?
			rm -f "$JOBS/current.pid"
			[ -f "$JOBS/$name.want" ] || { rm -f "${dir:?}/${name:?}.mov.part"; continue; }        # removed while downloading
			if [ $rc -ne 0 ]; then log "download of $name failed ($rc)"; state "failed:download"; rm -f "$want"; continue; fi
			mv -f "$dir/$name.mov.part" "$dir/$name.mov"
		fi
		if [ ! -f "$FRAMES/$name.bmp" ]; then
			state frame
			if [ "$quality" = 1080 ]; then frame_from "$dir/$name.mov" "$FRAMES/$name.bmp"; else frame_remote "$h264" "$FRAMES/$name.bmp"; fi \
				|| log "no still for $name"
		fi
		[ -f "$JOBS/$name.want" ] || continue
		rm -f "$want" "$JOBS/$name.state" "$JOBS/$name.total"
		log "ready: $name ($quality)"
	done
	rm -f "$JOBS/current" "$JOBS/current.pid"
}

# run from the start-up folder (the link), with no argument: connect the network folder
case "$(basename "$0")" in 57-hearth-aerial-net) cmd_netboot; exit 0 ;; esac

case "$1" in
	ca) cmd_ca ;;
	catalog) cmd_catalog "$2" ;;
	status) cmd_status ;;
	get) shift; cmd_get "$@" ;;
	rm) cmd_rm "$2" ;;
	preview) cmd_preview "$2" ;;
	sizes) cmd_sizes ;;
	sizelist) cmd_sizelist ;;
	sizejob) cmd_sizejob ;;
	sizeone) valid_url "$2" && size_of "$2" ;;
	# these answer with result=... and always end well, so Hearth reads the reason (a failing command would only say "command failed")
	target) cmd_target "$2"; exit 0 ;;
	netset) shift; cmd_netset "$@"; exit 0 ;;
	netoff) cmd_netoff; exit 0 ;;
	netboot) cmd_netboot ;;
	run) cmd_run ;;
	*) echo "usage: $0 ca|catalog [refresh]|status|get NAME Q URL H264URL|rm NAME|preview URL|sizes|sizelist" >&2; exit 1 ;;
esac
