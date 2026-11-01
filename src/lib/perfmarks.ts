// Start-up time marks (ms since the page began loading), read by Tests row 28. A mark is kept once, the first time it is set.

const marks: Array<[string, number]> = [];

function sinceStart (): number {
	if (typeof performance !== 'undefined' && performance.now) return performance.now();
	return Date.now() - ((performance as unknown as {timing?: {navigationStart?: number}}).timing || {}).navigationStart!;
}

export function mark (name: string): void {
	if (marks.some((m) => m[0] === name)) return;
	marks.push([name, Math.round(sinceStart())]);
}

/** One line for the helper log (P54): where the time before the first screen goes, in ms since the page started. `html` = the page
 *  file arrived and began to parse, `dcl` = the page finished parsing (the bundle ran before it), `app.js` = the bundle's load
 *  start and end, then our own marks. */
export function startupSplit (): string {
	const parts: string[] = [];
	try {
		const t = (performance as unknown as {timing?: Record<string, number>}).timing;
		if (t && t.navigationStart) {
			const rel = (v: number) => (v ? String(v - t.navigationStart) : '-');
			parts.push(`html ${rel(t.responseEnd)} dom ${rel(t.domLoading)} dcl ${rel(t.domContentLoadedEventStart)}`);
		}
		const res = (performance.getEntriesByType ? performance.getEntriesByType('resource') : []) as unknown as Array<{name: string; startTime: number; responseEnd: number}>;
		for (const r of res) if (/\/app(\.legacy)?\.js$/.test(r.name)) parts.push(`app.js ${Math.round(r.startTime)}-${Math.round(r.responseEnd)}`);
	} catch (e) { /* the report just has no split */ }
	for (const m of marks) parts.push(`${m[0]} ${m[1]}`);
	return parts.join(', ');
}

export function markList (): ReadonlyArray<readonly [string, number]> { return marks; }
