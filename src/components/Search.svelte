<script lang="ts">
import Icon from "@iconify/svelte";
import { url } from "@utils/url-utils";
import { onMount } from "svelte";
import type { SearchResult } from "@/global";
import { navigateToPage } from "@utils/navigation-utils";

let keywordDesktop = "";
let keywordMobile = "";
let result: SearchResult[] = [];
let isSearching = false;
let pagefindLoaded = false;
let initialized = false;

const fakeResult: SearchResult[] = [
	{
		url: url("/"),
		meta: {
			title: "This Is a Fake Search Result",
		},
		excerpt:
			"Because the search cannot work in the <mark>dev</mark> environment.",
	},
	{
		url: url("/"),
		meta: {
			title: "If You Want to Test the Search",
		},
		excerpt: "Try running <mark>npm build && npm preview</mark> instead.",
	},
];

const togglePanel = () => {
	const panel = document.getElementById("search-panel");
	panel?.classList.toggle("float-panel-closed");
};

const setPanelVisibility = (show: boolean, isDesktop: boolean): void => {
	const panel = document.getElementById("search-panel");
	if (!panel || !isDesktop) return;

	if (show) {
		panel.classList.remove("float-panel-closed");
	} else {
		panel.classList.add("float-panel-closed");
	}
};

const closeSearchPanel = (): void => {
	const panel = document.getElementById("search-panel");
	if (panel) {
		panel.classList.add("float-panel-closed");
	}
	// 清空搜索关键词和结果
	keywordDesktop = "";
	keywordMobile = "";
	result = [];
};

const handleResultClick = (event: Event, url: string): void => {
	event.preventDefault();
	closeSearchPanel();
	navigateToPage(url);
};

const search = async (keyword: string, isDesktop: boolean): Promise<void> => {
	if (!keyword) {
		setPanelVisibility(false, isDesktop);
		result = [];
		return;
	}

	if (!initialized) {
		return;
	}

	isSearching = true;

	try {
		let searchResults: SearchResult[] = [];

		if (import.meta.env.PROD && pagefindLoaded && window.pagefind) {
			const response = await window.pagefind.search(keyword);
			searchResults = await Promise.all(
				response.results.map((item) => item.data()),
			);
		} else if (import.meta.env.DEV) {
			searchResults = fakeResult;
		} else {
			searchResults = [];
			console.error("Pagefind is not available in production environment.");
		}

		result = searchResults;
		setPanelVisibility(result.length > 0, isDesktop);
	} catch (error) {
		console.error("Search error:", error);
		result = [];
		setPanelVisibility(false, isDesktop);
	} finally {
		isSearching = false;
	}
};

onMount(() => {
	const initializeSearch = () => {
		initialized = true;
		pagefindLoaded =
			typeof window !== "undefined" &&
			!!window.pagefind &&
			typeof window.pagefind.search === "function";
		console.log("Pagefind status on init:", pagefindLoaded);
		if (keywordDesktop) search(keywordDesktop, true);
		if (keywordMobile) search(keywordMobile, false);
	};

	if (import.meta.env.DEV) {
		console.log(
			"Pagefind is not available in development mode. Using mock data.",
		);
		initializeSearch();
	} else {
		document.addEventListener("pagefindready", () => {
			console.log("Pagefind ready event received.");
			initializeSearch();
		});
		document.addEventListener("pagefindloaderror", () => {
			console.warn(
				"Pagefind load error event received. Search functionality will be limited.",
			);
			initializeSearch(); // Initialize with pagefindLoaded as false
		});

		// Fallback in case events are not caught or pagefind is already loaded by the time this script runs
		setTimeout(() => {
			if (!initialized) {
				console.log("Fallback: Initializing search after timeout.");
				initializeSearch();
			}
		}, 2000); // Adjust timeout as needed
	}
});

$: if (initialized && keywordDesktop) {
	(async () => {
		await search(keywordDesktop, true);
	})();
}

