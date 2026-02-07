import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import { parse as htmlParser } from "node-html-parser";
import sanitizeHtml from "sanitize-html";

import { profileConfig, siteConfig } from "@/config";
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
	for (const image of html.querySelectorAll("img")) {
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

function escapeXml(raw: string): string {
	return raw
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export async function GET(context: APIContext): Promise<Response> {
	if (!context.site) {
		throw new Error("site not set");
	}

	const posts = (await getSortedPosts()).filter(
		(post) => !post.data.encrypted,
	);

	let atomFeed = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>${escapeXml(siteConfig.title)}</title>\n  <subtitle>${escapeXml(siteConfig.subtitle || "No description")}</subtitle>\n  <link href="${context.site}" rel="alternate" type="text/html"/>\n  <link href="${new URL("atom.xml", context.site)}" rel="self" type="application/atom+xml"/>\n  <id>${context.site}</id>\n  <updated>${new Date().toISOString()}</updated>\n  <language>${siteConfig.lang}</language>`;

	for (const post of posts) {
		const postUrl = new URL(getPostUrl(post), context.site).href;
		const content = renderPostHtml(
			String(post.body || ""),
			context.site as URL,
		);
		atomFeed += `\n  <entry>\n    <title>${escapeXml(post.data.title)}</title>\n    <link href="${postUrl}" rel="alternate" type="text/html"/>\n    <id>${postUrl}</id>\n    <published>${post.data.published.toISOString()}</published>\n    <updated>${(post.data.updated || post.data.published).toISOString()}</updated>\n    <summary>${escapeXml(post.data.description || "")}</summary>\n    <content type="html"><![CDATA[${content}]]></content>\n    <author>\n      <name>${escapeXml(profileConfig.name)}</name>\n    </author>`;

		if (post.data.category) {
			atomFeed += `\n    <category term="${escapeXml(post.data.category)}"></category>`;
		}

		atomFeed += "\n  </entry>";
	}

	atomFeed += "\n</feed>";

	return new Response(atomFeed, {
		headers: {
			"Content-Type": "application/atom+xml; charset=utf-8",
		},
	});
}
