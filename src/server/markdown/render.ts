import { parse as htmlParser } from "node-html-parser";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { rehypePlugins, remarkPlugins } from "./pipeline";
import { sanitizeMarkdownHtml } from "./sanitize";

const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkPlugins)
	.use(remarkRehype, {
		allowDangerousHtml: true,
	})
	.use(rehypeRaw)
	.use(rehypePlugins)
	.use(rehypeStringify, {
		allowDangerousHtml: true,
	});

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

export async function renderMarkdownHtml(markdown: string): Promise<string> {
	const source = String(markdown || "");
	if (!source.trim()) {
		return "";
	}

	const rendered = await markdownProcessor.process(source);
	return sanitizeMarkdownHtml(String(rendered.value || ""));
}

export async function renderMarkdownForFeed(
	markdown: string,
	site: URL,
): Promise<string> {
	const html = await renderMarkdownHtml(markdown);
	if (!html) {
		return "";
	}

	const root = htmlParser.parse(html);
	for (const image of root.querySelectorAll("img")) {
		const src = image.getAttribute("src");
		if (!src) {
			continue;
		}
		image.setAttribute("src", toAbsoluteSrc(src, site));
	}

	return sanitizeMarkdownHtml(root.toString());
}
