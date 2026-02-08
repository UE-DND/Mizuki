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

function applyCalendarFilter(detail: CalendarFilterDetail) {
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

function updateCardActionVisibility(state: AuthState) {
	const cards = document.querySelectorAll<HTMLElement>("[data-post-card]");
	cards.forEach((card) => {
		const authorId = String(card.dataset.authorId || "");
		const deleteOwnBtn = card.querySelector<HTMLButtonElement>(
			'button[data-action="delete-own-article"]',
		);
		const deleteAdminBtn = card.querySelector<HTMLButtonElement>(
			'button[data-action="delete-admin-article"]',
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
			state.isLoggedIn &&
			Boolean(state.userId) &&
			state.userId === authorId;
		const isAdminOnly = state.isLoggedIn && state.isAdmin && !isOwner;

		deleteOwnBtn?.classList.toggle("hidden", !isOwner);
		deleteAdminBtn?.classList.toggle("hidden", !isAdminOnly);

		if (blockBtn) {
			const canBlock =
				state.isLoggedIn &&
				Boolean(authorId) &&
				state.userId !== authorId;
			blockBtn.classList.toggle("hidden", !canBlock);
		}

		if (reportBtn) {
			reportBtn.classList.toggle("hidden", !state.isLoggedIn);
		}

		if (likeBtn) {
			likeBtn.classList.toggle("opacity-60", !state.isLoggedIn);
		}
	});
}

function setLikeButtonState(
	button: HTMLButtonElement,
	liked: boolean,
	likeCount?: number,
) {
	button.dataset.liked = liked ? "true" : "false";
	button.classList.toggle("text-[var(--primary)]", liked);
	const countEl = button.querySelector<HTMLElement>("[data-like-count]");
	if (countEl && typeof likeCount === "number") {
		countEl.textContent = String(Math.max(0, likeCount));
	}
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
		const response = await fetch("/api/v1/me/article-likes/?limit=500", {
			credentials: "include",
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok || !data?.ok || !Array.isArray(data.items)) {
			return;
		}
		const likedArticleIds = new Set<string>(
			data.items
				.map((item: { article_id?: unknown }) =>
					item?.article_id ? String(item.article_id) : "",
				)
				.filter(Boolean),
		);
		likeButtons.forEach((button) => {
			const card = button.closest<HTMLElement>("[data-post-card]");
			const articleId = card?.dataset.articleId
				? String(card.dataset.articleId)
				: "";
			setLikeButtonState(button, likedArticleIds.has(articleId));
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

function removeCardsByAuthorId(authorId: string) {
	const cards = document.querySelectorAll<HTMLElement>(
		`[data-post-card][data-author-id="${CSS.escape(authorId)}"]`,
	);
	cards.forEach((card) => {
		const row = card.closest<HTMLElement>(".post-list-item");
		row?.remove();
	});
}

async function requestDeleteArticle(articleId: string) {
	const response = await fetch(
		`/api/v1/me/articles/${encodeURIComponent(articleId)}/`,
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
	const response = await fetch("/api/v1/me/blocks/", {
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

async function requestReportArticle(input: {
	targetId: string;
	targetUserId: string;
	reason: string;
	detail?: string;
}) {
	const response = await fetch("/api/v1/me/reports/", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			target_type: "article",
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
	const response = await fetch("/api/v1/me/article-likes/", {
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

		const card = actionEl.closest<HTMLElement>("[data-post-card]");
		if (!card) {
			return;
		}

		const action = String(actionEl.dataset.action || "");
		const articleId = String(card.dataset.articleId || "");
		const authorId = String(card.dataset.authorId || "");
		if (!articleId) {
			return;
		}

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
					await requestDeleteArticle(articleId);
					removeCardByArticleId(articleId);
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
				const result = await requestToggleLike(articleId);
				setLikeButtonState(button, result.liked, result.like_count);
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
					message: "可选填写屏蔽原因，确认后将隐藏该用户的文章。",
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
				await requestReportArticle({
					targetId: articleId,
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
