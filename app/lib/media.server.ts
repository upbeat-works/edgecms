export function sanitizeFilename(filename: string): string {
  // Get file extension
  const lastDotIndex = filename.lastIndexOf('.');
  const extension = lastDotIndex > -1 ? filename.slice(lastDotIndex) : '';
  const nameWithoutExt = lastDotIndex > -1 ? filename.slice(0, lastDotIndex) : filename;
  
  // Convert to kebab-case and preserve extension
  const kebabName = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return kebabName + extension;
}

export async function uploadMedia(
  env: Env,
  file: File,
  section?: string
): Promise<{ filename: string; url: string }> {
  const sanitizedFilename = sanitizeFilename(file.name);
  
  // Upload to R2
  await env.MEDIA_BUCKET.put(sanitizedFilename, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  });
  
  // Store metadata in D1
  const { createMedia } = await import("~/lib/db.server");
  await createMedia(sanitizedFilename, file.type, file.size, section);
  
  // Return the filename for reference
  return {
    filename: sanitizedFilename,
    url: `/edge-cms/public/media/${sanitizedFilename}`,
  };
}

export async function getMediaUrl(env: Env, filename: string): Promise<string> {
  // In a real deployment, you might want to return a signed URL or public URL
  // For now, we'll construct the public URL pattern
  const bucketName = env.R2_BUCKET_NAME;
  
  // This assumes you have configured R2 bucket with public access
  // You might need to adjust this based on your R2 configuration
  return `https://${bucketName}.r2.dev/${filename}`;
} 