/// <reference types="astro/client" />
import "../.astro/types.d.ts";

interface ImportMetaEnv {
	readonly UMAMI_API_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
