/**
 * Album list page filter logic.
 *
 * Adapted from archive-filter.ts — simplified to only handle tag/category
 * filtering without calendar or pagination (albums are few enough to show all).
 *
 * Initialization is handled by `runDynamicPageInit()` in layout/index.ts.
 */

type FilterState = {
	tags: string[];
	category: string | null;
};

type AlbumFilterRuntimeWindow = Window &
	typeof globalThis & {
		__albumFilterCleanup?: () => void;
	};

export function initAlbumFilter(): void {
	const rw = window as AlbumFilterRuntimeWindow;
	rw.__albumFilterCleanup?.();

	const albumRoot = document.querySelector<HTMLElement>(".album-list-root");
	if (!albumRoot) {
		return;
	}

	let currentFilter: FilterState = {
		tags: [],
		category: null,
	};

	function getAlbumItems(): HTMLElement[] {
		return Array.from(
			document.querySelectorAll<HTMLElement>(".album-list-item"),
		);
	}
	function getNoResults() {
		return document.getElementById("album-no-results");
	}
	function getFilterElements() {
		return {
			filterStatus: document.getElementById("album-filter-status"),
			filterLabel: document.getElementById("album-filter-status-label"),
			filterClearBtn: document.getElementById("album-filter-clear-btn"),
		};
	}

	function normalizeTagList(tags: string[]): string[] {
		const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
		return Array.from(new Set(normalized));
	}

	function getSelectedTags(filter: FilterState): string[] {
		return normalizeTagList(filter.tags);
	}

	function hasActiveFilters(filter: FilterState): boolean {
		return getSelectedTags(filter).length > 0 || filter.category !== null;
	}

	function parseItemTags(item: HTMLElement): string[] {
		try {
			const parsed = JSON.parse(item.dataset.tags || "[]") as unknown;
			return Array.isArray(parsed)
				? parsed.map((tag) => String(tag))
				: [];
		} catch {
			return [];
		}
	}

	function getMatchingItems(filter: FilterState): Set<HTMLElement> {
		const allItems = getAlbumItems();
		const selectedTags = getSelectedTags(filter);
		const hasTagFilter = selectedTags.length > 0;
		const hasCategoryFilter = filter.category !== null;

		if (!hasTagFilter && !hasCategoryFilter) {
			return new Set(allItems);
		}

		const matched = new Set<HTMLElement>();
		for (const item of allItems) {
			const tagMatched =
				!hasTagFilter ||
				(() => {
					const itemTags = parseItemTags(item);
					return selectedTags.every((tag) => itemTags.includes(tag));
				})();
			const categoryMatched =
				!hasCategoryFilter || item.dataset.category === filter.category;

			if (tagMatched && categoryMatched) {
				matched.add(item);
			}
		}
		return matched;
	}

	function render() {
		const allItems = getAlbumItems();
		const noResults = getNoResults();
		const matching = getMatchingItems(currentFilter);

		allItems.forEach((item) => {
			item.classList.toggle("hidden", !matching.has(item));
		});

		noResults?.classList.toggle(
			"hidden",
			!hasActiveFilters(currentFilter) || matching.size > 0,
		);
	}

	function updateFilterStatus(filter: FilterState) {
		const { filterStatus, filterLabel } = getFilterElements();
		if (!filterStatus || !filterLabel) {
			return;
		}

		if (!hasActiveFilters(filter)) {
			filterStatus.classList.add("hidden");
			return;
		}

		filterStatus.classList.remove("hidden");

		const segments: string[] = [];
		const selectedTags = getSelectedTags(filter);
		if (selectedTags.length > 0) {
			segments.push(`标签：${selectedTags.join("、")}`);
		}
		if (filter.category) {
			segments.push(`分类：${filter.category}`);
		}

		filterLabel.textContent = segments.join(" ｜ ");
	}

	function updateButtonStates(filter: FilterState) {
		document
			.querySelectorAll<HTMLElement>(".album-filter-btn")
			.forEach((btn) => btn.classList.remove("active"));

		const selectedTags = getSelectedTags(filter);
		selectedTags.forEach((tag) => {
			const selector = `.album-filter-btn[data-filter="tag"][data-value="${CSS.escape(tag)}"]`;
			document
				.querySelector<HTMLElement>(selector)
				?.classList.add("active");
		});

		if (filter.category) {
			const selector = `.album-filter-btn[data-filter="category"][data-value="${CSS.escape(filter.category)}"]`;
			document
				.querySelector<HTMLElement>(selector)
				?.classList.add("active");
		}
	}

	function applyFilter(filter: FilterState) {
		currentFilter = filter;
		render();
		updateFilterStatus(filter);
		updateButtonStates(filter);
	}

	function clearAllFilters() {
		currentFilter = { tags: [], category: null };
		render();
		updateFilterStatus(currentFilter);
		updateButtonStates(currentFilter);
	}

	// --- Events via AbortController ---
	const ac = new AbortController();
	const signal = ac.signal;

	document.addEventListener(
		"click",
		(e) => {
			const btn = (e.target as HTMLElement)?.closest<HTMLElement>(
				".album-filter-btn",
			);
			if (!btn) {
				return;
			}

			const filterType = btn.dataset.filter as "tag" | "category";
			const filterValue = btn.dataset.value || "";
			if (!filterType || !filterValue) {
				return;
			}

			if (filterType === "tag") {
				const selectedTags = getSelectedTags(currentFilter);
				const nextSelected = selectedTags.includes(filterValue)
					? selectedTags.filter((tag) => tag !== filterValue)
					: normalizeTagList([...selectedTags, filterValue]);

				applyFilter({ ...currentFilter, tags: nextSelected });
				return;
			}

			applyFilter({
				...currentFilter,
				category:
					currentFilter.category === filterValue ? null : filterValue,
			});
		},
		{ signal },
	);

	getFilterElements().filterClearBtn?.addEventListener(
		"click",
		() => clearAllFilters(),
		{ signal },
	);

	rw.__albumFilterCleanup = () => {
		ac.abort();
		rw.__albumFilterCleanup = undefined;
	};

	// --- URL params init ---
	const params = new URLSearchParams(window.location.search);
	const tagParams = params
		.getAll("tag")
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
	const category = params.get("category");

	if (tagParams.length > 0) {
		currentFilter.tags = normalizeTagList(tagParams);
	}
	if (category) {
		currentFilter.category = category;
	}

	if (hasActiveFilters(currentFilter)) {
		applyFilter(currentFilter);
	} else {
		render();
	}
}
