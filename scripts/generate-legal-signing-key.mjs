const keyPair = await crypto.subtle.generateKey(
	{ name: 'ECDSA', namedCurve: 'P-256' },
	true,
	['sign', 'verify'],
);
const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

process.stdout.write(
	`${JSON.stringify({
		...privateJwk,
		alg: 'ES256',
		key_ops: ['sign'],
		ext: true,
	})}\n`,
);
