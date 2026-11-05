// Probe tests 49-52 (Tests tab only, 2.0.3 V probe): the root "stand-in" way of replacing LG's Home on TVs where LG's Home is a
// NATIVE program (webOS 5-23). Instead of mounting a shim over Home's manifest and restarting SAM (our samHome), a small script is
// mounted over Home's PROGRAM only; SAM keeps LG's manifest, is not restarted, and starts the script as Home. The script asks
// webapp-mgr to open Hearth's copy as com.webos.app.home. The idea is from cleanyourtv-WebOS (MIT licence); this code is our own.
// Everything is RAM only (a bind mount): a restart, test 52 or the 20-minute timer puts LG's Home back. No start-up link is written.
// Pure parts only (text and parsers), so a node test can load this file.

export const DIR = '/media/developer/launcher-standin';
export const HOME_DIR = '/usr/palm/applications/com.webos.app.home';
export const HEARTH_DIR = '/media/developer/apps/usr/palm/applications/tld.my.customlauncher';
export const LOG = '/tmp/launcher-standin.log';
export const AUTO_UNDO_SECONDS = 1200;

type Json = Record<string, unknown>;

/** The shell lines that find LG Home's program (its `main`, absolute or inside its folder, else /usr/bin/<id>). Sets $A $H $EXE. */
export const EXE_SNIPPET = `H=${HOME_DIR}; A=$H/appinfo.json; M=$(sed -n 's/.*"main" *: *"\\([^"]*\\)".*/\\1/p' $A 2>/dev/null | head -1); case "$M" in /*) EXE=$M;; *) EXE=$H/$M;; esac; [ -f "$EXE" ] || EXE=/usr/bin/com.webos.app.home`;

/** Test 49: reads only. */
export const FACTS_COMMAND = `${EXE_SNIPPET}; ` + [
	`echo "up=$(cut -d' ' -f1 /proc/uptime)"`,
	`echo "home: appinfo=$([ -f $A ] && echo yes || echo no) type=$(sed -n 's/.*"type" *: *"\\([^"]*\\)".*/\\1/p' $A 2>/dev/null | head -1) main=$M"`,
	`echo "program: $EXE file=$([ -f "$EXE" ] && echo yes || echo no) start=$(head -c 4 "$EXE" 2>/dev/null | od -An -c | head -1 | tr -s ' ') mounted=$(grep -c " $EXE " /proc/mounts)"`,
	`echo "home-folder-mounts=$(grep -c " $H " /proc/mounts) running=$(ps 2>/dev/null | grep -F "$EXE" | grep -v 'grep\\|sh -c' | wc -l)"`,
	`echo "links: $(ls /var/lib/webosbrew/init.d 2>/dev/null | grep -i 'launcher\\|cleanyourtv' | tr '\\n' ' ')"`,
	`echo "tools: $(for c in luna-send mount umount base64 ps awk od; do command -v $c >/dev/null 2>&1 && printf '%s ' $c || printf '!%s ' $c; done)"`,
	`echo "sam: $(luna-send -n 1 -w 4000 luna://com.webos.applicationManager/getAppInfo '{"id":"com.webos.app.home"}' 2>&1 </dev/null | tr -d '\\n' | sed -n 's/.*"type" *: *"\\([^"]*\\)".*/type=\\1/p' | head -1)"`,
	`echo "webapp-mgr: $(luna-send -n 1 -w 4000 luna://com.palm.webappmanager/listRunningApps '{}' 2>&1 </dev/null | grep -c '"returnValue": *true')"`,
	`echo "front: $(luna-send -n 1 -w 3000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>&1 </dev/null | tr -d '\\n ' | sed 's/.*"appId":"\\([^"]*\\)".*/\\1/' | cut -c1-60)"`,
	`echo "hearth-folder=$([ -f ${HEARTH_DIR}/index.html ] && echo yes || echo no)"`
].join('; ');

/** Test 50, step 1: refuses to go on in a state that would confuse the trial. Prints `ok exe=<path>` or one reason word. */
export const PRE_COMMAND = `${EXE_SNIPPET}; if [ ! -f $A ]; then echo nohome; elif [ ! -f "$EXE" ]; then echo noexe; elif [ ! -f ${HEARTH_DIR}/index.html ]; then echo nohearth; elif grep -q " $EXE " /proc/mounts; then echo already; elif grep -q " $H " /proc/mounts; then echo samhome; else echo "ok exe=$EXE"; fi`;

