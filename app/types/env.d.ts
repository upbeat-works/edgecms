/// <reference types="@cloudflare/workers-types" />

declare global {
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    MEDIA_BUCKET: R2Bucket;
    R2_BUCKET_NAME: string;
    AUTH_SECRET: string;
    BASE_URL?: string;
    VALUE_FROM_CLOUDFLARE: string;
  }
}

export {}; 