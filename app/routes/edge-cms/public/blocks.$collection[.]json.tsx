import { getBlockCollectionData } from '~/utils/db.server';
import { env } from 'cloudflare:workers';

export async function loader({ params }: { params: { collection: string } }) {
	const collectionName = params.collection;

	// Check cache first
	const cacheKey = `blocks:${collectionName}`;
	const cached = await env.CACHE.get(cacheKey);
	if (cached) {
		return new Response(cached, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=604800, stale-while-revalidate=259200',
			},
		});
	}

	// Get collection data
	const data = await getBlockCollectionData(collectionName);

	if (!data) {
		return new Response(JSON.stringify({ error: 'Collection not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const json = JSON.stringify(data);

	// Cache for 90 days
	await env.CACHE.put(cacheKey, json, { expirationTtl: 90 * 24 * 60 * 60 });

	return new Response(json, {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=604800, stale-while-revalidate=259200',
		},
	});
}
