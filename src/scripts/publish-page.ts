import {
	emitAuthState,
	getAuthState,
	subscribeAuthState,
	type AuthState,
} from "@/scripts/auth-state";
import { setupCodeCopyDelegation } from "@/scripts/code-copy";
import { showAuthRequiredDialog } from "@/scripts/dialogs";
import { refreshGithubCards } from "@/scripts/github-card-runtime";

type ContentType = "article" | "diary";
type EditorMode = "edit" | "preview";
type PublishStatus = "draft" | "published";

type ApiResult = {
	response: Response;
	data: Record<string, unknown> | null;
};

type PublishListItem = {
	id: string;
	title: string;
	summary: string;
	status: string;
	updatedAt: string;
};

type PublishRuntimeWindow = Window &
	typeof globalThis & {
		renderMermaidDiagrams?: () => Promise<void>;
	};

type ToolbarAction =
	| "bold"
	| "italic"
	| "underline"
	| "strike"
	| "quote"
	| "inline-code"
	| "code-block";

const TOOLBAR_ACTIONS = new Set<ToolbarAction>([
	"bold",
	"italic",
	"underline",
	"strike",
	"quote",
	"inline-code",
	"code-block",
]);

function normalizeApiUrl(input: string): string {
	const [pathname, search = ""] = String(input || "").split("?");
	const normalizedPath = pathname.endsWith("/")
		? pathname.slice(0, -1)
		: pathname;
	return search ? `${normalizedPath}?${search}` : normalizedPath;
}

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toStringValue(value: unknown): string {
	if (typeof value === "string") {
		return value.trim();
	}
	return "";
}

function toNullableString(value: unknown): string | null {
	const normalized = toStringValue(value);
	return normalized ? normalized : null;
}

function toBooleanValue(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	return fallback;
}

function toStringArrayValue(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => toStringValue(entry))
			.filter((entry) => Boolean(entry));
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

