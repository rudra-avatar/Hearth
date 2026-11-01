// Issue #32: the bundled photos of 1.2.0 (nature-NN) came back in 2.0 under other numbers (photo-NN, same pictures, re-encoded).
// Ids are PERMANENT: never edit or remove an entry; a saved id from an old release must keep pointing at the same picture.
// nature-01 (snowy peak) is not in 2.0: it falls back to the default photo (photo-17; fallback assumed by the agent, user not asked).
const LEGACY_PHOTO_IDS: Record<string, string> = {
	'nature-show': 'photo-show',
	'nature-01': 'photo-17',
	'nature-02': 'photo-03',
	'nature-03': 'photo-04',
	'nature-04': 'photo-08',
	'nature-05': 'photo-10',
	'nature-06': 'photo-13',
	'nature-07': 'photo-14',
	'nature-08': 'photo-16',
	'nature-09': 'photo-17',
	'nature-10': 'photo-19',
	'nature-11': 'photo-25'
};

/** The current id of a saved background id (unchanged when it is not a 1.2.0 id). */
export function currentPhotoId (id: string): string {
	return Object.prototype.hasOwnProperty.call(LEGACY_PHOTO_IDS, id) ? LEGACY_PHOTO_IDS[id] : id;
}

/** The same for a saver source `@photo:<id>`. */
export function currentSaverSource (source: string): string {
	return source.indexOf('@photo:') === 0 ? '@photo:' + currentPhotoId(source.slice(7)) : source;
}

export const LEGACY_PHOTO_TARGETS: string[] = Object.keys(LEGACY_PHOTO_IDS).map((k) => LEGACY_PHOTO_IDS[k]);
