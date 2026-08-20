export async function getCatalogueRevision(
	translations: Record<string, string>,
): Promise<string> {
	const entries = Object.entries(translations).sort(([left], [right]) => {
		if (left < right) return -1;
		if (left > right) return 1;
		return 0;
	});
	const bytes = new TextEncoder().encode(JSON.stringify(entries));
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return Array.from(new Uint8Array(digest), byte =>
		byte.toString(16).padStart(2, '0'),
	).join('');
}
