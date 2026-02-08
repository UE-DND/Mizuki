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

import { pluginCustomCopyButton } from "../../plugins/expressive-code/custom-copy-button";
import { pluginLanguageBadge } from "../../plugins/expressive-code/language-badge";
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

export async function renderMarkdownHtml(markdown: string): Promise<string> {
	const source = String(markdown || "");
	if (!source.trim()) {
		return "";
	}

	const rendered = await markdownProcessor.process(source);
	const sanitizedHtml = sanitizeMarkdownHtml(String(rendered.value || ""));

	if (!sanitizedHtml.includes("<pre><code")) {
		return sanitizedHtml;
	}

	try {
		const highlighted =
			await expressiveCodeProcessor.process(sanitizedHtml);
		return String(highlighted.value || "");
	} catch (error) {
		console.error("[markdown] expressive code render failed:", error);
		return sanitizedHtml;
	}
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
