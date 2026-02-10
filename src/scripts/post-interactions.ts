import {
	getAuthState,
	subscribeAuthState,
	type AuthState,
} from "@/scripts/auth-state";
import {
	showAuthRequiredDialog,
	showConfirmDialog,
	showFormDialog,
	showNoticeDialog,
} from "@/scripts/dialogs";

type CalendarFilterDetail = {
	type: "day" | "month" | "year";
	key: string;
	posts: Array<{
		id: string;
		title: string;
		date: string;
		url: string;
	}>;
};

type RuntimeWindow = Window &
	typeof globalThis & {
		_calendarFilterListenerAttached?: boolean;
		_postCardActionsAttached?: boolean;
		_postInteractionsInitialized?: boolean;
	};

const runtimeWindow = window as RuntimeWindow;

function getFilterDom() {
	return {
		postList: document.getElementById("post-list-container"),
		pagination: document.getElementById("pagination-container"),
	};
}

function isArchivePage(): boolean {
	return Boolean(document.querySelector(".archive-posts"));
}

function applyCalendarFilter(detail: CalendarFilterDetail) {
	// archive 页面有自己的筛选系统，跳过此处理
	if (isArchivePage()) {
		return;
	}

	const { postList, pagination } = getFilterDom();
	if (!postList) {
		return;
	}
	const items = Array.from(
		postList.querySelectorAll<HTMLElement>(".post-list-item"),
	);
	items.forEach((item) => {
		const match =
			detail.type === "year"
				? item.dataset.year === detail.key
				: detail.type === "month"
					? item.dataset.month === detail.key
					: item.dataset.day === detail.key;
		item.classList.toggle("hidden", !match);
	});
	pagination?.classList.add("hidden");
}

function clearCalendarFilter() {
	// archive 页面有自己的筛选系统，跳过此处理
	if (isArchivePage()) {
		return;
	}

	const { postList, pagination } = getFilterDom();
	if (!postList) {
		return;
	}
	postList
		.querySelectorAll<HTMLElement>(".post-list-item.hidden")
		.forEach((item) => item.classList.remove("hidden"));
	pagination?.classList.remove("hidden");
}

function setupCalendarFilterListeners() {
	if (runtimeWindow._calendarFilterListenerAttached) {
		return;
	}

	window.addEventListener("calendarFilterChange", (event) => {
		const detail = (event as CustomEvent<CalendarFilterDetail>).detail;
		if (!detail || !Array.isArray(detail.posts)) {
			return;
		}
		applyCalendarFilter(detail);
	});

	window.addEventListener("calendarFilterClear", () => {
		clearCalendarFilter();
	});

	runtimeWindow._calendarFilterListenerAttached = true;
}

let currentAuthState: AuthState = {
	userId: "",
	username: "",
	isAdmin: false,
	isLoggedIn: false,
};

function updateCurrentAuthState(state: AuthState) {
	currentAuthState = state;
}

