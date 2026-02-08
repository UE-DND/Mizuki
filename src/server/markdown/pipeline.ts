import type { RootContent } from "mdast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkGithubAdmonitionsToDirectives from "remark-github-admonitions-to-directives";
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import type { Pluggable, PluggableList } from "unified";

import { AdmonitionComponent } from "../../plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "../../plugins/rehype-component-github-card.mjs";
import { rehypeImageWidth } from "../../plugins/rehype-image-width.mjs";
import { rehypeMermaid } from "../../plugins/rehype-mermaid.mjs";
import { rehypeWrapTable } from "../../plugins/rehype-wrap-table.mjs";
import { parseDirectiveNode } from "../../plugins/remark-directive-rehype.js";
import { remarkContent } from "../../plugins/remark-content.mjs";
import { remarkMermaid } from "../../plugins/remark-mermaid.js";

type AdmonitionProps = {
	title?: string;
	"has-directive-label"?: boolean;
};

const remarkPluginsBase: PluggableList = [
	remarkMath,
	remarkGfm,
	remarkContent,
	remarkGithubAdmonitionsToDirectives,
	remarkDirective,
	remarkSectionize,
	parseDirectiveNode,
	remarkMermaid,
];

const rehypeComponentsPlugin: Pluggable = [
	rehypeComponents,
	{
		components: {
			github: GithubCardComponent,
			note: (x: AdmonitionProps, y: RootContent[]) =>
				AdmonitionComponent(x, y, "note"),
			tip: (x: AdmonitionProps, y: RootContent[]) =>
				AdmonitionComponent(x, y, "tip"),
			important: (x: AdmonitionProps, y: RootContent[]) =>
				AdmonitionComponent(x, y, "important"),
			caution: (x: AdmonitionProps, y: RootContent[]) =>
				AdmonitionComponent(x, y, "caution"),
			warning: (x: AdmonitionProps, y: RootContent[]) =>
				AdmonitionComponent(x, y, "warning"),
		},
	},
] as unknown as Pluggable;

const rehypeAutolinkPlugin: Pluggable = [
	rehypeAutolinkHeadings,
	{
		behavior: "append",
		properties: {
			className: ["anchor"],
			"data-no-swup": "",
		},
		content: {
			type: "element",
			tagName: "span",
			properties: {
				className: ["anchor-icon"],
				"data-pagefind-ignore": true,
			},
			children: [{ type: "text", value: "#" }],
		},
	},
] as unknown as Pluggable;

export const remarkPlugins: PluggableList = remarkPluginsBase;

export const rehypePlugins: PluggableList = [
	rehypeKatex,
	rehypeSlug,
	rehypeWrapTable,
	rehypeMermaid,
	rehypeImageWidth,
	rehypeComponentsPlugin,
	rehypeAutolinkPlugin,
];
