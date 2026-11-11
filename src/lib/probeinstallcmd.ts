// Probe test 37 (Tests tab only, 2.0.3 R2-b1): can Hearth install the GitHub release through root exec, and does the
// install finish while Hearth itself is replaced? The shell script is plain text (no TV calls) so a node test can run it
// on a fake TV (`scripts/test-probeinstall.mjs`). It runs detached from Hearth and writes /tmp/hearth-install.log.

export const INSTALL_LOG = '/tmp/hearth-install.log';
export const INSTALL_SH = '/tmp/hearth-install.sh';
export const INSTALL_OUT = '/tmp/hearth-install.out';
/** Where the .ipk is put for the install service, in this order (R2-b1: it did not see /tmp). */
export const INSTALL_PLACES = ['/media/developer/hearth-install.ipk', '/tmp/hearth-install.ipk'];
export const INSTALL_ID = 'tld.my.customlauncher';
const SHA = /^[0-9a-f]{64}$/;
const URL_OK = /^https:\/\/github\.com\/rudra-avatar\/Hearth\/releases\/download\/[A-Za-z0-9._\/-]+$/;
const VER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export interface InstallTarget {url: string; sha: string; version: string}

/** The release to install from the Homebrew list text, or why not. Only a Hearth release address and a SHA-256 pass. */
export function installTarget (json: string): InstallTarget | string {
	let data: any;
	try { data = JSON.parse(json); } catch (e) { return 'apps.json is not readable'; }
	const m = data && data.packages && data.packages[0] && data.packages[0].manifest;
	if (!m || typeof m.ipkUrl !== 'string' || !URL_OK.test(m.ipkUrl)) return 'apps.json has no Hearth release address';
	const sha = m.ipkHash && typeof m.ipkHash.sha256 === 'string' ? m.ipkHash.sha256.toLowerCase() : '';
	if (!SHA.test(sha)) return 'apps.json has no SHA-256';
	const fromUrl = /_(\d{1,3}\.\d{1,3}\.\d{1,3})_all/.exec(m.ipkUrl);
	const version = typeof m.version === 'string' && VER.test(m.version) ? m.version : fromUrl ? fromUrl[1] : '';
	if (!version) return 'apps.json has no version';
	return {url: m.ipkUrl, sha, version};
}

/** The install script: download, SHA-256 check, install through appInstallService (each place in turn until the service
 *  finds the file), read the version back, delete every copy of the file. */
export function installScript (t: InstallTarget): string {
	if (!URL_OK.test(t.url) || !SHA.test(t.sha) || !VER.test(t.version)) throw new Error('install target not valid');
	const [p1, p2] = INSTALL_PLACES;
	const uri = 'luna://com.webos.appInstallService/dev/install';
	const json = `'{"id":"${INSTALL_ID}","ipkUrl":"'"$f"'","subscribe":true}'`;
	return [
		`L=${INSTALL_LOG}`,
		`O=${INSTALL_OUT}`,
		`P1=${p1}`,
		`P2=${p2}`,
		'say() { echo "$(date +%T) up=$(cut -d. -f1 /proc/uptime) $*" >> $L; }',
		': > $L',
		`say "start target=${t.version}"`,
		'rm -f $P1 $P2 $O',
		`(wget -q -O $P1 "${t.url}" 2>/dev/null || curl -s -L -o $P1 "${t.url}" 2>/dev/null)`,
		'size=$(wc -c < $P1 2>/dev/null)',
		'sha=$( (sha256sum $P1 || openssl dgst -sha256 $P1) 2>/dev/null | grep -o -E "[0-9a-f]{64}" | head -1)',
		'say "download size=$size"',
		`if [ "$sha" != "${t.sha}" ]; then say "STOP sha differs ($sha)"; rm -f $P1 $P2 $O; say "end"; exit 1; fi`,
		'say "sha ok"',
		'for f in $P1 $P2; do',
		'  [ -f $f ] || cp $P1 $f 2>/dev/null',
		'  chmod 644 $f 2>/dev/null',
		'  say "try path=$f"',
		'  say "ls $(ls -l $f 2>&1 | cut -c1-90)"',
		'  rm -f $O',
		`  (timeout 120 luna-send -i ${uri} ${json} > $O 2>&1 &)`,
		'  i=0',
		`  while [ $i -lt 60 ]; do sleep 2; i=$((i+1)); grep -q -i -E 'disconnected|installed|appFile is missing|returnValue": *false' $O 2>/dev/null && break; done`,
		`  while read -r line; do say "luna: $(printf '%s' "$line" | cut -c1-160)"; done < $O`,
		'  grep -q "appFile is missing" $O 2>/dev/null && continue',
		'  break',
		'done',
		'sleep 3',
		`v=$(grep -h -o '"version": *"[^"]*"' /media/developer/apps/usr/palm/applications/${INSTALL_ID}/appinfo.json /usr/palm/applications/${INSTALL_ID}/appinfo.json 2>/dev/null | head -1)`,
		'say "installed appinfo $v"',
		'rm -f $P1 $P2 $O',
		'say "file removed: $( [ -e $P1 ] || [ -e $P2 ] && echo NO || echo yes)"',
		'say "end"'
	].join('\n');
}

