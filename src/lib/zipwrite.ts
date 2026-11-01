// P97: a tiny zip writer (entries stored, not compressed) for the theme base file. Pure; no dependencies.
// Output is a plain zip that `unzip`, busybox unzip and Hearth's own theme loader read.

export interface ZipFile {
	name: string;
	data: Uint8Array;
}

let table: number[] | null = null;

export function crc32 (data: Uint8Array): number {
	if (!table) {
		table = [];
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
			table.push(c >>> 0);
		}
	}
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Text as UTF-8 bytes (no TextEncoder: the legacy web view may lack it). */
export function utf8 (text: string): Uint8Array {
	const out: number[] = [];
	for (let i = 0; i < text.length; i++) {
		let c = text.charCodeAt(i);
		if (c >= 0xD800 && c < 0xDC00 && i + 1 < text.length) { c = 0x10000 + ((c - 0xD800) << 10) + (text.charCodeAt(++i) - 0xDC00); }
		if (c < 0x80) out.push(c);
		else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
		else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
		else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
	}
	return new Uint8Array(out);
}

const put16 = (a: number[], v: number): void => { a.push(v & 255, (v >>> 8) & 255); };
const put32 = (a: number[], v: number): void => { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); };

/** The zip file as bytes. Names must be plain relative paths (UTF-8). Fixed time stamp (1980-01-01) so the result is repeatable. */
export function buildZip (files: ZipFile[]): Uint8Array {
	const parts: Uint8Array[] = [];
	const central: number[] = [];
	let offset = 0;
	for (const f of files) {
		const name = utf8(f.name);
		const crc = crc32(f.data);
		const head: number[] = [];
		put32(head, 0x04034B50); put16(head, 20); put16(head, 0x0800); put16(head, 0); put16(head, 0); put16(head, 0x21);
		put32(head, crc); put32(head, f.data.length); put32(head, f.data.length); put16(head, name.length); put16(head, 0);
		parts.push(new Uint8Array(head), name, f.data);
		put32(central, 0x02014B50); put16(central, 20); put16(central, 20); put16(central, 0x0800); put16(central, 0); put16(central, 0); put16(central, 0x21);
		put32(central, crc); put32(central, f.data.length); put32(central, f.data.length); put16(central, name.length);
		put16(central, 0); put16(central, 0); put16(central, 0); put16(central, 0); put32(central, 0); put32(central, offset);
		for (let i = 0; i < name.length; i++) central.push(name[i]);
		offset += head.length + name.length + f.data.length;
	}
	const end: number[] = [];
	put32(end, 0x06054B50); put16(end, 0); put16(end, 0); put16(end, files.length); put16(end, files.length);
	put32(end, central.length); put32(end, offset); put16(end, 0);
	parts.push(new Uint8Array(central), new Uint8Array(end));
	let total = 0;
	for (const p of parts) total += p.length;
	const all = new Uint8Array(total);
	let at = 0;
	for (const p of parts) { all.set(p, at); at += p.length; }
	return all;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 of a byte range (no btoa on binary strings: fast and exact). */
export function bytesToBase64 (data: Uint8Array, from = 0, to = data.length): string {
	let out = '';
	for (let i = from; i < to; i += 3) {
		const a = data[i], b = i + 1 < to ? data[i + 1] : 0, c = i + 2 < to ? data[i + 2] : 0;
		out += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (b >> 4))
			+ (i + 1 < to ? B64.charAt(((b & 15) << 2) | (c >> 6)) : '=') + (i + 2 < to ? B64.charAt(c & 63) : '=');
	}
	return out;
}

/** Bytes of a `data:...;base64,` address, or null. */
export function dataUriBytes (uri: string): Uint8Array | null {
	const m = /^data:[a-z/+.-]+;base64,([A-Za-z0-9+/]+=*)$/.exec(uri);
	if (!m) return null;
	const s = m[1].replace(/=+$/, '');
	const out: number[] = [];
	let acc = 0, bits = 0;
	for (let i = 0; i < s.length; i++) {
		acc = (acc << 6) | B64.indexOf(s.charAt(i)); bits += 6;
		if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; }
	}
	return new Uint8Array(out);
}
