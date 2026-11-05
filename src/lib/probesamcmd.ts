// Pure parts of probe tests 38-41 (2.0.3 R3): the start-up recorder script, the readiness command and the timeline reader.
// Kept apart from probesam.ts so scripts/test-probesam.mjs can load them on their own.

const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter(Boolean);

export const PROBE_DIR = '/media/developer/launcher-samprobe';
export const PROBE_LINK = '/var/lib/webosbrew/init.d/46-launcher-samprobe';
export const TIMELINE = `${PROBE_DIR}/timeline.txt`;

// ASCII only, POSIX sh. Started by the Homebrew start-up scripts (no argument): it forks itself and returns at once.
export const RECORDER_SH = `#!/bin/sh
# Hearth SAM start-up recorder (probe 39). For 100 s after it starts it writes one line per round to timeline.txt:
# uptime, whether sam answers (and what it holds for LG Home), whether configd answers, the app in front, systemd's state.
# The one thing it does: a trial of configd's blocked-app list nudge (adds an id that no app has, then puts the list
# back). Remove it with probe 41.
DIR=${PROBE_DIR}
OUT=$DIR/timeline.txt
PIDF=/tmp/launcher-samprobe.pid
[ "$1" = loop ] || { ( nohup sh "$0" loop >/dev/null 2>&1 </dev/null & ); exit 0; }
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo $$ > "$PIDF"
up () { cut -d' ' -f1 /proc/uptime; }
ls_ () { timeout 4 luna-send -n 1 "$@" 2>/dev/null; }
NUDGE_ID=tld.my.customlauncher.rescan
S=$(up)
echo "start T=$S" > "$OUT"
nudged=0; tries=0
while :; do
  U=$(up)
  [ "$(echo "$U $S" | awk '{print ($1-$2<100)}')" = 1 ] || break
  home=$(ls_ luna://com.webos.applicationManager/getAppInfo '{"id":"com.webos.app.home"}' | tr -d '\\n')
  case "$home" in *'"type": "web"'*|*'"type":"web"'*) sam=web;; *'"type"'*) sam=native;; *) sam=unknown;; esac
  raw=$(ls_ luna://com.webos.service.config/getConfigs '{"configNames":["profile.blockedAppList"]}' | tr -d '\\n')
  case "$raw" in *'"profile.blockedAppList"'*) cfg=ok;; *) cfg=no;; esac
  fg=$(ls_ luna://com.webos.applicationManager/getForegroundAppInfo '{}' | tr -d '\\n' | sed -n 's/.*"appId": *"\\([^"]*\\)".*/\\1/p')
  sys=$(systemctl is-system-running 2>/dev/null | head -1)
  nud=-
  if [ "$nudged" = 0 ] && [ "$cfg" = ok ] && [ "$sam" != unknown ] && [ "$tries" -lt 8 ]; then
    tries=$((tries+1))
    list=$(echo "$raw" | sed -n 's/.*"profile\\.blockedAppList": *\\(\\[[^]]*\\]\\).*/\\1/p')
    nud=fail
    if [ -n "$list" ]; then
      lg=$(echo "$list" | sed "s/\\"$NUDGE_ID\\"//g; s/, *,/,/g; s/\\[ *,/[/; s/, *\\]/]/")
      inner=$(echo "$lg" | sed 's/^\\[ *//; s/ *\\]$//')
      if [ -z "$inner" ]; then nl="[\\"$NUDGE_ID\\"]"; else nl="[$inner,\\"$NUDGE_ID\\"]"; fi
      if ls_ luna://com.webos.service.config/setConfigs "{\\"configs\\":{\\"profile.blockedAppList\\":$nl}}" | grep -q '"returnValue": *true'; then
        sleep 1
        for _ in 1 2 3; do
          if ls_ luna://com.webos.service.config/setConfigs "{\\"configs\\":{\\"profile.blockedAppList\\":$lg}}" | grep -q '"returnValue": *true'; then nud=ok; nudged=1; break; fi
          sleep 1
        done
      fi
    fi
  fi
  echo "T=$U sam=$sam cfg=$cfg fg=\${fg:-none} sys=\${sys:-?} nudge=$nud" >> "$OUT"
  sleep 1
done
echo "end T=$(up)" >> "$OUT"
rm -f "$PIDF"
`;