async function applyBlockedUsersFilter() {
	if (!currentAuthState.isLoggedIn) {
		return;
	}
	try {
		const response = await fetch("/api/v1/me/blocks/?limit=200", {
			credentials: "include",
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok || !data?.ok || !Array.isArray(data.items)) {
			return;
		}
		for (const item of data.items) {
			const blockedUserId = item?.blocked_user_id
				? String(item.blocked_user_id)
				: "";
			if (blockedUserId) {
				removeCardsByAuthorId(blockedUserId);
			}
		}
	} catch (error) {
		console.error("[PostPage] failed to apply blocked user filter:", error);
	}
}

function applyCardActionVisibility(
	card: HTMLElement,
	state: AuthState,
	deleteOwnAction: string,
	deleteAdminAction: string,
) {
	const authorId = String(card.dataset.authorId || "");
	const deleteOwnBtn = card.querySelector<HTMLButtonElement>(
		`button[data-action="${deleteOwnAction}"]`,
	);
	const deleteAdminBtn = card.querySelector<HTMLButtonElement>(
		`button[data-action="${deleteAdminAction}"]`,
	);
	const blockBtn = card.querySelector<HTMLButtonElement>(
		'button[data-action="block-user"]',
	);
	const reportBtn = card.querySelector<HTMLButtonElement>(
		'button[data-action="report-content"]',
	);
	const likeBtn = card.querySelector<HTMLButtonElement>(
		'button[data-action="toggle-like"]',
	);

	const isOwner =
		state.isLoggedIn && Boolean(state.userId) && state.userId === authorId;
	const isAdminOnly = state.isLoggedIn && state.isAdmin && !isOwner;

	deleteOwnBtn?.classList.toggle("hidden", !isOwner);
	deleteAdminBtn?.classList.toggle("hidden", !isAdminOnly);

	if (blockBtn) {
		const canBlock =
			state.isLoggedIn && Boolean(authorId) && state.userId !== authorId;
		blockBtn.classList.toggle("hidden", !canBlock);
	}

	if (reportBtn) {
		reportBtn.classList.toggle("hidden", !state.isLoggedIn);
	}

	if (likeBtn) {
		likeBtn.classList.toggle("opacity-60", !state.isLoggedIn);
	}
}

function updateCardActionVisibility(state: AuthState) {
	const postCards =
		document.querySelectorAll<HTMLElement>("[data-post-card]");
	postCards.forEach((card) => {
		applyCardActionVisibility(
			card,
			state,
			"delete-own-article",
			"delete-admin-article",
		);
	});

	const diaryCards =
		document.querySelectorAll<HTMLElement>("[data-diary-card]");
	diaryCards.forEach((card) => {
		applyCardActionVisibility(
			card,
			state,
			"delete-own-diary",
			"delete-admin-diary",
		);
	});
}

function setLikeButtonState(
	button: HTMLButtonElement,
	liked: boolean,
	likeCount?: number,
) {
	button.dataset.liked = liked ? "true" : "false";
	button.classList.toggle("text-[var(--primary)]", liked);
	button.classList.toggle("text-50", !liked);
	const countEl = button.querySelector<HTMLElement>("[data-like-count]");
	if (countEl && typeof likeCount === "number") {
		countEl.textContent = String(Math.max(0, likeCount));
	}
}

const LIKE_SYNC_PAGE_LIMIT = 100;

type LikeRelationField = "article_id" | "diary_id";

type FetchAllLikedIdsOptions = {
	endpoint: string;
	idField: LikeRelationField;
};

function normalizeRelationId(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") {
		return String(value).trim();
	}
	if (value && typeof value === "object" && "id" in value) {
		const relationId = (value as { id?: unknown }).id;
		if (typeof relationId === "string" || typeof relationId === "number") {
			return String(relationId).trim();
		}
	}
	return "";
}

async function fetchAllLikedIds({
	endpoint,
	idField,
}: FetchAllLikedIdsOptions): Promise<Set<string>> {
	const likedIds = new Set<string>();
	let page = 1;
	let total: number | null = null;
	let fetched = 0;
	let hasMore = true;

	while (hasMore) {
		const response = await fetch(
			`${endpoint}?page=${page}&limit=${LIKE_SYNC_PAGE_LIMIT}`,
			{
				credentials: "include",
			},
		);
		const data = await response.json().catch(() => ({}));
		if (!response.ok || !data?.ok || !Array.isArray(data.items)) {
			throw new Error(`failed to fetch likes list: ${endpoint}`);
		}
		if (typeof data.total === "number" && Number.isFinite(data.total)) {
			total = Math.max(0, Math.floor(data.total));
		}

		const items = data.items as Array<Record<string, unknown>>;
		fetched += items.length;
		for (const item of items) {
			const id = normalizeRelationId(item[idField]);
			if (id) {
				likedIds.add(id);
			}
		}

		hasMore = !(
			items.length < LIKE_SYNC_PAGE_LIMIT ||
			items.length === 0 ||
			(total !== null && fetched >= total)
		);
		if (hasMore) {
			page += 1;
		}
	}

	return likedIds;
}

