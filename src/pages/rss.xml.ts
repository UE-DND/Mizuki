import type { RSSFeedItem } from "@astrojs/rss";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import { parse as htmlParser } from "node-html-parser";
import sanitizeHtml from "sanitize-html";

import { siteConfig } from "@/config";
import { getSortedPosts } from "@/utils/content-utils";
import { getPostUrl } from "@/utils/url-utils";

const markdownParser = new MarkdownIt();

export const prerender = false;

function toAbsoluteSrc(src: string, site: URL): string {
	if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("data:")) {
		return src;
	}
	if (src.startsWith("/")) {
		return new URL(src, site).href;
	}
	const normalized = src.replace(/^\.\/+/, "").replace(/^\.\.\/+/, "");
	return new URL(`/${normalized}`, site).href;
}

function renderPostHtml(markdown: string, site: URL): string {
	const body = markdownParser.render(markdown);
	const html = htmlParser.parse(body);
	const images = html.querySelectorAll("img");
	for (const image of images) {
		const src = image.getAttribute("src");
		if (!src) {
			continue;
		}
		image.setAttribute("src", toAbsoluteSrc(src, site));
	}

	return sanitizeHtml(html.toString(), {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
	});
}

export async function GET(context: APIContext): Promise<Response> {
	if (!context.site) {
		throw new Error("site not set");
	}

	const posts = (await getSortedPosts()).filter(
		(post) => !post.data.encrypted,
	);
	const feed: RSSFeedItem[] = posts.map((post) => ({
		title: post.data.title,
		description: post.data.description,
		pubDate: post.data.published,
		link: getPostUrl(post),
		content: renderPostHtml(String(post.body || ""), context.site as URL),
	}));

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site,
		items: feed,
		customData: `<language>${siteConfig.lang}</language>`,
	});
}
