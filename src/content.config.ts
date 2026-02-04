import { defineCollection } from "astro:content";
import type { BaseSchema, CollectionConfig } from "astro/content/config";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsSchema: BaseSchema = z.object({
	title: z.string(),
	published: z.date(),
	updated: z.date().optional(),
	draft: z.boolean().optional().default(false),
	description: z.string().optional().default(""),
	image: z.string().optional().default(""),
	tags: z.array(z.string()).optional().default([]),
	category: z.string().optional().nullable().default(""),
	lang: z.string().optional().default(""),
	pinned: z.boolean().optional().default(false),
	comment: z.boolean().optional().default(true),
	priority: z.number().optional(),
	author: z.string().optional().default(""),
	sourceLink: z.string().optional().default(""),
	licenseName: z.string().optional().default(""),
	licenseUrl: z.string().optional().default(""),

	/* Page encryption fields */
	encrypted: z.boolean().optional().default(false),
	password: z.string().optional().default(""),

	/* Posts alias */
	alias: z.string().optional(),

	/* Custom permalink - 自定义固定链接，优先级高于 alias */
	permalink: z.string().optional(),

	/* For internal use */
	prevTitle: z.string().default(""),
	prevSlug: z.string().default(""),
	nextTitle: z.string().default(""),
	nextSlug: z.string().default(""),
});

const postsCollection: CollectionConfig<typeof postsSchema> = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
	schema: postsSchema,
});

const specSchema: BaseSchema = z.object({});
const specCollection: CollectionConfig<typeof specSchema> = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/spec" }),
	schema: specSchema,
});
export const collections: {
	posts: typeof postsCollection;
	spec: typeof specCollection;
} = {
	posts: postsCollection,
	spec: specCollection,
};