export const NOW = [
	'echo "up=$(cut -d. -f1 /proc/uptime)s"',
	'h=$(timeout 4 luna-send -n 1 luna://com.webos.applicationManager/getAppInfo \'{"id":"com.webos.app.home"}\' 2>/dev/null | tr -d "\\n"); case "$h" in *\'"type": "web"\'*|*\'"type":"web"\'*) echo "sam holds for LG Home: web (the stand-in)";; *\'"type"\'*) echo "sam holds for LG Home: LG\'s own";; *) echo "sam: no answer";; esac',
	'c=$(timeout 4 luna-send -n 1 luna://com.webos.service.config/getConfigs \'{"configNames":["profile.blockedAppList"]}\' 2>/dev/null | tr -d "\\n"); case "$c" in *profile.blockedAppList*) echo "configd blocked-app list: answers (gentle re-read possible)";; *) echo "configd blocked-app list: no answer";; esac',
	'[ -f /etc/palm/schemas/sam/applicationManager.blockSystemApp.schema ] && echo "blockSystemApp schema: present" || echo "blockSystemApp schema: absent"',
	'echo "system: $(systemctl is-system-running 2>/dev/null | head -1)"',
	'grep -q " /usr/palm/applications/com.webos.app.home " /proc/mounts && echo "LG Home folder: mounted over" || echo "LG Home folder: not mounted over"',
	'echo "init.d: $(ls /var/lib/webosbrew/init.d 2>/dev/null | tr "\\n" " ")"',
	'echo "probe recorder: $([ -L ' + PROBE_LINK + ' ] && echo installed || echo not installed); timeline: $([ -s ' + TIMELINE + ' ] && echo present || echo none)"'
].join('; ');

export interface Timeline {
	startUp: number | null;
	sam: number | null;
	cfg: number | null;
	nudge: number | null;
	fg: number | null;
	fgId: string;
	home: number | null;
	running: number | null;
	rounds: number;
	end: number | null;
}

/** The first uptime (seconds) at which each thing was seen, from the recorder's lines. */
export function summariseTimeline (out: string): Timeline {
	const t: Timeline = {startUp: null, sam: null, cfg: null, nudge: null, fg: null, fgId: '', home: null, running: null, rounds: 0, end: null};
	lines(out).forEach((l) => {
		let m = /^start T=([\d.]+)/.exec(l);
		if (m) { t.startUp = Number(m[1]); return; }
		m = /^end T=([\d.]+)/.exec(l);
		if (m) { t.end = Number(m[1]); return; }
		m = /^T=([\d.]+) sam=(\w+) cfg=(\w+) fg=(\S+) sys=(\S+) nudge=(\S+)/.exec(l);
		if (!m) return;
		const up = Number(m[1]);
		t.rounds++;
		if (t.sam === null && m[2] !== 'unknown') t.sam = up;
		if (t.cfg === null && m[3] === 'ok') t.cfg = up;
		if (t.fg === null && m[4] !== 'none') { t.fg = up; t.fgId = m[4]; }
		if (t.home === null && m[4] === 'com.webos.app.home') t.home = up;
		if (t.running === null && m[5] === 'running') t.running = up;
		if (t.nudge === null && m[6] === 'ok') t.nudge = up;
	});
	return t;
}

export function timelineText (t: Timeline): string {
	const at = (v: number | null): string => (v === null ? 'not seen' : `up=${Math.round(v)}s`);
	return `recorder started ${at(t.startUp)}; sam answers ${at(t.sam)}; configd answers ${at(t.cfg)}; nudge accepted ${at(t.nudge)}; first app in front ${at(t.fg)}${t.fgId ? ' (' + t.fgId + ')' : ''}; LG Home first in front ${at(t.home)}; system running ${at(t.running)}; ${t.rounds} rounds${t.end === null ? ', unfinished (read again later)' : ''}`;
}

