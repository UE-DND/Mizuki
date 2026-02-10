import { updateBannerCarouselState } from "./banner-carousel";

type ScrollUiOptions = {
	bannerEnabled: boolean;
	bannerHeight: number;
	bannerHeightHome: number;
	bannerHeightExtend: number;
};

function throttle(func: () => void, limit: number): () => void {
	let inThrottle = false;
	return () => {
		if (inThrottle) {
			return;
		}
		func();
		inThrottle = true;
		window.setTimeout(() => {
			inThrottle = false;
		}, limit);
	};
}

// --- Scroll-collapse state ---
let isBannerCollapsedByScroll = false;
let collapseCooldown = false;

/**
 * Reset the scroll-collapse state.
 * Called on Swup page transitions so that navigating away from the homepage
 * (or back to it) starts with a clean slate.
 */
export function resetScrollCollapseState(): void {
	isBannerCollapsedByScroll = false;
	collapseCooldown = false;
	document.body.classList.remove("scroll-collapsed-banner");
}

function collapseHomeBanner(
	options: ScrollUiOptions,
	navbar: HTMLElement | null,
	toc: HTMLElement | null,
): void {
	if (isBannerCollapsedByScroll || collapseCooldown) {
		return;
	}
	isBannerCollapsedByScroll = true;
	collapseCooldown = true;

	const bannerWrapper = document.getElementById("banner-wrapper");

	// 1. Toggle body classes
	document.body.classList.remove("enable-banner");
	document.body.classList.add("no-banner-mode", "scroll-collapsed-banner");
	document.body.classList.add("waves-paused");

	// 2. Hide banner
	if (bannerWrapper) {
		bannerWrapper.classList.add("wallpaper-layer-hidden");
		bannerWrapper.setAttribute("aria-hidden", "true");
		bannerWrapper.setAttribute("inert", "");
	}

	// 3. Compensate scroll position to avoid visual "drop to bottom"
	// when collapsing banner layout into navbar layout.
	const bannerHeightExtendPx = Math.floor(
		window.innerHeight * (options.bannerHeightExtend / 100),
	);
	const bannerHeightPx = window.innerHeight * (options.bannerHeight / 100);
	const delta = bannerHeightPx + bannerHeightExtendPx - 88;
	const currentScroll = document.documentElement.scrollTop;
	window.scrollTo({
		top: Math.max(0, currentScroll - delta),
		behavior: "instant",
	});

	// 4. Update navbar – force opaque
	if (navbar) {
		const navbarInner = document.getElementById("navbar");
		if (navbarInner) {
			navbarInner.setAttribute("data-dynamic-transparent", "none");
			navbarInner.removeAttribute("data-transparent-mode");
		}
	}

	// 5. Show TOC if present
	if (toc) {
		toc.classList.remove("toc-hide");
	}

	// 6. Pause carousel
	updateBannerCarouselState();

	// Cooldown to prevent rapid re-triggers
	window.setTimeout(() => {
		collapseCooldown = false;
	}, 300);
}

function expandHomeBanner(): void {
	isBannerCollapsedByScroll = false;

	const bannerWrapper = document.getElementById("banner-wrapper");
	const navbarInner = document.getElementById("navbar");
	const configTransparentMode =
		navbarInner?.dataset.origTransparentMode || "semi";

	// 1. Toggle body classes
	document.body.classList.add("enable-banner");
	document.body.classList.remove("no-banner-mode", "scroll-collapsed-banner");
	document.body.classList.remove("waves-paused");

	// 2. Show banner
	if (bannerWrapper) {
		bannerWrapper.classList.remove("wallpaper-layer-hidden");
		bannerWrapper.removeAttribute("aria-hidden");
		bannerWrapper.removeAttribute("inert");
	}

	// 3. Restore navbar transparent mode
	if (navbarInner) {
		navbarInner.removeAttribute("data-dynamic-transparent");
		navbarInner.setAttribute(
			"data-transparent-mode",
			configTransparentMode,
		);
	}

	// 4. Scroll to top
	window.scrollTo(0, 0);

	// 5. Resume carousel
	updateBannerCarouselState();
}

export function setupScrollUi(options: ScrollUiOptions): void {
	const backToTopBtn = document.getElementById("back-to-top-btn");
	const toc = document.getElementById("toc-wrapper");
	const navbar = document.getElementById("navbar-wrapper");

	// 保存初始 transparent mode 供恢复时使用
	const navbarInner = document.getElementById("navbar");
	if (navbarInner && !navbarInner.dataset.origTransparentMode) {
		navbarInner.dataset.origTransparentMode =
			navbarInner.getAttribute("data-transparent-mode") || "semi";
	}

	// Logo 点击：首页折叠状态下恢复 banner
	const logo = document.getElementById("navbar-logo");
	if (logo) {
		logo.addEventListener("click", (e) => {
			if (!isBannerCollapsedByScroll) {
				return; // 未折叠，走默认导航
			}
			const isHome =
				document.body.classList.contains("lg:is-home") &&
				window.innerWidth >= 1024;
			if (!isHome) {
				return; // 非首页，走默认导航
			}
			e.preventDefault();
			expandHomeBanner();
		});
	}

	const scrollFunction = () => {
		const scrollTop = document.documentElement.scrollTop;
		const bannerHeightPx =
			window.innerHeight * (options.bannerHeight / 100);
		const contentWrapper = document.getElementById("content-wrapper");
		let showBackToTopThreshold = bannerHeightPx + 100;

		if (contentWrapper) {
			const rect = contentWrapper.getBoundingClientRect();
			const absoluteTop = rect.top + scrollTop;
			showBackToTopThreshold = absoluteTop + window.innerHeight / 4;
		}

		requestAnimationFrame(() => {
			if (backToTopBtn) {
				if (scrollTop > showBackToTopThreshold) {
					backToTopBtn.classList.remove("hide");
				} else {
					backToTopBtn.classList.add("hide");
				}
			}

			if (options.bannerEnabled && toc) {
				const isBannerMode =
					document.body.classList.contains("enable-banner");
				if (isBannerMode) {
					if (scrollTop > bannerHeightPx) {
						toc.classList.remove("toc-hide");
					} else {
						toc.classList.add("toc-hide");
					}
				} else {
					toc.classList.remove("toc-hide");
				}
			}

			if (options.bannerEnabled && navbar) {
				const isHome =
					document.body.classList.contains("lg:is-home") &&
					window.innerWidth >= 1024;
				const currentBannerHeight = isHome
					? options.bannerHeightHome
					: options.bannerHeight;

				const threshold =
					window.innerHeight * (currentBannerHeight / 100) - 88;

				// --- Scroll-collapse logic (desktop homepage only) ---
				if (
					isHome &&
					!isBannerCollapsedByScroll &&
					document.body.classList.contains("enable-banner")
				) {
					if (scrollTop >= threshold) {
						collapseHomeBanner(options, navbar, toc);
						return;
					}
				}
			}
		});
	};

	const handleResize = () => {
		let offset = Math.floor(
			window.innerHeight * (options.bannerHeightExtend / 100),
		);
		offset = offset - (offset % 4);
		document.documentElement.style.setProperty(
			"--banner-height-extend",
			`${offset}px`,
		);
	};
	window.onscroll = throttle(scrollFunction, 16);
	window.onresize = handleResize;

	handleResize();
}