/** One root command: writes the script and starts it detached, so it goes on when Hearth is closed by the install. */
export function installLaunch (t: InstallTarget): string {
	return `cat > ${INSTALL_SH} <<'HEARTH_EOF'\n${installScript(t)}\nHEARTH_EOF\n` +
		`if command -v setsid >/dev/null 2>&1; then (setsid sh ${INSTALL_SH} >/dev/null 2>&1 < /dev/null &); else (sh ${INSTALL_SH} >/dev/null 2>&1 < /dev/null &); fi; echo started`;
}

export interface InstallLog {started: boolean; ended: boolean; stopped: boolean; target: string; version: string; luna: string[]; problems: string[]; tries: string[]; ls: string[]; removed: string}

export function parseInstallLog (text: string): InstallLog {
	const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
	const r: InstallLog = {started: false, ended: false, stopped: false, target: '', version: '', luna: [], problems: [], tries: [], ls: [], removed: ''};
	lines.forEach((l) => {
		const body = l.replace(/^\d\d:\d\d:\d\d up=\d+ /, '');
		let m: RegExpExecArray | null;
		if ((m = /^start target=(\S+)/.exec(body))) { r.started = true; r.target = m[1]; }
		else if (body === 'end') r.ended = true;
		else if ((m = /^try path=(\S+)/.exec(body))) r.tries.push(m[1]);
		else if (body.indexOf('ls ') === 0) r.ls.push(body.slice(3));
		else if ((m = /^file removed: (\S+)/.exec(body))) r.removed = m[1];
		else if (body.indexOf('STOP') === 0) { r.stopped = true; r.problems.push(body); }
		else if ((m = /^installed appinfo .*"version": *"([^"]*)"/.exec(body))) r.version = m[1];
		else if (body.indexOf('luna: ') === 0) {
			r.luna.push(body.slice(6));
			if (/error|fail|denied|not allowed|invalid/i.test(body) && !/"returnValue": *true/.test(body)) r.problems.push(body.slice(6));
		}
	});
	return r;
}

/** "ended, installed version 2.0.2 (target 2.0.2), 5 answers; last: ..." for the Tests tab. */
export function installText (l: InstallLog): string {
	if (!l.started) return 'no install log (nothing started)';
	const last = l.luna.slice(-3).map((s) => s.slice(0, 120)).join(' / ');
	const state = l.stopped ? 'STOPPED' : l.ended ? 'ended' : 'still running';
	return `${state}; tried ${l.tries.length ? l.tries.join(' then ') : 'nothing'}${l.ls.length ? ' (' + l.ls[l.ls.length - 1].slice(0, 70) + ')' : ''}; file removed ${l.removed || 'unknown'}; version read back ${l.version || 'none'} (target ${l.target}); ${l.luna.length} answers from the install service${l.problems.length ? '; problems: ' + l.problems.slice(0, 2).join(' / ').slice(0, 200) : ''}${last ? '; last: ' + last : ''}`;
}

/** True when the install ended and the version read back is the target. */
export function installWorked (l: InstallLog): boolean {
	return l.ended && !l.stopped && !!l.target && l.version === l.target;
}
