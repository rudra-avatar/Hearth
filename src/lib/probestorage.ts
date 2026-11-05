// Test 44 (J): see probestoragecmd.ts. Writes one temporary key (removed again) to find the room left; manual only.
import type {ProbeResult, ProbeTest} from './probe';
import {measureHeadroom, storageText} from './probestoragecmd';
import {probeContext} from './probecontext';

const clip = (text: string, n = 760): string => (text.length > n ? text.slice(0, n - 1) + '…' : text);

export const STORAGE_TESTS: ProbeTest[] = [
	{
		id: 'storage-room', manual: true, label: '44. Storage size and room left',
		description: 'Shows how full Hearth\'s browser store is and how much room is left (writes one temporary entry and removes it; takes a few seconds). Send the answer.',
		run: (): Promise<ProbeResult> => {
			try {
				const room = measureHeadroom(localStorage);
				return Promise.resolve({ok: true, text: clip('OK: ' + storageText(localStorage, room) + ' | ' + probeContext())});
			} catch (e) {
				return Promise.resolve({ok: false, text: 'FAILED: ' + String(e && (e as Error).message ? (e as Error).message : e).slice(0, 120)});
			}
		}
	}
];
