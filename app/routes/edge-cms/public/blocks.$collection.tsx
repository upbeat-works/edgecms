import { getBlockCollectionData, getLatestVersion } from '~/utils/db.server';
import { env } from 'cloudflare:workers';

export async function loader({ params }: { params: { collection: string } }) {
	const collectionName = params.collection;

	// Get live version to determine which snapshot to serve
	const liveVersion = await getLatestVersion('live');

	if (liveVersion) {
		// Try R2 snapshot
		const file = await env.BACKUPS_BUCKET.get(
			`${liveVersion.id}/blocks/${collectionName}.json`,
		);

		if (file) {
			const data = await file.text();
			return new Response(data, {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control':
						'public, max-age=604800, stale-while-revalidate=259200',
				},
			});
		}

		// Collection was added after publish — don't leak draft content
		return new Response(JSON.stringify({ error: 'Collection not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// No published version yet — serve from D1 (initial setup / legacy)
	const data = await getBlockCollectionData(collectionName);

	if (!data) {
		return new Response(JSON.stringify({ error: 'Collection not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return new Response(JSON.stringify(data), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
		},
	});
}
