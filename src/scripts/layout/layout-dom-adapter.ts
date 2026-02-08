import type { LayoutState } from "./layout-state";

export type LayoutDomAdapterDeps = {
	bannerHeight: number;
	bannerHeightHome: number;
	bannerHeightExtend: number;
	updateBannerCarouselState: () => void;
};

type TransitionTarget = HTMLElement | null;

function suppressTransitions(targets: TransitionTarget[]): () => void {
	const validTargets = targets.filter(Boolean) as HTMLElement[];
	for (const target of validTargets) {
		target.style.transition = "none";
	}
	return () => {
		requestAnimationFrame(() => {
			for (const target of validTargets) {
				target.style.removeProperty("transition");
			}
		});
	};
}

function syncBodyState(next: LayoutState): void {
	const body = document.body;
	const isBannerMode = next.mode === "banner";

	body.dataset.layoutMode = next.mode;
	body.dataset.routeHome = String(next.isHome);

	// Legacy classes are preserved as compatibility layer for existing utility styles.
	body.classList.toggle("lg:is-home", next.isHome);
	body.classList.toggle("enable-banner", isBannerMode);
	body.classList.toggle("no-banner-mode", !isBannerMode);
	body.classList.toggle("waves-paused", !isBannerMode);
	body.classList.toggle("scroll-collapsed-banner", next.mode === "collapsed");
}

function syncBannerAndMainPanel(next: LayoutState): void {
	const isBannerMode = next.mode === "banner";
	const bannerWrapper = document.getElementById("banner-wrapper");
	const mainPanelWrapper = document.querySelector(
		".main-panel-wrapper",
	) as HTMLElement | null;

	if (bannerWrapper) {
		bannerWrapper.classList.toggle("wallpaper-layer-hidden", !isBannerMode);
		bannerWrapper.classList.toggle("mobile-hide-banner", !isBannerMode);
		if (isBannerMode) {
			bannerWrapper.removeAttribute("aria-hidden");
			bannerWrapper.removeAttribute("inert");
			bannerWrapper.style.removeProperty("height");
		} else {
			bannerWrapper.setAttribute("aria-hidden", "true");
			bannerWrapper.setAttribute("inert", "");
		}
	}

	if (mainPanelWrapper) {
		mainPanelWrapper.classList.toggle(
			"mobile-main-no-banner",
			!isBannerMode,
		);
		mainPanelWrapper.classList.toggle("no-banner-layout", !isBannerMode);
	}
}

function syncNavbar(next: LayoutState): void {
	const navbar = document.getElementById("navbar");
	if (!navbar) {
		return;
	}

	navbar.setAttribute("data-is-home", String(next.isHome));
	const transparentMode =
		next.mode === "banner" ? next.navbarTransparentMode : "none";
	navbar.setAttribute("data-transparent-mode", transparentMode);
	navbar.removeAttribute("data-dynamic-transparent");

	const shouldBeScrolled =
		next.mode === "banner" &&
		next.navbarTransparentMode === "semifull" &&
		next.scrollTop > 50;
	navbar.classList.toggle("scrolled", shouldBeScrolled);

	document
		.getElementById("navbar-wrapper")
		?.classList.remove("navbar-hidden");
}

function syncToc(next: LayoutState, deps: LayoutDomAdapterDeps): void {
	const tocWrapper = document.getElementById("toc-wrapper");
	if (!tocWrapper) {
		return;
	}

	if (next.mode !== "banner") {
		tocWrapper.classList.remove("toc-hide");
		return;
	}

	const thresholdBase = next.isHome
		? deps.bannerHeightHome
		: deps.bannerHeight;
	const threshold = window.innerHeight * (thresholdBase / 100);
	tocWrapper.classList.toggle("toc-hide", next.scrollTop <= threshold);
}

function compensateScrollForCollapse(deps: LayoutDomAdapterDeps): void {
	const currentScroll = document.documentElement.scrollTop;
	const bannerHeightPx = window.innerHeight * (deps.bannerHeight / 100);
	const bannerHeightExtendPx = Math.floor(
		window.innerHeight * (deps.bannerHeightExtend / 100),
	);
	const delta = bannerHeightPx + bannerHeightExtendPx - 88;
	window.scrollTo(0, Math.max(0, currentScroll - delta));
}

function shouldRestoreTopOnExpand(
	prev: LayoutState | null,
	next: LayoutState,
): boolean {
	return (
		prev?.mode === "collapsed" &&
		next.mode === "banner" &&
		next.reason === "logo-click"
	);
}

export function applyLayoutState(
	prev: LayoutState | null,
	next: LayoutState,
	deps: LayoutDomAdapterDeps,
): void {
	const mainPanelWrapper = document.querySelector(
		".main-panel-wrapper",
	) as HTMLElement | null;
	const mainGrid = document.getElementById("main-grid") as HTMLElement | null;
	const topRow = document.getElementById("top-row") as HTMLElement | null;

	const collapsingFromBanner =
		prev?.mode === "banner" && next.mode === "collapsed";
	const restoreTransitions = collapsingFromBanner
		? suppressTransitions([mainPanelWrapper, mainGrid, topRow])
		: () => {
				// no-op
			};

	syncBodyState(next);
	syncBannerAndMainPanel(next);
	syncNavbar(next);
	syncToc(next, deps);

	if (collapsingFromBanner) {
		compensateScrollForCollapse(deps);
	}

	if (shouldRestoreTopOnExpand(prev, next)) {
		window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
	}

	restoreTransitions();

	requestAnimationFrame(() => {
		deps.updateBannerCarouselState();
	});
}
