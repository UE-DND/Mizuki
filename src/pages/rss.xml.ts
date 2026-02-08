import type { RSSFeedItem } from "@astrojs/rss";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";

import { siteConfig } from "@/config";
import { renderMarkdown } from "@/server/markdown/render";
import { getSortedPosts } from "@/utils/content-utils";
import { getPostUrl } from "@/utils/url-utils";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
	if (!context.site) {
		throw new Error("site not set");
	}

	const posts = (await getSortedPosts()).filter(
		(post) => !post.data.encrypted,
	);
	const feed: RSSFeedItem[] = await Promise.all(
		posts.map(async (post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.published,
			link: getPostUrl(post),
			content: await renderMarkdown(String(post.body || ""), {
				target: "feed",
				site: context.site as URL,
			}),
		})),
	);

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site,
		items: feed,
		customData: `<language>${siteConfig.lang}</language>`,
	});
}