function csvToArray(raw: string): string[] {
	return raw
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function arrayToCsv(values: string[]): string {
	return values.join(", ");
}

function formatDateTime(iso: string): string {
	if (!iso) {
		return "";
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleString();
}

function isoToLocalDatetime(iso: string | null): string {
	const value = String(iso || "").trim();
	if (!value) {
		return "";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	const pad = (num: number): string => String(num).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDatetimeToIso(localValue: string): string | null {
	const trimmed = String(localValue || "").trim();
	if (!trimmed) {
		return null;
	}
	const date = new Date(trimmed);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date.toISOString();
}

function statusLabel(status: string): string {
	if (status === "published") {
		return "已发布";
	}
	if (status === "archived") {
		return "已归档";
	}
	return "草稿";
}

function parseArticleListItem(raw: Record<string, unknown>): PublishListItem {
	return {
		id: toStringValue(raw.id),
		title: toStringValue(raw.title) || "未命名文章",
		summary: toStringValue(raw.summary),
		status: toStringValue(raw.status) || "draft",
		updatedAt:
			toStringValue(raw.date_updated) || toStringValue(raw.date_created),
	};
}

function parseDiaryListItem(raw: Record<string, unknown>): PublishListItem {
	const source = toStringValue(raw.content);
	const title = source.replace(/\s+/g, " ").trim().slice(0, 28);
	return {
		id: toStringValue(raw.id),
		title: title || "未命名日记",
		summary: source.slice(0, 60),
		status: toStringValue(raw.status) || "draft",
		updatedAt:
			toStringValue(raw.date_updated) || toStringValue(raw.date_created),
	};
}

function getApiMessage(
	data: Record<string, unknown> | null,
	fallback: string,
): string {
	const message = toStringValue(data?.message);
	return message || fallback;
}

function hasHtmlTag(value: string): boolean {
	return /<[a-z][\w:-]*(\s[^>]*)?>/i.test(value);
}

function decodeHtmlEntities(value: string): string {
	const textarea = document.createElement("textarea");
	textarea.innerHTML = value;
	return String(textarea.value || "");
}

function normalizeMarkdownHtml(raw: unknown): string {
	const source = String(raw || "").trim();
	if (!source) {
		return "";
	}
	if (hasHtmlTag(source)) {
		return source;
	}
	if (source.includes("&lt;") || source.includes("&#")) {
		const decoded = decodeHtmlEntities(source).trim();
		if (hasHtmlTag(decoded)) {
			return decoded;
		}
	}
	return source;
}

async function api(url: string, init: RequestInit = {}): Promise<ApiResult> {
	const isFormData =
		typeof FormData !== "undefined" &&
		Boolean(init.body) &&
		init.body instanceof FormData;

	const response = await fetch(normalizeApiUrl(url), {
		credentials: "include",
		headers: {
			Accept: "application/json",
			...(init.body && !isFormData
				? { "Content-Type": "application/json" }
				: {}),
			...((init.headers as Record<string, string>) || {}),
		},
		...init,
	});
	const data: Record<string, unknown> | null = await response
		.json()
		.catch(() => null);
	return { response, data };
}

function extractUploadFileId(data: Record<string, unknown> | null): string {
	const file = toRecord(data?.file);
	const idFromFile = toStringValue(file?.id);
	if (idFromFile) {
		return idFromFile;
	}
	return toStringValue(data?.id);
}

function buildDirectusAssetPreview(fileId: string): string {
	const normalized = String(fileId || "").trim();
	if (!normalized) {
		return "";
	}
	return `/api/v1/public/assets/${encodeURIComponent(normalized)}?width=960&height=540&fit=cover`;
}

function isToolbarAction(value: string): value is ToolbarAction {
	return TOOLBAR_ACTIONS.has(value as ToolbarAction);
}

async function refreshMarkdownRuntime(
	runtimeWindow: PublishRuntimeWindow,
): Promise<void> {
	setupCodeCopyDelegation();
	try {
		await refreshGithubCards();
	} catch (error) {
		console.warn("[publish] refresh github cards failed:", error);
	}
	if (typeof runtimeWindow.renderMermaidDiagrams === "function") {
		try {
			await runtimeWindow.renderMermaidDiagrams();
		} catch (error) {
			console.warn("[publish] refresh mermaid failed:", error);
		}
	}
}

export function initPublishPage(): void {
	const path = window.location.pathname.replace(/\/+$/, "") || "/";
	if (path !== "/publish") {
		return;
	}

	const root = document.getElementById("publish-root");
	if (!root || root.dataset.publishBound === "1") {
		return;
	}
	root.dataset.publishBound = "1";

	const runtimeWindow = window as PublishRuntimeWindow;

	const workspaceEl = document.getElementById("publish-workspace");
	const typeArticleBtn = document.getElementById(
		"publish-type-article",
	) as HTMLButtonElement | null;
	const typeDiaryBtn = document.getElementById(
		"publish-type-diary",
	) as HTMLButtonElement | null;
	const createNewBtn = document.getElementById(
		"publish-create-new",
	) as HTMLButtonElement | null;
	const currentHintEl = document.getElementById("publish-current-hint");
	const listTitleEl = document.getElementById("publish-list-title");
	const itemListEl = document.getElementById("publish-item-list");
	const itemEmptyEl = document.getElementById("publish-item-empty");
	const editorTitleEl = document.getElementById("publish-editor-title");
	const modeEditBtn = document.getElementById(
		"publish-mode-edit",
	) as HTMLButtonElement | null;
	const modePreviewBtn = document.getElementById(
		"publish-mode-preview",
	) as HTMLButtonElement | null;
	const editorPanelEl = document.getElementById("publish-editor-panel");
	const previewPanelEl = document.getElementById("publish-preview-panel");
	const previewLoadingEl = document.getElementById("publish-preview-loading");
	const previewErrorEl = document.getElementById("publish-preview-error");
	const previewEmptyEl = document.getElementById("publish-preview-empty");
	const previewContentEl = document.getElementById("publish-preview-content");
	const toolbarEl = document.getElementById("publish-toolbar");
	const articleFormEl = document.getElementById("publish-form-article");
	const diaryFormEl = document.getElementById("publish-form-diary");
	const submitMsgEl = document.getElementById("publish-submit-msg");
	const submitErrorEl = document.getElementById("publish-submit-error");
	const saveDraftBtn = document.getElementById(
		"publish-save-draft",
	) as HTMLButtonElement | null;
	const savePublishedBtn = document.getElementById(
		"publish-save-published",
	) as HTMLButtonElement | null;
	const coverFileInputEl = document.getElementById(
		"publish-cover-file-input",
	) as HTMLInputElement | null;
	const coverUploadBtn = document.getElementById(
		"publish-article-cover-upload",
	) as HTMLButtonElement | null;
	const coverClearBtn = document.getElementById(
		"publish-article-cover-clear",
	) as HTMLButtonElement | null;
	const coverUploadMsgEl = document.getElementById(
		"publish-cover-upload-msg",
	);

	const articleTitleInput = document.getElementById(
		"publish-article-title",
	) as HTMLInputElement | null;
	const articleSummaryInput = document.getElementById(
		"publish-article-summary",
	) as HTMLTextAreaElement | null;
	const articleBodyInput = document.getElementById(
		"publish-article-body",
	) as HTMLTextAreaElement | null;
	const articleCoverFileInput = document.getElementById(
		"publish-article-cover-file",
	) as HTMLInputElement | null;
	const articleCoverUrlInput = document.getElementById(
		"publish-article-cover-url",
	) as HTMLInputElement | null;
	const articleTagsInput = document.getElementById(
		"publish-article-tags",
	) as HTMLInputElement | null;
	const articleCategoryInput = document.getElementById(
		"publish-article-category",
	) as HTMLInputElement | null;
	const articleAllowCommentsInput = document.getElementById(
		"publish-article-allow-comments",
	) as HTMLInputElement | null;
	const articleIsPublicInput = document.getElementById(
		"publish-article-is-public",
	) as HTMLInputElement | null;
	const articleShowOnProfileInput = document.getElementById(
		"publish-article-show-on-profile",
	) as HTMLInputElement | null;
	const articlePublishedAtInput = document.getElementById(
		"publish-article-published-at",
	) as HTMLInputElement | null;
	const articleCoverPreviewWrapEl = document.getElementById(
		"publish-article-cover-preview-wrap",
	);
	const articleCoverPreviewEl = document.getElementById(
		"publish-article-cover-preview",
	) as HTMLImageElement | null;

	const diaryContentInput = document.getElementById(
		"publish-diary-content",
	) as HTMLTextAreaElement | null;
	const diaryMoodInput = document.getElementById(
		"publish-diary-mood",
	) as HTMLInputElement | null;
	const diaryLocationInput = document.getElementById(
		"publish-diary-location",
	) as HTMLInputElement | null;
	const diaryHappenedAtInput = document.getElementById(
		"publish-diary-happened-at",
	) as HTMLInputElement | null;
	const diaryAllowCommentsInput = document.getElementById(
		"publish-diary-allow-comments",
	) as HTMLInputElement | null;
	const diaryIsPublicInput = document.getElementById(
		"publish-diary-is-public",
	) as HTMLInputElement | null;
	const diaryShowOnProfileInput = document.getElementById(
		"publish-diary-show-on-profile",
	) as HTMLInputElement | null;
	const articleBodyLabelEl = document.getElementById(
		"publish-markdown-label-article",
	);
	const diaryContentLabelEl = document.getElementById(
		"publish-markdown-label-diary",
	);
	const articleBodyFieldEl = document.getElementById(
		"publish-article-body-field",
	);
	const diaryContentFieldEl = document.getElementById(
		"publish-diary-content-field",
	);

	if (
		!workspaceEl ||
		!typeArticleBtn ||
		!typeDiaryBtn ||
		!createNewBtn ||
		!listTitleEl ||
		!itemListEl ||
		!itemEmptyEl ||
		!editorTitleEl ||
		!modeEditBtn ||
		!modePreviewBtn ||
		!editorPanelEl ||
		!previewPanelEl ||
		!toolbarEl ||
		!articleFormEl ||
		!diaryFormEl ||
		!submitMsgEl ||
		!submitErrorEl ||
		!saveDraftBtn ||
		!savePublishedBtn ||
		!articleTitleInput ||
		!articleSummaryInput ||
		!articleBodyInput ||
		!articleCoverFileInput ||
		!articleCoverUrlInput ||
		!articleTagsInput ||
		!articleCategoryInput ||
		!articleAllowCommentsInput ||
		!articleIsPublicInput ||
		!articleShowOnProfileInput ||
		!articlePublishedAtInput ||
		!diaryContentInput ||
		!diaryMoodInput ||
		!diaryLocationInput ||
		!diaryHappenedAtInput ||
		!diaryAllowCommentsInput ||
		!diaryIsPublicInput ||
		!diaryShowOnProfileInput ||
		!articleBodyLabelEl ||
		!diaryContentLabelEl ||
		!articleBodyFieldEl ||
		!diaryContentFieldEl
	) {
		console.warn("[publish] required dom nodes missing");
		return;
	}

	const query = new URLSearchParams(window.location.search);
	const initialTypeFromQuery: ContentType =
		query.get("type") === "diary" ? "diary" : "article";
	const initialIdFromQuery = toStringValue(query.get("id"));

	let currentType: ContentType = initialTypeFromQuery;
	let currentEditorMode: EditorMode = "edit";
	let currentItemId = "";
	let currentUsername = "";
	let isLoggedIn = false;
	let listItems: PublishListItem[] = [];
	let previewLoading = false;
	let previewError = "";
	let previewHtml = "";
	let previewSource = "";
	let previewDirty = false;
	let renderedPreviewHtml = "";
	let previewRequestId = 0;
	let previewDebounceTimer: number | null = null;
	let initializedAfterLogin = false;

	const setSubmitError = (message: string): void => {
		if (!message) {
			submitErrorEl.textContent = "";
			submitErrorEl.classList.add("hidden");
			return;
		}
		submitErrorEl.textContent = message;
		submitErrorEl.classList.remove("hidden");
	};

	const setSubmitMessage = (message: string): void => {
		submitMsgEl.textContent = message;
	};

	const setCoverUploadMessage = (message: string): void => {
		if (!coverUploadMsgEl) {
			return;
		}
		coverUploadMsgEl.textContent = message;
	};

	const getActiveTextarea = (): HTMLTextAreaElement => {
		return currentType === "article" ? articleBodyInput : diaryContentInput;
	};

	const updateTypeButtonStyle = (
		button: HTMLButtonElement,
		active: boolean,
	): void => {
		button.setAttribute("aria-pressed", active ? "true" : "false");
		button.classList.toggle("text-90", active);
		button.classList.toggle("text-60", !active);
		button.classList.toggle("bg-[var(--btn-plain-bg-hover)]", active);
		button.classList.toggle("border-[var(--primary)]", active);
	};

	const updateModeButtonStyle = (
		button: HTMLButtonElement,
		active: boolean,
	): void => {
		button.setAttribute("aria-pressed", active ? "true" : "false");
		button.classList.toggle("text-90", active);
		button.classList.toggle("text-60", !active);
		button.classList.toggle("bg-[var(--btn-plain-bg-hover)]", active);
		button.classList.toggle("border-[var(--primary)]", active);
	};

	const updateEditorHeader = (): void => {
		const typeText = currentType === "article" ? "文章" : "日记";
		if (currentItemId) {
			editorTitleEl.textContent = `编辑${typeText}`;
			if (currentHintEl) {
				currentHintEl.textContent = `正在编辑已有${typeText}，支持保存草稿或直接发布。`;
			}
			return;
		}
		editorTitleEl.textContent = `新建${typeText}`;
		if (currentHintEl) {
			currentHintEl.textContent = `正在创建新的${typeText}草稿。`;
		}
	};

	const renderPreview = (): void => {
		if (
			!previewLoadingEl ||
			!previewErrorEl ||
			!previewEmptyEl ||
			!previewContentEl
		) {
			return;
		}
		previewLoadingEl.classList.toggle("hidden", !previewLoading);
		if (previewError) {
			previewErrorEl.textContent = previewError;
			previewErrorEl.classList.remove("hidden");
		} else {
			previewErrorEl.textContent = "";
			previewErrorEl.classList.add("hidden");
		}
		if (previewHtml) {
			if (renderedPreviewHtml !== previewHtml) {
				previewContentEl.innerHTML = previewHtml;
				renderedPreviewHtml = previewHtml;
				void refreshMarkdownRuntime(runtimeWindow);
			}
			previewContentEl.classList.remove("hidden");
			previewEmptyEl.classList.add("hidden");
			return;
		}
		previewContentEl.innerHTML = "";
		renderedPreviewHtml = "";
		previewContentEl.classList.add("hidden");
		previewEmptyEl.classList.remove("hidden");
	};

	const resetPreviewState = (): void => {
		previewSource = "";
		previewHtml = "";
		previewError = "";
		previewLoading = false;
		previewDirty = false;
		previewRequestId += 1;
		if (previewDebounceTimer !== null) {
			window.clearTimeout(previewDebounceTimer);
			previewDebounceTimer = null;
		}
		renderPreview();
	};

	const setEditorMode = (mode: EditorMode): void => {
		currentEditorMode = mode;
		editorPanelEl.classList.toggle("hidden", mode !== "edit");
		previewPanelEl.classList.toggle("hidden", mode !== "preview");
		updateModeButtonStyle(modeEditBtn, mode === "edit");
		updateModeButtonStyle(modePreviewBtn, mode === "preview");
		if (mode === "preview") {
			void requestPreview(true);
		}
	};

	const schedulePreview = (): void => {
		if (currentEditorMode !== "preview") {
			return;
		}
		if (previewDebounceTimer !== null) {
			window.clearTimeout(previewDebounceTimer);
		}
		previewDebounceTimer = window.setTimeout(() => {
			void requestPreview();
		}, 220);
	};

	const markPreviewDirty = (): void => {
		previewDirty = true;
		schedulePreview();
	};

	const requestPreview = async (force = false): Promise<void> => {
		const textarea = getActiveTextarea();
		const source = String(textarea.value || "");
		const trimmed = source.trim();
		if (!force && !previewDirty && source === previewSource) {
			return;
		}
		if (!trimmed) {
			previewSource = source;
			previewHtml = "";
			previewError = "";
			previewLoading = false;
			previewDirty = false;
			renderPreview();
			return;
		}
		if (!isLoggedIn) {
			previewSource = source;
			previewHtml = "";
			previewError = "请先登录后预览内容。";
			previewLoading = false;
			previewDirty = false;
			renderPreview();
			return;
		}

		const requestId = ++previewRequestId;
		previewLoading = true;
		previewError = "";
		renderPreview();

		const endpoint =
			currentType === "article"
				? "/api/v1/me/articles/preview"
				: "/api/v1/me/diaries/preview";
		const payload =
			currentType === "article"
				? { body_markdown: trimmed }
				: { content: trimmed };

		try {
			const { response, data } = await api(endpoint, {
				method: "POST",
				body: JSON.stringify(payload),
			});
			if (requestId !== previewRequestId) {
				return;
			}
			if (response.status === 401) {
				emitAuthState({
					isLoggedIn: false,
					isAdmin: false,
					userId: "",
					username: "",
				});
				previewHtml = "";
				previewError = "请先登录后预览内容。";
				previewDirty = true;
				return;
			}
			if (!response.ok || !data?.ok) {
				previewHtml = "";
				previewError = getApiMessage(data, "预览生成失败");
				previewDirty = true;
				return;
			}
			previewSource = source;
			previewHtml = normalizeMarkdownHtml(data.body_html);
			previewError = "";
			previewDirty = false;
		} catch (error) {
			console.error("[publish] preview failed:", error);
			if (requestId !== previewRequestId) {
				return;
			}
			previewHtml = "";
			previewError = "预览生成失败，请稍后重试";
			previewDirty = true;
		} finally {
			if (requestId === previewRequestId) {
				previewLoading = false;
				renderPreview();
			}
		}
	};

	const replaceSelection = (
		textarea: HTMLTextAreaElement,
		replacement: string,
		selectionStartOffset: number,
		selectionEndOffset: number,
	): void => {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const source = textarea.value;
		const before = source.slice(0, start);
		const after = source.slice(end);
		textarea.value = `${before}${replacement}${after}`;
		const nextStart = before.length + selectionStartOffset;
		const nextEnd = before.length + selectionEndOffset;
		textarea.focus();
		textarea.setSelectionRange(nextStart, nextEnd);
		markPreviewDirty();
	};

	const applyWrapAction = (
		textarea: HTMLTextAreaElement,
		prefix: string,
		suffix: string,
		placeholder: string,
	): void => {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = textarea.value.slice(start, end);
		const content = selected || placeholder;
		const replacement = `${prefix}${content}${suffix}`;
		replaceSelection(
			textarea,
			replacement,
			prefix.length,
			prefix.length + content.length,
		);
	};

	const applyQuoteAction = (textarea: HTMLTextAreaElement): void => {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = textarea.value.slice(start, end);
		const source = selected || "引用内容";
		const quoted = source
			.replaceAll("\r\n", "\n")
			.split("\n")
			.map((line) => (line.startsWith("> ") ? line : `> ${line}`))
			.join("\n");
		replaceSelection(textarea, quoted, 0, quoted.length);
	};

	const applyCodeBlockAction = (textarea: HTMLTextAreaElement): void => {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const source = textarea.value;
		const selected = source.slice(start, end) || "代码内容";
		const language = "text";
		const block = `\`\`\`${language}\n${selected}\n\`\`\``;
		const needsLeadingBreak = start > 0 && source[start - 1] !== "\n";
		const needsTrailingBreak = end < source.length && source[end] !== "\n";
		const prefix = needsLeadingBreak ? "\n" : "";
		const suffix = needsTrailingBreak ? "\n" : "";
		const replacement = `${prefix}${block}${suffix}`;
		const contentStart = prefix.length + `\`\`\`${language}\n`.length;
		const contentEnd = contentStart + selected.length;
		replaceSelection(textarea, replacement, contentStart, contentEnd);
	};

	const applyToolbarAction = (action: ToolbarAction): void => {
		const textarea = getActiveTextarea();
		if (action === "bold") {
			applyWrapAction(textarea, "**", "**", "粗体文本");
			return;
		}
		if (action === "italic") {
			applyWrapAction(textarea, "*", "*", "斜体文本");
			return;
		}
		if (action === "underline") {
			applyWrapAction(textarea, "<u>", "</u>", "下划线文本");
			return;
		}
		if (action === "strike") {
			applyWrapAction(textarea, "~~", "~~", "删除线文本");
			return;
		}
		if (action === "quote") {
			applyQuoteAction(textarea);
			return;
		}
		if (action === "inline-code") {
			applyWrapAction(textarea, "`", "`", "代码");
			return;
		}
		applyCodeBlockAction(textarea);
	};

	const updateCoverPreview = (): void => {
		if (!articleCoverPreviewWrapEl || !articleCoverPreviewEl) {
			return;
		}
		const fileId = toStringValue(articleCoverFileInput.value);
		const url = toStringValue(articleCoverUrlInput.value);
		const preview = fileId ? buildDirectusAssetPreview(fileId) : url;
		if (!preview) {
			articleCoverPreviewWrapEl.classList.add("hidden");
			articleCoverPreviewEl.src = "";
			return;
		}
		articleCoverPreviewEl.src = preview;
		articleCoverPreviewWrapEl.classList.remove("hidden");
	};

	const resetArticleForm = (): void => {
		articleTitleInput.value = "";
		articleSummaryInput.value = "";
		articleBodyInput.value = "";
		articleCoverFileInput.value = "";
		articleCoverUrlInput.value = "";
		articleTagsInput.value = "";
		articleCategoryInput.value = "";
		articleAllowCommentsInput.checked = true;
		articleIsPublicInput.checked = true;
		articleShowOnProfileInput.checked = true;
		articlePublishedAtInput.value = "";
		updateCoverPreview();
	};

	const resetDiaryForm = (): void => {
		diaryContentInput.value = "";
		diaryMoodInput.value = "";
		diaryLocationInput.value = "";
		diaryHappenedAtInput.value = "";
		diaryAllowCommentsInput.checked = true;
		diaryIsPublicInput.checked = true;
		diaryShowOnProfileInput.checked = true;
	};

	const resetCurrentForm = (): void => {
		if (currentType === "article") {
			resetArticleForm();
		} else {
			resetDiaryForm();
		}
		currentItemId = "";
		updateEditorHeader();
		updateUrlState();
		renderList();
		setEditorMode("edit");
		resetPreviewState();
		setSubmitError("");
		setSubmitMessage("");
		setCoverUploadMessage("");
	};

	const fillArticleForm = (item: Record<string, unknown>): void => {
		articleTitleInput.value = toStringValue(item.title);
		articleSummaryInput.value = toStringValue(item.summary);
		articleBodyInput.value = toStringValue(item.body_markdown);
		articleCoverFileInput.value = toStringValue(item.cover_file);
		articleCoverUrlInput.value = toStringValue(item.cover_url);
		articleTagsInput.value = arrayToCsv(toStringArrayValue(item.tags));
		articleCategoryInput.value = toStringValue(item.category);
		articleAllowCommentsInput.checked = toBooleanValue(
			item.allow_comments,
			true,
		);
		articleIsPublicInput.checked = toBooleanValue(item.is_public, true);
		articleShowOnProfileInput.checked = toBooleanValue(
			item.show_on_profile,
			true,
		);
		articlePublishedAtInput.value = isoToLocalDatetime(
			toNullableString(item.published_at),
		);
		updateCoverPreview();
	};

	const fillDiaryForm = (item: Record<string, unknown>): void => {
		diaryContentInput.value = toStringValue(item.content);
		diaryMoodInput.value = toStringValue(item.mood);
		diaryLocationInput.value = toStringValue(item.location);
		diaryHappenedAtInput.value = isoToLocalDatetime(
			toNullableString(item.happened_at),
		);
		diaryAllowCommentsInput.checked = toBooleanValue(
			item.allow_comments,
			true,
		);
		diaryIsPublicInput.checked = toBooleanValue(item.is_public, true);
		diaryShowOnProfileInput.checked = toBooleanValue(
			item.show_on_profile,
			true,
		);
	};

	const updateUrlState = (): void => {
		const params = new URLSearchParams(window.location.search);
		params.set("type", currentType);
		if (currentItemId) {
			params.set("id", currentItemId);
		} else {
			params.delete("id");
		}
		const queryString = params.toString();
		const nextUrl = queryString ? `/publish?${queryString}` : "/publish";
		window.history.replaceState(null, "", nextUrl);
	};

	const renderList = (): void => {
		itemListEl.innerHTML = "";
		if (listItems.length === 0) {
			itemEmptyEl.classList.remove("hidden");
			return;
		}
		itemEmptyEl.classList.add("hidden");
		for (const item of listItems) {
			if (!item.id) {
				continue;
			}
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.itemId = item.id;
			button.className =
				"w-full text-left rounded-xl border px-3 py-2.5 transition " +
				(currentItemId === item.id
					? "border-[var(--primary)] bg-[var(--btn-plain-bg-hover)]"
					: "border-[var(--line-divider)] hover:bg-[var(--btn-plain-bg-hover)]");

			const title = document.createElement("div");
			title.className = "text-sm font-medium text-90 truncate";
			title.textContent = item.title;

			const meta = document.createElement("div");
			meta.className = "text-xs text-60 mt-1 flex items-center gap-2";
			const status = document.createElement("span");
			status.textContent = statusLabel(item.status);
			const time = document.createElement("span");
			time.textContent = formatDateTime(item.updatedAt) || "-";
			meta.append(status, time);

			if (item.summary) {
				const summary = document.createElement("p");
				summary.className = "text-xs text-60 mt-1 line-clamp-2";
				summary.textContent = item.summary;
				button.append(title, meta, summary);
			} else {
				button.append(title, meta);
			}

			itemListEl.append(button);
		}
	};

	const setType = (nextType: ContentType): void => {
		currentType = nextType;
		articleFormEl.classList.toggle("hidden", currentType !== "article");
		diaryFormEl.classList.toggle("hidden", currentType !== "diary");
		articleBodyLabelEl.classList.toggle(
			"hidden",
			currentType !== "article",
		);
		diaryContentLabelEl.classList.toggle("hidden", currentType !== "diary");
		articleBodyFieldEl.classList.toggle(
			"hidden",
			currentType !== "article",
		);
		diaryContentFieldEl.classList.toggle("hidden", currentType !== "diary");
		listTitleEl.textContent =
			currentType === "article" ? "我的文章" : "我的日记";
		createNewBtn.textContent =
			currentType === "article" ? "新建文章草稿" : "新建日记草稿";
		updateTypeButtonStyle(typeArticleBtn, currentType === "article");
		updateTypeButtonStyle(typeDiaryBtn, currentType === "diary");
		updateEditorHeader();
		resetPreviewState();
		setEditorMode("edit");
	};

	const loadList = async (): Promise<void> => {
		if (!isLoggedIn) {
			return;
		}
		const endpoint =
			currentType === "article"
				? "/api/v1/me/articles"
				: "/api/v1/me/diaries";
		try {
			const { response, data } = await api(endpoint, { method: "GET" });
			if (response.status === 401) {
				emitAuthState({
					isLoggedIn: false,
					isAdmin: false,
					userId: "",
					username: "",
				});
				return;
			}
			if (!response.ok || !data?.ok) {
				listItems = [];
				renderList();
				return;
			}
			const rows = Array.isArray(data.items)
				? (data.items as unknown[])
				: [];
			listItems = rows
				.map((row) => toRecord(row))
				.filter((row): row is Record<string, unknown> => Boolean(row))
				.map((row) =>
					currentType === "article"
						? parseArticleListItem(row)
						: parseDiaryListItem(row),
				)
				.filter((row) => Boolean(row.id));
			if (
				currentItemId &&
				!listItems.some((item) => item.id === currentItemId)
			) {
				currentItemId = "";
				updateEditorHeader();
				updateUrlState();
			}
			renderList();
		} catch (error) {
			console.error("[publish] load list failed:", error);
			listItems = [];
			renderList();
		}
	};

	const loadDetail = async (id: string): Promise<void> => {
		const targetId = String(id || "").trim();
		if (!targetId || !isLoggedIn) {
			return;
		}
		const endpoint =
			currentType === "article"
				? `/api/v1/me/articles/${encodeURIComponent(targetId)}`
				: `/api/v1/me/diaries/${encodeURIComponent(targetId)}`;
		try {
			const { response, data } = await api(endpoint, { method: "GET" });
			if (response.status === 401) {
				emitAuthState({
					isLoggedIn: false,
					isAdmin: false,
					userId: "",
					username: "",
				});
				return;
			}
			if (!response.ok || !data?.ok) {
				setSubmitError(getApiMessage(data, "加载详情失败"));
				return;
			}
			const item = toRecord(data.item);
			if (!item) {
				setSubmitError("未找到可编辑内容");
				return;
			}
			if (currentType === "article") {
				fillArticleForm(item);
			} else {
				fillDiaryForm(item);
			}
			currentItemId = targetId;
			updateEditorHeader();
			updateUrlState();
			renderList();
			setEditorMode("edit");
			resetPreviewState();
			setSubmitError("");
			setSubmitMessage("");
		} catch (error) {
			console.error("[publish] load detail failed:", error);
			setSubmitError("加载详情失败，请稍后重试");
		}
	};

	const buildArticlePayload = (
		status: PublishStatus,
	): Record<string, unknown> | null => {
		const title = toStringValue(articleTitleInput.value);
		const bodyMarkdown = String(articleBodyInput.value || "").trim();
		if (!title || !bodyMarkdown) {
			setSubmitError("文章标题和正文为必填项");
			return null;
		}
		const publishedAtInput = localDatetimeToIso(
			articlePublishedAtInput.value,
		);
		return {
			title,
			summary: toNullableString(articleSummaryInput.value),
			body_markdown: bodyMarkdown,
			cover_file: toNullableString(articleCoverFileInput.value),
			cover_url: toNullableString(articleCoverUrlInput.value),
			tags: csvToArray(articleTagsInput.value),
			category: toNullableString(articleCategoryInput.value),
			allow_comments: articleAllowCommentsInput.checked,
			is_public: articleIsPublicInput.checked,
			show_on_profile: articleShowOnProfileInput.checked,
			published_at:
				status === "published"
					? publishedAtInput || new Date().toISOString()
					: publishedAtInput,
			status,
		};
	};

	const buildDiaryPayload = (
		status: PublishStatus,
	): Record<string, unknown> | null => {
		const content = String(diaryContentInput.value || "").trim();
		if (!content) {
			setSubmitError("日记内容为必填项");
			return null;
		}
		return {
			content,
			mood: toNullableString(diaryMoodInput.value),
			location: toNullableString(diaryLocationInput.value),
			happened_at: localDatetimeToIso(diaryHappenedAtInput.value),
			allow_comments: diaryAllowCommentsInput.checked,
			is_public: diaryIsPublicInput.checked,
			show_on_profile: diaryShowOnProfileInput.checked,
			status,
		};
	};

	const submit = async (status: PublishStatus): Promise<void> => {
		if (!isLoggedIn) {
			showAuthRequiredDialog();
			return;
		}

		setSubmitError("");
		setSubmitMessage("");

		const payload =
			currentType === "article"
				? buildArticlePayload(status)
				: buildDiaryPayload(status);
		if (!payload) {
			return;
		}

		const isEditing = Boolean(currentItemId);
		const endpoint = isEditing
			? `/api/v1/me/${currentType === "article" ? "articles" : "diaries"}/${encodeURIComponent(currentItemId)}`
			: `/api/v1/me/${currentType === "article" ? "articles" : "diaries"}`;
		const method = isEditing ? "PATCH" : "POST";

		const draftLabel = saveDraftBtn.textContent || "保存草稿";
		const publishLabel = savePublishedBtn.textContent || "立即发布";
		saveDraftBtn.disabled = true;
		savePublishedBtn.disabled = true;
		if (status === "draft") {
			saveDraftBtn.textContent = "保存中...";
		} else {
			savePublishedBtn.textContent = "发布中...";
		}

		try {
			const { response, data } = await api(endpoint, {
				method,
				body: JSON.stringify(payload),
			});
			if (response.status === 401) {
				emitAuthState({
					isLoggedIn: false,
					isAdmin: false,
					userId: "",
					username: "",
				});
				showAuthRequiredDialog();
				return;
			}
			if (!response.ok || !data?.ok) {
				setSubmitError(getApiMessage(data, "保存失败，请稍后重试"));
				return;
			}

			const item = toRecord(data.item);
			const nextId = toStringValue(item?.id) || currentItemId;
			if (nextId) {
				currentItemId = nextId;
			}
			if (item) {
				if (currentType === "article") {
					fillArticleForm(item);
				} else {
					fillDiaryForm(item);
				}
			}
			updateEditorHeader();
			updateUrlState();
			await loadList();
			renderList();
			setSubmitMessage(
				status === "published" ? "内容已发布" : "草稿已保存",
			);
			setSubmitError("");
		} catch (error) {
			console.error("[publish] submit failed:", error);
			setSubmitError("保存失败，请稍后重试");
		} finally {
			saveDraftBtn.disabled = false;
			savePublishedBtn.disabled = false;
			saveDraftBtn.textContent = draftLabel;
			savePublishedBtn.textContent = publishLabel;
		}
	};

	const uploadArticleCover = async (file: File): Promise<void> => {
		if (!isLoggedIn) {
			showAuthRequiredDialog();
			return;
		}
		const formData = new FormData();
		formData.set("file", file);
		formData.set("purpose", "general");
		formData.set("title", `${currentUsername || "user"}-cover`);
		setCoverUploadMessage("封面上传中...");
		try {
			const { response, data } = await api("/api/v1/uploads", {
				method: "POST",
				body: formData,
			});
			if (response.status === 401) {
				emitAuthState({
					isLoggedIn: false,
					isAdmin: false,
					userId: "",
					username: "",
				});
				showAuthRequiredDialog();
				return;
			}
			if (!response.ok || !data?.ok) {
				setCoverUploadMessage(getApiMessage(data, "封面上传失败"));
				return;
			}
			const fileId = extractUploadFileId(data);
			if (!fileId) {
				setCoverUploadMessage("封面上传成功，但未获取到文件 ID");
				return;
			}
			articleCoverFileInput.value = fileId;
			updateCoverPreview();
			setCoverUploadMessage("封面上传成功");
		} catch (error) {
			console.error("[publish] upload cover failed:", error);
			setCoverUploadMessage("封面上传失败，请稍后重试");
		}
	};

	const applyAuthState = (state: AuthState): void => {
		isLoggedIn = state.isLoggedIn;
		currentUsername = toStringValue(state.username);

		workspaceEl.classList.toggle("hidden", !isLoggedIn);

		if (!isLoggedIn) {
			listItems = [];
			renderList();
			return;
		}

		if (!initializedAfterLogin) {
			initializedAfterLogin = true;
			void (async () => {
				await loadList();
				if (
					initialIdFromQuery &&
					currentType === initialTypeFromQuery
				) {
					await loadDetail(initialIdFromQuery);
				} else {
					resetCurrentForm();
				}
			})();
		}
	};

	const updateTypeAndReload = async (
		nextType: ContentType,
	): Promise<void> => {
		if (currentType === nextType) {
			return;
		}
		setType(nextType);
		currentItemId = "";
		if (currentType === "article") {
			resetArticleForm();
		} else {
			resetDiaryForm();
		}
		updateEditorHeader();
		updateUrlState();
		setSubmitError("");
		setSubmitMessage("");
		setCoverUploadMessage("");
		await loadList();
	};

	setType(currentType);
	updateEditorHeader();
	updateUrlState();
	renderPreview();

	typeArticleBtn.addEventListener("click", () => {
		void updateTypeAndReload("article");
	});
	typeDiaryBtn.addEventListener("click", () => {
		void updateTypeAndReload("diary");
	});

	createNewBtn.addEventListener("click", () => {
		resetCurrentForm();
	});

	modeEditBtn.addEventListener("click", () => {
		setEditorMode("edit");
	});
	modePreviewBtn.addEventListener("click", () => {
		setEditorMode("preview");
	});

	toolbarEl.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) {
			return;
		}
		const button = target.closest<HTMLButtonElement>("[data-md-action]");
		if (!button) {
			return;
		}
		const action = toStringValue(button.dataset.mdAction);
		if (!isToolbarAction(action)) {
			return;
		}
		applyToolbarAction(action);
	});

	itemListEl.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) {
			return;
		}
		const button = target.closest<HTMLButtonElement>("[data-item-id]");
		if (!button) {
			return;
		}
		const id = toStringValue(button.dataset.itemId);
		if (!id) {
			return;
		}
		void loadDetail(id);
	});

	const bindDirtyInput = (
		input: HTMLInputElement | HTMLTextAreaElement,
		handler?: () => void,
	): void => {
		input.addEventListener("input", () => {
			if (handler) {
				handler();
			}
			markPreviewDirty();
		});
	};

	bindDirtyInput(articleBodyInput);
	bindDirtyInput(diaryContentInput);
	bindDirtyInput(articleTitleInput);
	bindDirtyInput(articleSummaryInput);
	bindDirtyInput(articleTagsInput);
	bindDirtyInput(articleCategoryInput);
	bindDirtyInput(articleCoverFileInput, updateCoverPreview);
	bindDirtyInput(articleCoverUrlInput, updateCoverPreview);
	bindDirtyInput(articlePublishedAtInput);
	bindDirtyInput(diaryMoodInput);
	bindDirtyInput(diaryLocationInput);
	bindDirtyInput(diaryHappenedAtInput);

	articleAllowCommentsInput.addEventListener("change", markPreviewDirty);
	articleIsPublicInput.addEventListener("change", markPreviewDirty);
	articleShowOnProfileInput.addEventListener("change", markPreviewDirty);
	diaryAllowCommentsInput.addEventListener("change", markPreviewDirty);
	diaryIsPublicInput.addEventListener("change", markPreviewDirty);
	diaryShowOnProfileInput.addEventListener("change", markPreviewDirty);

	saveDraftBtn.addEventListener("click", () => {
		void submit("draft");
	});
	savePublishedBtn.addEventListener("click", () => {
		void submit("published");
	});

	coverUploadBtn?.addEventListener("click", () => {
		coverFileInputEl?.click();
	});

	coverClearBtn?.addEventListener("click", () => {
		articleCoverFileInput.value = "";
		articleCoverUrlInput.value = "";
		updateCoverPreview();
		markPreviewDirty();
	});

	coverFileInputEl?.addEventListener("change", () => {
		const file = coverFileInputEl.files?.[0];
		if (!file) {
			return;
		}
		void uploadArticleCover(file);
		coverFileInputEl.value = "";
	});

	subscribeAuthState((state) => {
		applyAuthState(state);
	});

	applyAuthState(getAuthState());

	void (async () => {
		if (getAuthState().isLoggedIn) {
			return;
		}
		try {
			const { response, data } = await api("/api/auth/me", {
				method: "GET",
				headers: { "Cache-Control": "no-store" },
			});
			if (!response.ok || !data?.ok) {
				return;
			}
			const user = toRecord(data.user);
			emitAuthState({
				isLoggedIn: true,
				isAdmin: Boolean(data.is_admin || data.isAdmin),
				userId: toStringValue(user?.id),
				username: toStringValue(user?.username),
			});
		} catch (error) {
			console.warn("[publish] hydrate auth state failed:", error);
		}
	})();
}
