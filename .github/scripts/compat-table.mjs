// Builds the "verified reports" table of docs/COMPATIBILITY.md from the issues that carry the label `verified`.
// Run by .github/workflows/compatibility.yml (needs GITHUB_REPOSITORY and GITHUB_TOKEN), or locally with
//   node .github/scripts/compat-table.mjs --file issues.json [--out docs/COMPATIBILITY.md]
// Issue text is untrusted: every cell is cut down to plain short text; only the issue number links out.
import {readFileSync, writeFileSync} from 'node:fs';

const START = '<!-- verified-table:start -->';
const END = '<!-- verified-table:end -->';
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ''; };

export function clean (text, max = 48) {
	const s = String(text || '').replace(/_No response_/g, '').replace(/:\/\//g, ' ').replace(/[<>`|\\\[\]*_~#]/g, '').replace(/\s+/g, ' ').trim();
	return s.length > max ? s.slice(0, max - 1).trim() + '...' : s;
}

/** An issue form body is "### Heading\n\nanswer" blocks. */
export function sections (body) {
	const out = [];
	String(body || '').replace(/\r/g, '').split(/^### /m).slice(1).forEach((block) => {
		const nl = block.indexOf('\n');
		out.push({head: (nl < 0 ? block : block.slice(0, nl)).trim(), text: (nl < 0 ? '' : block.slice(nl + 1)).trim()});
	});
	return out;
}

function pick (secs, start) {
	const s = secs.filter((x) => x.head.toLowerCase().indexOf(start) === 0)[0];
	return s && s.text !== '_No response_' ? s.text : '';
}
const isOther = (v) => /^other/i.test(v);
const short = (v) => v.replace(/\s*\(.*$/, '');

/** One table row from one issue, or null when the body is not a compatibility form. */
export function rowOf (issue) {
	const s = sections(issue.body);
	const works = pick(s, 'does hearth work');
	if (!works) return null;
	const type = pick(s, 'tv type');
	const exactModel = pick(s, 'exact tv model');
	const webos = pick(s, 'webos version');
	const webosExact = pick(s, 'exact webos');
	const fw = pick(s, 'firmware version');
	const fwExact = pick(s, 'your firmware');
	const version = pick(s, 'hearth version');
	const rooted = pick(s, 'is the tv rooted');
	const remote = pick(s, 'remote control');
	const way = pick(s, 'how do you open');
	return [
		clean(exactModel || (isOther(type) ? '' : type) || '?'),
		clean(webosExact || (isOther(webos) ? '' : short(webos)) || '?', 24),
		clean(isOther(fw) ? fwExact || '?' : fw || fwExact || '?', 20),
		/^yes/i.test(rooted) ? 'Rooted' : /^no/i.test(rooted) ? 'Not rooted' : '?',
		/^yes/i.test(works) ? 'Works' : 'Does not work',
		clean(version && !isOther(version) ? version : '?', 12),
		clean(isOther(remote) ? '' : remote || '', 24),
		clean(way || '', 36),
		'[#' + issue.number + '](' + issue.html_url + ')'
	];
}

export function tableOf (issues) {
	const rows = issues.filter((i) => !i.pull_request).sort((a, b) => a.number - b.number).map(rowOf).filter(Boolean);
	if (!rows.length) return '_No verified reports yet._';
	const head = ['TV model', 'webOS', 'Firmware', 'Setup', 'Result', 'Hearth', 'Remote', 'How it opens', 'Report'];
	return ['| ' + head.join(' | ') + ' |', '| ' + head.map(() => '---').join(' | ') + ' |'].concat(rows.map((r) => '| ' + r.join(' | ') + ' |')).join('\n');
}

export function insert (doc, table) {
	const a = doc.indexOf(START), b = doc.indexOf(END);
	if (a < 0 || b < a) throw new Error('markers missing in the document');
	return doc.slice(0, a + START.length) + '\n' + table + '\n' + doc.slice(b);
}

async function fetchIssues () {
	const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
	if (!repo) throw new Error('GITHUB_REPOSITORY is not set');
	let all = [];
	for (let page = 1; page < 20; page++) {
		const res = await fetch('https://api.github.com/repos/' + repo + '/issues?labels=verified&state=all&per_page=100&page=' + page, {
			headers: {Accept: 'application/vnd.github+json', ...(token ? {Authorization: 'Bearer ' + token} : {})}
		});
		if (!res.ok) throw new Error('GitHub answered ' + res.status);
		const list = await res.json();
		all = all.concat(list);
		if (list.length < 100) break;
	}
	return all;
}

if (process.argv[1] && process.argv[1].endsWith('compat-table.mjs')) {
	const file = arg('--file');
	const out = arg('--out') || 'docs/COMPATIBILITY.md';
	const issues = file ? JSON.parse(readFileSync(file, 'utf8')) : await fetchIssues();
	const doc = readFileSync(out, 'utf8');
	const next = insert(doc, tableOf(issues));
	if (next !== doc) writeFileSync(out, next);
	console.log(next === doc ? 'table unchanged' : 'table updated');
}
