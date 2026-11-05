// J: what test 37 (and 44) also writes about this TV's state: backdrop, wallpaper, helper, SAM, keep-ready, storage total. app.tsx supplies the function.
let provider: (() => string) | null = null;
export function setProbeContext (fn: (() => string) | null): void { provider = fn; }
export function probeContext (): string {
	try { return provider ? provider() : 'no context'; } catch { return 'context not readable'; }
}