export const STOCK_APPINFO_COMMAND = `cat ${HOME_DIR}/appinfo.json`;

/** Test 50, step 3: the staging folder, a backup of LG's manifest, and Hearth's own files (without the big optional folders). */
export const STAGE_COMMAND = `mkdir -p ${DIR}/backup && rm -rf ${DIR}/overlay && mkdir -p ${DIR}/overlay && { [ -f ${DIR}/backup/home-appinfo.orig.json ] || cp ${HOME_DIR}/appinfo.json ${DIR}/backup/home-appinfo.orig.json; } && cp -r ${HEARTH_DIR}/. ${DIR}/overlay/ && rm -rf ${DIR}/overlay/saver ${DIR}/overlay/wallpapers && echo staged`;

/** Test 50, step 5: record the program, mount the stand-in over it, stop LG's running Home once, arm the 20-minute undo. */
export const MOUNT_COMMAND = `${EXE_SNIPPET}; chmod 755 ${DIR}/standin.sh ${DIR}/undo.sh; echo "$EXE" > ${DIR}/exe; : > ${LOG}; echo "$(cut -d' ' -f1 /proc/uptime) test: mounting over $EXE" >> ${LOG}; mount --bind ${DIR}/standin.sh "$EXE" 2>&1; if grep -q " $EXE " /proc/mounts; then for p in $(ps 2>/dev/null | grep -F "$EXE" | grep -v 'grep\\|sh -c\\|luna-send' | awk '{print $1}'); do kill $p 2>/dev/null; done; (sleep ${AUTO_UNDO_SECONDS}; sh ${DIR}/undo.sh auto) </dev/null >/dev/null 2>&1 & echo "mounted exe=$EXE"; else echo "mountfailed"; fi`;

/** Test 51: the stand-in's log. */
export const READ_COMMAND = `tail -n 60 ${LOG} 2>/dev/null; echo "--mount: $(grep -c "$(cat ${DIR}/exe 2>/dev/null)" /proc/mounts 2>/dev/null)"`;

/** Test 52. */
export const UNDO_COMMAND = `[ -f ${DIR}/undo.sh ] && sh ${DIR}/undo.sh test || echo nothing`;

const NATIVE_ONLY = ['nativeLifeCycleInterfaceVersion', 'containerBasedApp', 'supportQuickStart', 'windowGroup', 'qmlIncludePath', 'qtModules'];

/** Hearth's page described as LG's Home (id com.webos.app.home), derived from this TV's own Home manifest (nothing of LG's is shipped). */
export function overlayAppinfo (stockText: string): Json | null {
	let h: unknown;
	try { h = JSON.parse(stockText); } catch (e) { return null; }
	if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
	const o = h as Json;
	if (o.id !== 'com.webos.app.home') return null;
	if (o.type !== 'web') NATIVE_ONLY.forEach((k) => { delete o[k]; });
	o.type = 'web';
	o.main = 'index.html';
	delete o.splashBackground;
	delete o.noSplashOnLaunch;
	o.bgColor = '#000000';
	o.transparent = false;
	return o;
}

/** The webapp-mgr launchApp request; `asString` is the form older webapp-mgr versions may expect (the description as text). */
export function launchRequest (appDesc: Json, asString: boolean): string {
	const desc: Json = {...appDesc, folderPath: DIR + '/overlay'};
	return JSON.stringify({appDesc: asString ? JSON.stringify(desc) : desc, parameters: {}, launchingAppId: '', launchingProcId: '', instanceId: 'hearth-standin'});
}