async function syncLikeButtons() {
	const likeButtons = document.querySelectorAll<HTMLButtonElement>(
		'button[data-action="toggle-like"]',
	);
	if (!currentAuthState.isLoggedIn) {
		likeButtons.forEach((button) => {
			setLikeButtonState(button, false);
		});
		return;
	}

	try {
		const hasPostCards =
			document.querySelector("[data-post-card]") !== null;
		const hasDiaryCards =
			document.querySelector("[data-diary-card]") !== null;

		const [likedArticleIds, likedDiaryIds] = await Promise.all([
			hasPostCards
				? fetchAllLikedIds({
						endpoint: "/api/v1/me/article-likes",
						idField: "article_id",
					})
				: Promise.resolve(new Set<string>()),
			hasDiaryCards
				? fetchAllLikedIds({
						endpoint: "/api/v1/me/diary-likes",
						idField: "diary_id",
					})
				: Promise.resolve(new Set<string>()),
		]);

		likeButtons.forEach((button) => {
			const postCard = button.closest<HTMLElement>("[data-post-card]");
			if (postCard) {
				const articleId = String(
					postCard.dataset.articleId || "",
				).trim();
				setLikeButtonState(button, likedArticleIds.has(articleId));
				return;
			}
			const diaryCard = button.closest<HTMLElement>("[data-diary-card]");
			if (diaryCard) {
				const diaryId = String(diaryCard.dataset.diaryId || "").trim();
				setLikeButtonState(button, likedDiaryIds.has(diaryId));
			}
		});
	} catch (error) {
		console.error("[PostPage] failed to sync likes:", error);
	}
}

function removeCardByArticleId(articleId: string) {
	const card = document.querySelector<HTMLElement>(
		`[data-post-card][data-article-id="${CSS.escape(articleId)}"]`,
	);
	if (!card) {
		return;
	}
	const row = card.closest<HTMLElement>(".post-list-item");
	row?.remove();
}

function removeCardByDiaryId(diaryId: string) {
	const card = document.querySelector<HTMLElement>(
		`[data-diary-card][data-diary-id="${CSS.escape(diaryId)}"]`,
	);
	if (!card) {
		return;
	}
	const row = card.closest<HTMLElement>(".diary-list-item") || card;
	row.remove();
}

function removeCardsByAuthorId(authorId: string) {
	const escaped = CSS.escape(authorId);
	const cards = document.querySelectorAll<HTMLElement>(
		`[data-post-card][data-author-id="${escaped}"], [data-diary-card][data-author-id="${escaped}"]`,
	);
	cards.forEach((card) => {
		const row =
			card.closest<HTMLElement>(".post-list-item") ||
			card.closest<HTMLElement>(".diary-list-item") ||
			card;
		row.remove();
	});
}

async function requestDeleteArticle(articleId: string) {
	const response = await fetch(
		`/api/v1/me/articles/${encodeURIComponent(articleId)}`,
		{
			method: "DELETE",
			credentials: "include",
		},
	);
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || "删除失败");
	}
}

async function requestDeleteDiary(diaryId: string) {
	const response = await fetch(
		`/api/v1/me/diaries/${encodeURIComponent(diaryId)}`,
		{
			method: "DELETE",
			credentials: "include",
		},
	);
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || "删除失败");
	}
}

async function requestBlockUser(blockedUserId: string, reason?: string) {
	const response = await fetch("/api/v1/me/blocks", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			blocked_user_id: blockedUserId,
			reason: reason || undefined,
		}),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || "屏蔽失败");
	}
}

async function requestReportContent(input: {
	targetType: string;
	targetId: string;
	targetUserId: string;
	reason: string;
	detail?: string;
}) {
	const response = await fetch("/api/v1/me/reports", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			target_type: input.targetType,
			target_id: input.targetId,
			target_user_id: input.targetUserId || undefined,
			reason: input.reason,
			detail: input.detail || undefined,
		}),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || "举报失败");
	}
}

async function requestToggleLike(articleId: string): Promise<{
	liked: boolean;
	like_count: number;
}> {
	const response = await fetch("/api/v1/me/article-likes", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			article_id: articleId,
		}),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || "点赞操作失败");
	}
	return {
		liked: Boolean(data.liked),
		like_count: Number(data.like_count || 0),
	};
}

