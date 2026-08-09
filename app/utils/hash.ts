/**
 * A short, stable fingerprint of a string.
 *
 * Used to tell whether a value changed, never to protect anything, so a cheap
 * non-cryptographic hash is the right tool: it stays synchronous, which matters
 * when a bulk import hashes thousands of values in one request, where
 * `crypto.subtle.digest` would cost an await apiece.
 *
 * cyrb53 — 53 bits, so two different values of the same key colliding (and
 * hiding a change) is not a practical concern.
 */
export function hashValue(value: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;

	for (let i = 0; i < value.length; i++) {
		const ch = value.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}

	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