export const STANDIN_SH = `#!/bin/sh
# Hearth probe (tests 49-52): stand-in for LG's native Home program. The test mounts this file over that program (RAM only).
# SAM starts it as Home; it asks webapp-mgr to open Hearth's copy as com.webos.app.home, and stays running so the Home key
# arrives as a "relaunch" event. Three refusals in a row: LG's Home is put back (undo.sh). Idea: cleanyourtv-WebOS (MIT).
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
D=/media/developer/launcher-standin
LOG=/tmp/launcher-standin.log
FAILS=/tmp/launcher-standin.fails
up() { cut -d' ' -f1 /proc/uptime; }
cs() { up | tr -d '.'; }
log() { echo "$(up) standin[$$]: $*" >> $LOG 2>/dev/null; }
ls2() { command luna-send "$@" </dev/null; }
front() { ls2 -n 1 -w 3000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>&1 | tr -d '\\n ' | sed 's/.*"appId":"\\([^"]*\\)".*/\\1/' | cut -c1-60; }
okreply() { case "$1" in *'"returnValue": true'*|*'"returnValue":true'*) return 0 ;; esac; return 1; }

# a reader left by an earlier copy
for p in $(ps 2>/dev/null | grep -F 'luna-send -i -a com.webos.app.home' | grep -v grep | awk '{print $1}'); do kill "$p" 2>/dev/null; done

show() {
  case "$1 $2" in
    *'"reason":"preload"'*|*'"reason": "preload"'*) log "preloaded by SAM, not opened ($1)"; return 0 ;;
  esac
  t0=$(cs)
  log "event $1 $(echo "$2" | cut -c1-160) | front before: $(front)"
  r=$(ls2 -n 1 -w 8000 luna://com.palm.webappmanager/launchApp "$(cat $D/wam-launch.json)" 2>&1 | tr -d '\\n')
  if okreply "$r"; then ok=1; else
    r2=$(ls2 -n 1 -w 8000 luna://com.palm.webappmanager/launchApp "$(cat $D/wam-launch.json.str)" 2>&1 | tr -d '\\n')
    if okreply "$r2"; then ok=2; else ok=0; fi
  fi
  if [ $ok != 0 ]; then
    rm -f $FAILS
    log "launcher shown ($1, form $ok) in $((($(cs) - t0) * 10)) ms"
    ( sleep 2; log "front 2 s later: $(front)" ) </dev/null >/dev/null 2>&1 &
    return 0
  fi
  n=$(cat $FAILS 2>/dev/null); [ -n "$n" ] || n=0; n=$((n + 1)); echo $n > $FAILS
  log "webapp-mgr refused ($n): $(echo "$r" | cut -c1-200)"
  if [ $n -ge 3 ]; then log "3 refusals: putting LG's Home back"; sh $D/undo.sh auto </dev/null >/dev/null 2>&1 & fi
  return 1
}

log "started as uid $(id -u), arguments: $(echo "$*" | cut -c1-200), front: $(front)"
show start "$1"
for m in registerApp registerNativeApp; do
  ls2 -i -a com.webos.app.home "luna://com.webos.applicationManager/$m" '{}' 2>&1 | while read -r line; do
    case "$line" in
      *'"event"'*relaunch*) show relaunch "$line" ;;
      *'"event"'*close*) log "closed by SAM"; kill $$ 2>/dev/null; exit 0 ;;
      *'"event"'*registered*) log "registered with SAM ($m)" ;;
      *'"returnValue"'*false*) log "$m refused: $(echo "$line" | cut -c1-200)" ;;
    esac
  done
  log "$m ended"
done
log "no registration: SAM restarts this script on the Home key"
while :; do sleep 60; done
`;

export const UNDO_SH = `#!/bin/sh
# Hearth probe (tests 49-52): takes the stand-in away and puts LG's Home back. $1: test, or auto (timer, three refusals).
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
D=/media/developer/launcher-standin
LOG=/tmp/launcher-standin.log
EXE=$(cat $D/exe 2>/dev/null)
log() { echo "$(cut -d' ' -f1 /proc/uptime) undo[$$]($1): $2" >> $LOG 2>/dev/null; }
[ -n "$EXE" ] || { echo noexe; exit 1; }
for p in $(ps 2>/dev/null | grep -F "$EXE" | grep -v 'grep\\|undo.sh\\|sh -c' | awk '{print $1}'); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null; done
for p in $(ps 2>/dev/null | grep -F 'luna-send -i -a com.webos.app.home' | grep -v grep | awk '{print $1}'); do kill "$p" 2>/dev/null; done
sleep 1
n=0
while grep -q " $EXE " /proc/mounts && [ $n -lt 4 ]; do umount "$EXE" 2>/dev/null || umount -l "$EXE" 2>/dev/null; n=$((n + 1)); sleep 1; done
if grep -q " $EXE " /proc/mounts; then log "$1" "still mounted"; echo busy; exit 1; fi
command luna-send -n 1 -w 5000 luna://com.palm.webappmanager/killApp '{"appId":"com.webos.app.home"}' </dev/null >/dev/null 2>&1
log "$1" "LG's Home is back"
cp $LOG $D/last.log 2>/dev/null
rm -f /tmp/launcher-standin.fails
echo restored
`;