async function requestToggleDiaryLike(diaryId: string): Promise<{
	liked: boolean;
	like_count: number;
}> {
	const response = await fetch("/api/v1/me/diary-likes", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			diary_id: diaryId,
		}),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || "点赞操作失败");
	}
	return {
		liked: Boolean(data.liked),
		like_count: Number(data.like_count || 0),
	};
}

function resolveCardContext(actionEl: HTMLElement): {
	cardType: "post" | "diary";
	card: HTMLElement;
	itemId: string;
	authorId: string;
} | null {
	const postCard = actionEl.closest<HTMLElement>("[data-post-card]");
	if (postCard) {
		return {
			cardType: "post",
			card: postCard,
			itemId: String(postCard.dataset.articleId || ""),
			authorId: String(postCard.dataset.authorId || ""),
		};
	}
	const diaryCard = actionEl.closest<HTMLElement>("[data-diary-card]");
	if (diaryCard) {
		return {
			cardType: "diary",
			card: diaryCard,
			itemId: String(diaryCard.dataset.diaryId || ""),
			authorId: String(diaryCard.dataset.authorId || ""),
		};
	}
	return null;
}

function setupPostCardActions() {
	if (runtimeWindow._postCardActionsAttached) {
		return;
	}

	document.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) {
			return;
		}
		const summary = target.closest<HTMLElement>(
			".post-card-menu > summary",
		);
		if (summary && !currentAuthState.isLoggedIn) {
			event.preventDefault();
			showAuthRequiredDialog();
		}
	});

	document.addEventListener("click", async (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) {
			return;
		}
		const actionEl = target.closest<HTMLElement>("[data-action]");
		if (!actionEl) {
			return;
		}

		const ctx = resolveCardContext(actionEl);
		if (!ctx || !ctx.itemId) {
			return;
		}

		const { cardType, itemId, authorId } = ctx;
		const action = String(actionEl.dataset.action || "");

		if (!currentAuthState.isLoggedIn) {
			showAuthRequiredDialog();
			return;
		}

		const details = actionEl.closest("details");
		details?.removeAttribute("open");

		try {
			if (
				action === "delete-own-article" ||
				action === "delete-admin-article"
			) {
				const canDelete =
					currentAuthState.isAdmin ||
					currentAuthState.userId === authorId;
				if (!canDelete) {
					await showNoticeDialog({
						ariaLabel: "权限提示",
						message: "无权限删除该文章。",
					});
					return;
				}
				const confirmText =
					action === "delete-admin-article"
						? "确认以管理员身份删除此文章？删除后不可恢复。"
						: "确认删除这篇文章？删除后不可恢复。";
				const confirmed = await showConfirmDialog({
					ariaLabel: "删除确认",
					message: confirmText,
					confirmText: "确认删除",
					cancelText: "取消",
					confirmVariant: "danger",
				});
				if (!confirmed) {
					return;
				}
				try {
					await requestDeleteArticle(itemId);
					removeCardByArticleId(itemId);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "删除失败，请稍后重试。";
					await showNoticeDialog({
						ariaLabel: "删除失败",
						message,
					});
				}
				return;
			}

			if (
				action === "delete-own-diary" ||
				action === "delete-admin-diary"
			) {
				const canDelete =
					currentAuthState.isAdmin ||
					currentAuthState.userId === authorId;
				if (!canDelete) {
					await showNoticeDialog({
						ariaLabel: "权限提示",
						message: "无权限删除该日记。",
					});
					return;
				}
				const confirmText =
					action === "delete-admin-diary"
						? "确认以管理员身份删除此日记？删除后不可恢复。"
						: "确认删除这篇日记？删除后不可恢复。";
				const confirmed = await showConfirmDialog({
					ariaLabel: "删除确认",
					message: confirmText,
					confirmText: "确认删除",
					cancelText: "取消",
					confirmVariant: "danger",
				});
				if (!confirmed) {
					return;
				}
				try {
					await requestDeleteDiary(itemId);
					removeCardByDiaryId(itemId);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "删除失败，请稍后重试。";
					await showNoticeDialog({
						ariaLabel: "删除失败",
						message,
					});
				}
				return;
			}

			if (action === "toggle-like") {
				const button = actionEl as HTMLButtonElement;
				if (cardType === "diary") {
					const result = await requestToggleDiaryLike(itemId);
					setLikeButtonState(button, result.liked, result.like_count);
				} else {
					const result = await requestToggleLike(itemId);
					setLikeButtonState(button, result.liked, result.like_count);
				}
				return;
			}

			if (action === "block-user") {
				if (!authorId || currentAuthState.userId === authorId) {
					await showNoticeDialog({
						ariaLabel: "操作提示",
						message: "不能屏蔽该用户。",
					});
					return;
				}
				const formValues = await showFormDialog({
					ariaLabel: "屏蔽用户",
					message: "可选填写屏蔽原因，确认后将隐藏该用户的内容。",
					confirmText: "确认屏蔽",
					cancelText: "取消",
					confirmVariant: "danger",
					fields: [
						{
							name: "reason",
							label: "屏蔽原因（可选）",
							type: "textarea",
							placeholder: "例如：恶意刷屏、骚扰等",
							rows: 3,
						},
					],
				});
				if (!formValues) {
					return;
				}
				const reason = String(formValues.reason || "").trim();
				await requestBlockUser(authorId, reason);
				removeCardsByAuthorId(authorId);
				await showNoticeDialog({
					ariaLabel: "操作成功",
					message: "已屏蔽该用户。",
				});
				return;
			}

			if (action === "report-content") {
				const formValues = await showFormDialog({
					ariaLabel: "举报内容",
					message: "请选择举报原因，可选填写补充说明。",
					confirmText: "提交举报",
					cancelText: "取消",
					confirmVariant: "danger",
					fields: [
						{
							name: "reason",
							label: "举报原因",
							type: "select",
							required: true,
							value: "other",
							options: [
								{ label: "垃圾信息（spam）", value: "spam" },
								{ label: "辱骂骚扰（abuse）", value: "abuse" },
								{ label: "仇恨内容（hate）", value: "hate" },
								{
									label: "暴力内容（violence）",
									value: "violence",
								},
								{
									label: "版权问题（copyright）",
									value: "copyright",
								},
								{ label: "其他（other）", value: "other" },
							],
						},
						{
							name: "detail",
							label: "补充说明（可选）",
							type: "textarea",
							placeholder: "可填写更多背景信息",
							rows: 4,
						},
					],
				});
				if (!formValues) {
					return;
				}
				const reason = String(formValues.reason || "")
					.trim()
					.toLowerCase();
				const normalizedReason = [
					"spam",
					"abuse",
					"hate",
					"violence",
					"copyright",
					"other",
				].includes(reason)
					? reason
					: "other";
				const detail = String(formValues.detail || "").trim();
				await requestReportContent({
					targetType: cardType === "diary" ? "diary" : "article",
					targetId: itemId,
					targetUserId: authorId,
					reason: normalizedReason,
					detail,
				});
				await showNoticeDialog({
					ariaLabel: "举报成功",
					message: "已提交举报，我们会尽快处理。",
				});
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "操作失败，请稍后重试。";
			await showNoticeDialog({
				ariaLabel: "操作失败",
				message,
			});
		}
	});

	document.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) {
			return;
		}
		document
			.querySelectorAll<HTMLDetailsElement>(".post-card-menu[open]")
			.forEach((menu) => {
				if (!menu.contains(target)) {
					menu.removeAttribute("open");
				}
			});
	});

	subscribeAuthState((state) => {
		updateCurrentAuthState(state);
		updateCardActionVisibility(currentAuthState);
		void applyBlockedUsersFilter();
		void syncLikeButtons();
	});

	runtimeWindow._postCardActionsAttached = true;
}

export function initPostInteractions(): void {
	if (runtimeWindow._postInteractionsInitialized) {
		return;
	}
	runtimeWindow._postInteractionsInitialized = true;

	setupCalendarFilterListeners();
	setupPostCardActions();
	updateCurrentAuthState(getAuthState());
	updateCardActionVisibility(currentAuthState);
	void (async () => {
		await applyBlockedUsersFilter();
		await syncLikeButtons();
	})();
}
