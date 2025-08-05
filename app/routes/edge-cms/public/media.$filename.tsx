import type { Route } from "./+types/media.$filename";
import { env } from 'cloudflare:workers';

export async function loader({ params }: Route.LoaderArgs) {
  const { filename } = params;
  
  // Get the R2 object
    const object = await env.MEDIA_BUCKET.get(filename);
  
  if (!object) {
    throw new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800"); // 24 hour cache, 7 day stale
  headers.set("Accept-Ranges", "bytes");

  return new Response(object.body, {
    headers,
  });
} 