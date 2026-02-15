import { createHash } from "node:crypto";

import { parse as htmlParser } from "node-html-parser";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import rehypeExpressiveCode, {
	type RehypeExpressiveCodeOptions,
} from "rehype-expressive-code";
import rehypeParse from "rehype-parse";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { cacheManager } from "@/server/cache/manager";

import { pluginCustomCopyButton } from "../../plugins/expressive-code/custom-copy-button";
import { pluginLanguageBadge } from "../../plugins/expressive-code/language-badge";
import { rehypePlugins, remarkPlugins } from "./pipeline";
import { sanitizeMarkdownHtml } from "./sanitize";

export type MarkdownRenderTarget = "page" | "feed" | "encrypted";

export type RenderMarkdownOptions = {
	target?: MarkdownRenderTarget;
	site?: URL;
};

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

const expressiveCodeOptions: RehypeExpressiveCodeOptions = {
	themes: ["github-light", "github-dark"],
	plugins: [
		pluginCollapsibleSections(),
		pluginLineNumbers(),
		pluginLanguageBadge(),
		pluginCustomCopyButton(),
	],
	defaultProps: {
		wrap: true,
		overridesByLang: {
			shellsession: { showLineNumbers: false },
			bash: { frame: "code" },
			shell: { frame: "code" },
			sh: { frame: "code" },
			zsh: { frame: "code" },
		},
	},
	styleOverrides: {
		codeBackground: "var(--codeblock-bg)",
		borderRadius: "0.75rem",
		borderColor: "none",
		codeFontSize: "0.875rem",
		codeFontFamily:
			"'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
		codeLineHeight: "1.5rem",
		frames: {
			editorBackground: "var(--codeblock-bg)",
			terminalBackground: "var(--codeblock-bg)",
			terminalTitlebarBackground: "var(--codeblock-bg)",
			editorTabBarBackground: "var(--codeblock-bg)",
			editorActiveTabBackground: "none",
			editorActiveTabIndicatorBottomColor: "var(--primary)",
			editorActiveTabIndicatorTopColor: "none",
			editorTabBarBorderBottomColor: "var(--codeblock-bg)",
			terminalTitlebarBorderBottomColor: "none",
		},
		textMarkers: {
			delHue: "0",
			insHue: "180",
			markHue: "250",
		},
	},
	frames: {
		showCopyToClipboardButton: false,
	},
};

const expressiveCodeProcessor = unified()
	.use(rehypeParse, { fragment: true })
	.use(rehypeExpressiveCode, expressiveCodeOptions)
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

function normalizeFeedHtml(html: string, site?: URL): string {
	if (!html) {
		return "";
	}
	const root = htmlParser.parse(html);
	if (site) {
		for (const image of root.querySelectorAll("img")) {
			const src = image.getAttribute("src");
			if (!src) {
				continue;
			}
			image.setAttribute("src", toAbsoluteSrc(src, site));
		}
	}
	return sanitizeMarkdownHtml(root.toString());
}

export async function renderMarkdown(
	markdown: string,
	options: RenderMarkdownOptions = {},
): Promise<string> {
	const { target = "page", site } = options;
	const source = String(markdown || "");
	if (!source.trim()) {
		return "";
	}

	// 构建缓存键：target + content hash（feed 模式额外拼入 site.href）
	const hashInput = target === "feed" && site ? source + site.href : source;
	const hash = createHash("sha256").update(hashInput).digest("hex");
	const cacheKey = `${target}:${hash}`;

	const cached = await cacheManager.get<string>("markdown", cacheKey);
	if (cached !== null) return cached;

	const rendered = await markdownProcessor.process(source);
	const sanitizedHtml = sanitizeMarkdownHtml(String(rendered.value || ""));
	if (!sanitizedHtml) {
		return "";
	}

	if (target === "feed") {
		// Feed 仅保留纯净 HTML 代码块，不注入 Expressive Code UI 包装。
		const result = normalizeFeedHtml(sanitizedHtml, site);
		void cacheManager.set("markdown", cacheKey, result);
		return result;
	}

	if (!sanitizedHtml.includes("<pre><code")) {
		void cacheManager.set("markdown", cacheKey, sanitizedHtml);
		return sanitizedHtml;
	}

	try {
		const highlighted =
			await expressiveCodeProcessor.process(sanitizedHtml);
		const result = String(highlighted.value || "");
		void cacheManager.set("markdown", cacheKey, result);
		return result;
	} catch (error) {
		console.error("[markdown] expressive code render failed:", error);
		return sanitizedHtml;
	}
}

export async function renderMarkdownHtml(markdown: string): Promise<string> {
	return renderMarkdown(markdown, { target: "page" });
}

export async function renderMarkdownForFeed(
	markdown: string,
	site: URL,
): Promise<string> {
	return renderMarkdown(markdown, { target: "feed", site });
}
