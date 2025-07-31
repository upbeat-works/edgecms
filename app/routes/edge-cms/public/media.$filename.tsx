import type { Route } from "./+types/media.$filename";
import { env } from 'cloudflare:workers';

export async function loader({ params }: Route.LoaderArgs) {
  const { filename } = params;
  
  // Get the R2 object
    const object = await env.MEDIA_BUCKET.get(filename);
  
  if (!object) {
    throw new Response("Not Found", { status: 404 });
  }
  
  // Stream the object directly from R2
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800", // 24 hour cache, 7 day stale
      "Content-Length": object.size.toString(),
    },
  });
} 