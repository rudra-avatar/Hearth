/** P81: the short id of a theme made from its name (lower-case letters, digits, dashes; at most 40). */
export function themeSlug (name: string): string {
	const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
	return s || 'theme';
}
