// Pure parts of probe tests 42-43 (2.0.3 R7): can the Home button's key hook tell a short press from a long one?
// 42 swaps Hearth's Home binding in Input Hook's keybinds file for a harmless `exec` that writes the TV's uptime to a
// file each time the hook runs it (a backup is kept; the original is put back after 100 s, or by test 43). The user then
// presses Home short and holds it. 43 reads how many times and when the hook ran the command, and restores the file.
// Kept apart from probehome.ts so scripts/test-probehome.mjs can load them on their own.

export const HOME_DIR = '/tmp/hearth-homeprobe';

// ASCII only, POSIX sh. Needs python3 (the reference TV has it) to edit the JSON.
export const HOME_PROBE_SH = `#!/bin/sh
# Hearth Home-button timing probe (tests 42 / 43). start: binds the Home code to a command that appends the uptime to
# hits.txt, after saving a copy of the keybinds file; read: prints the hits and puts the saved file back; restore: only the latter.
KEYS=\${KEYS:-/home/root/.config/lginputhook/keybinds.json}
DIR=\${HP_DIR:-${HOME_DIR}}
REC=$DIR/hits.txt
BAK=$DIR/keybinds.backup
NONE=$DIR/keybinds.none
APP=tld.my.customlauncher
restore () {
  if [ -f "$BAK" ]; then cat "$BAK" > "$KEYS"; rm -f "$BAK"; echo restored=1
  elif [ -f "$NONE" ]; then echo '{}' > "$KEYS"; rm -f "$NONE"; echo restored=1
  else echo restored=0; fi
}
case "$1" in
start)
  command -v python3 >/dev/null 2>&1 || { echo nopython=1; exit 0; }
  mkdir -p "$DIR"
  if [ ! -f "$BAK" ] && [ ! -f "$NONE" ]; then
    if [ -f "$KEYS" ]; then cp "$KEYS" "$BAK"; else echo x > "$NONE"; mkdir -p "$(dirname "$KEYS")"; echo '{}' > "$KEYS"; fi
  fi
  printf '%s\\n' '#!/bin/sh' "cut -d' ' -f1 /proc/uptime >> '$REC'" > "$DIR/hit.sh"
  : > "$REC"
  CODE=$(python3 - "$KEYS" "$APP" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    d = {}
code = "773"
for k, v in d.items():
    if isinstance(v, dict) and v.get("action") == "launch" and v.get("id") == sys.argv[2]:
        code = k
        break
print(code)
PY
)
  python3 - "$KEYS" "$CODE" "$DIR/hit.sh" <<'PY'
import json, sys
p = sys.argv[1]
try:
    d = json.load(open(p))
except Exception:
    d = {}
d[sys.argv[2]] = {"action": "exec", "command": "sh " + sys.argv[3]}
open(p, "w").write(json.dumps(d))
PY
  [ -f /tmp/inputhook ] && echo injected=1 || echo injected=0
  echo code=$CODE
  [ -n "$HP_NOAUTO" ] || ( nohup sh -c "sleep 100; sh '$0' restore" >/dev/null 2>&1 </dev/null & )
  echo started=1
  ;;
read)
  n=$(grep -c . "$REC" 2>/dev/null)
  echo hits=\${n:-0}
  head -n 60 "$REC" 2>/dev/null | sed 's/^/t=/'
  grep -h -i -E 'exec|773|keybind' /tmp/lginput-hook-*.log 2>/dev/null | tail -n 2 | cut -c1-90 | sed 's/^/log=/'
  [ -f /tmp/inputhook ] && echo injected=1 || echo injected=0
  restore
  ;;
restore) restore ;;
esac
`;

import {writeFileCommands} from './homehookcmd';

/** Steps for test 42: write the script, then run `start`. */
export const startSteps = (): string[] => [
	`mkdir -p '${HOME_DIR}'`,
	...writeFileCommands(`${HOME_DIR}/probe.sh`, HOME_PROBE_SH),
	`sh '${HOME_DIR}/probe.sh' start`
];
/** Test 43: read the hits and restore the keybinds. */
export const READ_COMMAND = `[ -f '${HOME_DIR}/probe.sh' ] && sh '${HOME_DIR}/probe.sh' read; true`;

export interface HomeGroup {hits: number; span: number}
export interface HomeProbe {
	nopython: boolean; started: boolean; injected: boolean | null; code: string; hits: number;
	times: number[]; groups: HomeGroup[]; log: string[]; restored: boolean | null; seen: boolean;
}

const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter(Boolean);

/** Press groups: hits closer than 1.2 s belong to one press. */
export function groupHits (times: number[]): HomeGroup[] {
	const groups: HomeGroup[] = [];
	let start = 0, last = 0, n = 0;
	for (const t of times) {
		if (n > 0 && t - last > 1.2) { groups.push({hits: n, span: Math.round((last - start) * 100) / 100}); n = 0; }
		if (n === 0) start = t;
		n++; last = t;
	}
	if (n > 0) groups.push({hits: n, span: Math.round((last - start) * 100) / 100});
	return groups;
}

export function parseHomeProbe (out: string): HomeProbe {
	const p: HomeProbe = {nopython: false, started: false, injected: null, code: '', hits: 0, times: [], groups: [], log: [], restored: null, seen: false};
	for (const l of lines(out)) {
		p.seen = true;
		let m: RegExpExecArray | null;
		if (l === 'nopython=1') p.nopython = true;
		else if (l === 'started=1') p.started = true;
		else if ((m = /^injected=([01])$/.exec(l))) p.injected = m[1] === '1';
		else if ((m = /^code=(\d+)$/.exec(l))) p.code = m[1];
		else if ((m = /^hits=(\d+)$/.exec(l))) p.hits = parseInt(m[1], 10);
		else if ((m = /^t=([0-9.]+)$/.exec(l))) p.times.push(parseFloat(m[1]));
		else if ((m = /^log=(.*)$/.exec(l))) p.log.push(m[1]);
		else if ((m = /^restored=([01])$/.exec(l))) p.restored = m[1] === '1';
	}
	p.times.sort((a, b) => a - b);
	p.groups = groupHits(p.times);
	return p;
}

/** What the hits say about telling a long press from a short one. */
export function homeVerdict (groups: HomeGroup[]): string {
	if (!groups.length) return 'no hits';
	if (groups.some((g) => g.hits >= 3 && g.span >= 1.5)) return 'repeats seen: a long press can be told by count or time';
	if (groups.some((g) => g.hits === 2 && g.span >= 1)) return 'down and up seen: the hold time can be measured';
	if (groups.every((g) => g.hits === 1)) return 'one hit per press only: the hook gives no timing';
	return 'unclear';
}

export function homeProbeText (p: HomeProbe): string {
	const gtext = p.groups.map((g) => `${g.hits} hit${g.hits === 1 ? '' : 's'} over ${g.span.toFixed(2)} s`).join(' | ');
	const tail = (p.restored === null ? '' : p.restored ? '; keybinds restored' : '; nothing to restore');
	if (p.hits === 0) return `NOTHING: no hit recorded (hook ${p.injected === false ? 'not running: turn on Home button opens Hearth first' : 'running, but the command did not run for this button'})${tail}`;
	return `OK: ${p.hits} hits in ${p.groups.length} press group${p.groups.length === 1 ? '' : 's'}: ${gtext}; ${homeVerdict(p.groups)}${p.log.length ? '; hook log: ' + p.log.join(' / ') : ''}${tail}`;
}
