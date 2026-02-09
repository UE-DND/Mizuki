/**
 * Archive page filter & pagination logic.
 *
 * Extracted from the original archive.astro <script> so that the global layout
 * runtime can dynamically import and call it during Swup navigation. ES modules
 * only execute once per URL per document, so we cannot rely on SwupHeadPlugin
 * to re-run page-specific module scripts.
 *
 * Initialization is handled by `runDynamicPageInit()` in layout/index.ts.
 */

type FilterState = {
	type: "none" | "tag" | "category" | "calendar";
	value: string;
	values?: string[];
	calendarType?: "day" | "month" | "year";
	calendarKey?: string;
};

type ArchiveRuntimeWindow = Window &
	typeof globalThis & {
		__archiveFilterCleanup?: () => void;
	};

const POSTS_PER_PAGE = 5;

export function initArchiveFilter(): void {
	// 清除上一次实例的事件监听
	const rw = window as ArchiveRuntimeWindow;
	rw.__archiveFilterCleanup?.();

	// 确认当前页面确实是 archive 页
	const archiveRoot = document.querySelector<HTMLElement>(".archive-posts");
	if (!archiveRoot) {
		return;
	}

	let currentPage = 1;
	let currentFilter: FilterState = { type: "none", value: "" };

	const UNCATEGORIZED_LABEL = archiveRoot.dataset.uncategorizedLabel || "";

	function isUncategorizedValue(value: string): boolean {
		return (
			value === "uncategorized" ||
			(UNCATEGORIZED_LABEL !== "" &&
				value.toLowerCase() === UNCATEGORIZED_LABEL.toLowerCase())
		);
	}

	// 每次重新获取 DOM，避免 Swup 替换后引用过期
	function getPostList() {
		return document.getElementById("post-list-container");
	}
	function getNoResults() {
		return document.getElementById("archive-no-results");
	}

	const originalOrder = new Map<HTMLElement, number>();

	function getFilterElements() {
		return {
			filterStatus: document.getElementById("filter-status"),
			filterLabel: document.getElementById("filter-status-label"),
			filterClearBtn: document.getElementById("filter-clear-btn"),
		};
	}

	function getAllPostItems(): HTMLElement[] {
		const postList = getPostList();
		if (!postList) {
			return [];
		}
		const allItems = Array.from(
			postList.querySelectorAll<HTMLElement>(".post-list-item"),
		);
		if (originalOrder.size === 0) {
			allItems.forEach((item, index) => {
				originalOrder.set(item, index);
			});
		}
		return allItems;
	}

	function normalizeTagList(tags: string[]): string[] {
		const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
		return Array.from(new Set(normalized));
	}

	function getSelectedTags(filter: FilterState): string[] {
		if (filter.type !== "tag") {
			return [];
		}
		const raw =
			filter.values && filter.values.length > 0
				? filter.values
				: filter.value
					? [filter.value]
					: [];
		return normalizeTagList(raw);
	}

	function parseItemTags(item: HTMLElement): string[] {
		try {
			const parsed = JSON.parse(item.dataset.tags || "[]") as unknown;
			return Array.isArray(parsed)
				? parsed.map((tag) => String(tag))
				: [];
		} catch (error) {
			console.warn("[archive] failed to parse item tags:", error);
			return [];
		}
	}

	function getTagMatchCount(item: HTMLElement, tags: string[]): number {
		if (tags.length === 0) {
			return 0;
		}
		const itemTags = parseItemTags(item);
		return tags.reduce(
			(count, tag) => (itemTags.includes(tag) ? count + 1 : count),
			0,
		);
	}

	function getMatchingItems(filter: FilterState): HTMLElement[] {
		const allItems = getAllPostItems();
		if (filter.type === "none") {
			return allItems;
		}

		if (filter.type === "tag") {
			const selectedTags = getSelectedTags(filter);
			const withScores = allItems
				.map((item) => ({
					item,
					score: getTagMatchCount(item, selectedTags),
				}))
				.filter(({ score }) => score > 0);

			return withScores
				.sort((a, b) => {
					if (b.score !== a.score) {
						return b.score - a.score;
					}
					return (
						(originalOrder.get(a.item) ?? 0) -
						(originalOrder.get(b.item) ?? 0)
					);
				})
				.map(({ item }) => item);
		}

		return allItems.filter((item) => {
			if (filter.type === "category") {
				return isUncategorizedValue(filter.value)
					? !item.dataset.category
					: item.dataset.category === filter.value;
			}
			if (filter.type === "calendar") {
				if (filter.calendarType === "year") {
					return item.dataset.year === filter.calendarKey;
				}
				if (filter.calendarType === "month") {
					return item.dataset.month === filter.calendarKey;
				}
				return item.dataset.day === filter.calendarKey;
			}
			return true;
		});
	}

	function renderPosts() {
		const postList = getPostList();
		const noResults = getNoResults();
		if (!postList) {
			return;
		}

		const allItems = getAllPostItems();
		const matching = getMatchingItems(currentFilter);
		const totalPages = Math.max(
			1,
			Math.ceil(matching.length / POSTS_PER_PAGE),
		);

		if (currentPage > totalPages) {
			currentPage = totalPages;
		}

		const start = (currentPage - 1) * POSTS_PER_PAGE;
		const pageItems = new Set(
			matching.slice(start, start + POSTS_PER_PAGE),
		);
		const matchingSet = new Set(matching);
		const orderedItems =
			currentFilter.type === "tag"
				? [
						...matching,
						...allItems.filter((item) => !matchingSet.has(item)),
					]
				: allItems;
		const fragment = document.createDocumentFragment();
		orderedItems.forEach((item) => {
			fragment.appendChild(item);
		});
		postList.appendChild(fragment);

		allItems.forEach((item) => {
			item.classList.toggle("hidden", !pageItems.has(item));
		});

		updatePaginationUI(currentPage, totalPages);

		noResults?.classList.toggle(
			"hidden",
			currentFilter.type === "none" || matching.length > 0,
		);
	}

	function buildPageNumbers(page: number, totalPages: number): number[] {
		const pages: number[] = [];
		const delta = 2;

		pages.push(1);

		const rangeStart = Math.max(2, page - delta);
		const rangeEnd = Math.min(totalPages - 1, page + delta);

		if (rangeStart > 2) {
			pages.push(-1);
		}

		for (let i = rangeStart; i <= rangeEnd; i++) {
			pages.push(i);
		}

		if (rangeEnd < totalPages - 1) {
			pages.push(-1);
		}

		if (totalPages > 1) {
			pages.push(totalPages);
		}

		return pages;
	}

	function toggleBtnDisabled(id: string, disabled: boolean) {
		const btn = document.getElementById(id);
		if (!btn) {
			return;
		}
		btn.classList.toggle("disabled", disabled);
		if (disabled) {
			btn.setAttribute("aria-disabled", "true");
		} else {
			btn.removeAttribute("aria-disabled");
		}
	}

	function updatePaginationUI(page: number, totalPages: number) {
		const container = document.getElementById("archive-pagination");
		if (!container) {
			return;
		}

		container.classList.toggle("hidden", totalPages <= 1);
		if (totalPages <= 1) {
			return;
		}

		const pages = buildPageNumbers(page, totalPages);
		const numbersEl = document.getElementById("page-numbers");
		if (numbersEl) {
			numbersEl.innerHTML = pages
				.map((p) =>
					p === -1
						? '<span class="px-1 text-50">...</span>'
						: p === page
							? `<span class="page-num active">${p}</span>`
							: `<button class="page-num" data-page="${p}">${p}</button>`,
				)
				.join("");
		}

		toggleBtnDisabled("page-prev", page <= 1);
		toggleBtnDisabled("page-next", page >= totalPages);
	}

	function scrollToPostList() {
		getPostList()?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	}

	function updateFilterStatus(filter: FilterState) {
		const { filterStatus, filterLabel } = getFilterElements();
		if (!filterStatus || !filterLabel) {
			return;
		}

		if (filter.type === "none") {
			filterStatus.classList.add("hidden");
			return;
		}

		filterStatus.classList.remove("hidden");
		if (filter.type === "tag") {
			const selectedTags = getSelectedTags(filter);
			filterLabel.textContent = `标签：${selectedTags.join("、")}`;
		} else if (filter.type === "category") {
			filterLabel.textContent = isUncategorizedValue(filter.value)
				? UNCATEGORIZED_LABEL || "未分类"
				: `分类：${filter.value}`;
		} else if (filter.type === "calendar") {
			filterLabel.textContent = `日期：${filter.value}`;
		}
	}

	function updateButtonStates(filter: FilterState) {
		document
			.querySelectorAll<HTMLElement>(".archive-filter-btn")
			.forEach((btn) => btn.classList.remove("active"));

		if (filter.type === "none") {
			return;
		}

		if (filter.type === "tag") {
			const selectedTags = getSelectedTags(filter);
			selectedTags.forEach((tag) => {
				const selector = `.archive-filter-btn[data-filter="tag"][data-value="${CSS.escape(tag)}"]`;
				document
					.querySelector<HTMLElement>(selector)
					?.classList.add("active");
			});
		}

		if (filter.type === "category") {
			const selector = `.archive-filter-btn[data-filter="category"][data-value="${CSS.escape(filter.value)}"]`;
			document
				.querySelector<HTMLElement>(selector)
				?.classList.add("active");
		}
	}

	function applyFilter(filter: FilterState) {
		currentFilter = filter;
		currentPage = 1;
		renderPosts();
		updateFilterStatus(filter);
		updateButtonStates(filter);
	}

	function clearAllFilters() {
		window.dispatchEvent(new CustomEvent("calendarFilterClear"));

		currentFilter = { type: "none", value: "" };
		currentPage = 1;
		renderPosts();
		updateFilterStatus({ type: "none", value: "" });
		updateButtonStates({ type: "none", value: "" });
	}

	// --- 使用 AbortController 注册所有事件，便于清理 ---
	const ac = new AbortController();
	const signal = ac.signal;

	// 分类/标签按钮点击（事件委托）
	document.addEventListener(
		"click",
		(e) => {
			const btn = (e.target as HTMLElement)?.closest<HTMLElement>(
				".archive-filter-btn",
			);
			if (!btn) {
				return;
			}

			const filterType = btn.dataset.filter as "tag" | "category";
			const filterValue = btn.dataset.value || "";
			if (!filterType || !filterValue) {
				return;
			}

			window.dispatchEvent(new CustomEvent("calendarFilterClear"));
			if (filterType === "tag") {
				const selectedTags =
					currentFilter.type === "tag"
						? getSelectedTags(currentFilter)
						: [];
				const nextSelected = selectedTags.includes(filterValue)
					? selectedTags.filter((tag) => tag !== filterValue)
					: normalizeTagList([...selectedTags, filterValue]);

				if (nextSelected.length === 0) {
					clearAllFilters();
					return;
				}

				applyFilter({
					type: "tag",
					value: nextSelected.join("、"),
					values: nextSelected,
				});
				return;
			}

			if (
				currentFilter.type === "category" &&
				currentFilter.value === filterValue
			) {
				clearAllFilters();
				return;
			}

			applyFilter({ type: "category", value: filterValue });
		},
		{ signal },
	);

	// 清除按钮
	getFilterElements().filterClearBtn?.addEventListener(
		"click",
		() => {
			clearAllFilters();
		},
		{ signal },
	);

	// 监听日历筛选事件
	window.addEventListener(
		"calendarFilterChange",
		(event) => {
			// 仅在 archive 页面处理
			if (!document.querySelector(".archive-posts")) {
				return;
			}

			const detail = (
				event as CustomEvent<{
					type: "day" | "month" | "year";
					key: string;
					label?: string;
				}>
			).detail;
			if (!detail) {
				return;
			}

			currentFilter = {
				type: "calendar",
				value: detail.label || detail.key,
				calendarType: detail.type,
				calendarKey: detail.key,
			};

			// 延迟一帧，覆盖 PostPage 的日历筛选结果
			requestAnimationFrame(() => {
				currentPage = 1;
				renderPosts();
				updateFilterStatus(currentFilter);
				updateButtonStates(currentFilter);
			});
		},
		{ signal },
	);

	// 监听日历清除事件
	window.addEventListener(
		"calendarFilterClear",
		() => {
			if (currentFilter.type === "calendar") {
				currentFilter = { type: "none", value: "" };
				currentPage = 1;
				requestAnimationFrame(() => {
					renderPosts();
					updateFilterStatus({ type: "none", value: "" });
					updateButtonStates({ type: "none", value: "" });
				});
			}
		},
		{ signal },
	);

	// 分页按钮事件
	document.addEventListener(
		"click",
		(e) => {
			const target = e.target as HTMLElement;

			// 上一页
			if (target.id === "page-prev" || target.closest("#page-prev")) {
				if (currentPage > 1) {
					currentPage--;
					renderPosts();
					scrollToPostList();
				}
				return;
			}

			// 下一页
			if (target.id === "page-next" || target.closest("#page-next")) {
				const matching = getMatchingItems(currentFilter);
				const totalPages = Math.max(
					1,
					Math.ceil(matching.length / POSTS_PER_PAGE),
				);
				if (currentPage < totalPages) {
					currentPage++;
					renderPosts();
					scrollToPostList();
				}
				return;
			}

			// 页码按钮
			const pageBtn = target.closest<HTMLElement>("[data-page]");
			if (pageBtn) {
				const page = Number(pageBtn.dataset.page);
				if (page && page !== currentPage) {
					currentPage = page;
					renderPosts();
					scrollToPostList();
				}
			}
		},
		{ signal },
	);

	// 注册清理函数，下次 init 或离开页面时调用
	rw.__archiveFilterCleanup = () => {
		ac.abort();
		rw.__archiveFilterCleanup = undefined;
	};

	// --- 根据 URL 参数初始化 ---
	const params = new URLSearchParams(window.location.search);
	const tag = params.get("tag");
	const category = params.get("category");
	const uncategorized = params.get("uncategorized");

	const tagParams = params
		.getAll("tag")
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);

	if (tagParams.length > 0) {
		const selectedTags = normalizeTagList(tagParams);
		applyFilter({
			type: "tag",
			value: selectedTags.join("、"),
			values: selectedTags,
		});
	} else if (tag) {
		applyFilter({ type: "tag", value: tag, values: [tag] });
	} else if (category) {
		applyFilter({ type: "category", value: category });
	} else if (uncategorized) {
		applyFilter({ type: "category", value: "uncategorized" });
	} else {
		// 初始渲染：应用分页
		renderPosts();
	}
}