export const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);

/** Test 49: the facts as one readable line each. */
export function factsText (out: string): string {
	return out.split('\n').map((l) => l.trim()).filter(Boolean).join(' | ');
}

/** What the facts say about the way: native program (stand-in possible) or not. */
export function factsVerdict (out: string): {ok: boolean; text: string} {
	const type = (/home: appinfo=\w+ type=(\w*)/.exec(out) || [])[1] || '';
	const prog = /program: \S+ file=yes/.test(out);
	if (!/home: appinfo=yes/.test(out)) return {ok: false, text: 'FAILED: LG Home has no manifest here (webOS 3 has no LG Home)'};
	if (type === 'web' || type === 'flutter') return {ok: false, text: `NOT SUITED: LG Home is a ${type} app here; the stand-in way is for a native Home`};
	if (!prog) return {ok: false, text: 'FAILED: LG Home\'s program file was not found'};
	return {ok: true, text: `OK: LG Home looks native${type ? ' (type ' + type + ')' : ''}`};
}

export interface StartLog {
	started: number; preload: number; starts: number; relaunches: number; shown: number; refused: number;
	registered: string[]; closed: number; times: number[]; reverted: boolean; front2: string[]; uid: string;
}

/** Test 51: reads the stand-in's log lines. `shown ... in N ms` gives the time webapp-mgr took to answer. */
export function summariseLog (log: string): StartLog {
	const s: StartLog = {started: 0, preload: 0, starts: 0, relaunches: 0, shown: 0, refused: 0, registered: [], closed: 0, times: [], reverted: false, front2: [], uid: ''};
	log.split('\n').forEach((line) => {
		let m: RegExpExecArray | null;
		if (/standin\[\d+\]: started as uid/.test(line)) { s.started++; m = /uid (\d+)/.exec(line); if (m) s.uid = m[1]; }
		else if (/preloaded by SAM/.test(line)) s.preload++;
		else if (/standin\[\d+\]: event start/.test(line)) s.starts++;
		else if (/standin\[\d+\]: event relaunch/.test(line)) s.relaunches++;
		else if (/launcher shown/.test(line)) { s.shown++; m = /in (\d+) ms/.exec(line); if (m) s.times.push(Number(m[1])); }
		else if (/webapp-mgr refused/.test(line)) s.refused++;
		else if (/registered with SAM \((\w+)\)/.test(line)) { m = /\((\w+)\)/.exec(line); if (m && s.registered.indexOf(m[1]) < 0) s.registered.push(m[1]); }
		else if (/closed by SAM/.test(line)) s.closed++;
		else if (/putting LG's Home back|LG's Home is back/.test(line)) s.reverted = true;
		else if (/front 2 s later: (\S+)/.test(line)) { m = /front 2 s later: (\S+)/.exec(line); if (m) s.front2.push(m[1]); }
	});
	return s;
}

export function logText (s: StartLog): string {
	const median = s.times.length ? [...s.times].sort((a, b) => a - b)[Math.floor(s.times.length / 2)] : -1;
	return [
		`stand-in started ${s.started}x${s.uid ? ' as uid ' + s.uid : ''}`,
		`events: start ${s.starts}, Home key (relaunch) ${s.relaunches}, preload ${s.preload}`,
		`launcher shown ${s.shown}x${median >= 0 ? ', webapp-mgr answered in ' + median + ' ms (median)' : ''}, refused ${s.refused}x`,
		`registered with SAM: ${s.registered.length ? s.registered.join('+') : 'no'}`,
		s.front2.length ? `in front 2 s after: ${s.front2.slice(-3).join(', ')}` : '',
		s.closed ? `closed by SAM ${s.closed}x` : '',
		s.reverted ? 'LG Home was put back' : ''
	].filter(Boolean).join('; ');
}
