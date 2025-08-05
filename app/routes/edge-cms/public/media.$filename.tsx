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
  headers.set("Cache-Control", "public, max-age=172800, stale-while-revalidate=604800"); // 48 hour cache, 7 day stale
  headers.set("Accept-Ranges", "bytes");
  // 48 hour cache in GMT
  headers.set("Expires", new Date(Date.now() + 172800 * 1000).toUTCString());

  return new Response(object.body, {
    headers,
  });
} 