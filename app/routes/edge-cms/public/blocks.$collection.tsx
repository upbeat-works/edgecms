import { getBlockCollectionData } from '~/utils/db.server';

export async function loader({ params }: { params: { collection: string } }) {
	const data = await getBlockCollectionData(params.collection);

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
