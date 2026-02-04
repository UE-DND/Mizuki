/// <reference types="astro/client" />
import "../.astro/types.d.ts";

interface ImportMetaEnv {
	readonly UMAMI_API_KEY?: string;
	readonly DIRECTUS_URL?: string;
	readonly DIRECTUS_STATIC_TOKEN?: string;
	readonly DIRECTUS_EXPORT_INCLUDE_DRAFTS?: string;
	readonly DIRECTUS_EXPORT_CLEAN?: string;
	readonly DIRECTUS_POSTS_COLLECTION?: string;
	readonly DIRECTUS_SPEC_COLLECTION?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