$: if (initialized && keywordMobile) {
	(async () => {
		await search(keywordMobile, false);
	})();
}
</script>

<!-- search bar for desktop view -->
<div
  id="search-bar"
  role="search"
  class="hidden lg:flex relative items-center h-11 mr-2 rounded-full
    bg-white/40 dark:bg-white/10 backdrop-blur-md
    border border-white/40 dark:border-white/15
    shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.05)]
    hover:bg-white/60 focus-within:bg-white/60 dark:hover:bg-white/15 dark:focus-within:bg-white/15
    focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/20
    transition-all duration-300 ease-out group
    w-40 hover:w-60 focus-within:w-60 hover:ml-[-5rem] focus-within:ml-[-5rem]"
  style="transition-timing-function:cubic-bezier(0.2,0,0,1)"
>
  <Icon
    icon="material-symbols:search"
    class="absolute left-3 text-[1.25rem] pointer-events-none my-auto
      text-black/60 dark:text-white/60 transition-colors duration-300
      group-focus-within:text-black/80 dark:group-focus-within:text-white/80"
  />
  <input
    placeholder="搜索"
    bind:value={keywordDesktop}
    on:focus={() => search(keywordDesktop, true)}
    class="pl-10 pr-3 text-sm bg-transparent outline-0 h-full w-full
      text-black/90 dark:text-white/90 placeholder:text-black/50 dark:placeholder:text-white/50"
    type="search"
  />
</div>

<!-- toggle btn for phone/tablet view -->
<button on:click={togglePanel} aria-label="Search Panel" id="search-switch"
        class="btn-plain scale-animation lg:!hidden rounded-lg w-11 h-11 active:scale-90">
    <Icon icon="material-symbols:search" class="text-[1.25rem]"></Icon>
</button>

<!-- search panel -->
<div id="search-panel" class="float-panel float-panel-closed search-panel absolute md:w-[30rem]
top-20 left-4 md:left-[unset] right-4 shadow-2xl rounded-2xl p-2">

    <!-- search bar inside panel for phone/tablet -->
    <div
      id="search-bar-inside"
      class="flex relative lg:hidden items-center h-11 rounded-full px-0
        bg-[var(--btn-regular-bg)] border border-black/10 dark:border-white/10
        shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.05)]
        focus-within:bg-[var(--btn-regular-bg-hover)] hover:bg-[var(--btn-regular-bg-hover)]
        focus-within:ring-2 focus-within:ring-[var(--primary)] focus-within:ring-opacity-60
        transition-all duration-300 ease-out"
      style="transition-timing-function:cubic-bezier(0.2,0,0,1)"
    >
      <Icon
        icon="material-symbols:search"
        class="absolute left-3 text-[1.25rem] pointer-events-none my-auto
          text-black/60 dark:text-white/60 transition-colors duration-300"
      />
      <input
        placeholder="搜索"
        bind:value={keywordMobile}
        class="pl-10 pr-3 flex-1 h-full text-sm bg-transparent outline-0
          text-black/90 dark:text-white/90 placeholder:text-black/50 dark:placeholder:text-white/50"
        type="search"
      />
    </div>

    <!-- search results -->
    {#each result as item}
        <a href={item.url}
           on:click={(e) => handleResultClick(e, item.url)}
           class="transition first-of-type:mt-2 lg:first-of-type:mt-0 group block
       rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]">
            <div class="transition text-90 inline-flex font-bold group-hover:text-[var(--primary)]">
                {item.meta.title}<Icon icon="fa6-solid:chevron-right" class="transition text-[0.75rem] translate-x-1 my-auto text-[var(--primary)]"></Icon>
            </div>
            <div class="transition text-sm text-50">
                {@html item.excerpt}
            </div>
        </a>
    {/each}
</div>

<style>
  input:focus {
    outline: 0;
  }
  .search-panel {
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
</style>
