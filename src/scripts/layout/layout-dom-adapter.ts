import type { LayoutState } from "./layout-state";

export type LayoutDomAdapterDeps = {
	bannerHeight: number;
	bannerHeightHome: number;
	bannerHeightExtend: number;
	updateBannerCarouselState: () => void;
};

type LayoutDomRuntimeWindow = Window &
	typeof globalThis & {
		__layoutCollapseScrollAnimationId?: number;
		__layoutNavbarEnterTimeoutId?: number;
	};

const NAVBAR_ENTERING_CLASS = "layout-navbar-entering";
const COLLAPSED_MAIN_PANEL_TOP_REM = 5.5;

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

function getLayoutTransitionDurationMs(): number {
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue("--layout-mode-transition-duration")
		.trim();
	if (raw.endsWith("ms")) {
		const value = Number.parseFloat(raw);
		return Number.isFinite(value) && value > 0 ? value : 500;
	}
	if (raw.endsWith("s")) {
		const value = Number.parseFloat(raw);
		return Number.isFinite(value) && value > 0 ? value * 1000 : 500;
	}
	return 500;
}

function getCollapseTargetScroll(
	currentScroll: number,
	deps: LayoutDomAdapterDeps,
): number {
	const bannerHeightPx = window.innerHeight * (deps.bannerHeight / 100);
	const bannerHeightExtendPx = Math.floor(
		window.innerHeight * (deps.bannerHeightExtend / 100),
	);
	const delta = bannerHeightPx + bannerHeightExtendPx - 88;
	return Math.max(0, currentScroll - delta);
}

function easeOutQuart(value: number): number {
	return 1 - Math.pow(1 - value, 4);
}

function resolveCollapseAnchor(): HTMLElement | null {
	return (
		document.getElementById("content-wrapper") ??
		document.getElementById("main-grid")
	);
}

function getCollapsedMainPanelTopPx(): number {
	const rootFontSize = Number.parseFloat(
		getComputedStyle(document.documentElement).fontSize,
	);
	const pxPerRem =
		Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
	return COLLAPSED_MAIN_PANEL_TOP_REM * pxPerRem;
}

function compensateScrollForCollapse(deps: LayoutDomAdapterDeps): void {
	const documentRoot = document.documentElement;
	const currentScroll = documentRoot.scrollTop;
	const targetScroll = getCollapseTargetScroll(currentScroll, deps);
	const scrollDistance = targetScroll - currentScroll;

	if (Math.abs(scrollDistance) < 1) {
		return;
	}

	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		window.scrollTo({ top: targetScroll, behavior: "instant" });
		return;
	}

	const runtimeWindow = window as LayoutDomRuntimeWindow;
	if (runtimeWindow.__layoutCollapseScrollAnimationId !== undefined) {
		cancelAnimationFrame(runtimeWindow.__layoutCollapseScrollAnimationId);
		runtimeWindow.__layoutCollapseScrollAnimationId = undefined;
	}

	const anchor = resolveCollapseAnchor();
	if (!anchor) {
		window.scrollTo({ top: targetScroll, behavior: "instant" });
		return;
	}

	const startViewportTop = anchor.getBoundingClientRect().top;
	const targetViewportTop = getCollapsedMainPanelTopPx();
	const minScroll = Math.min(currentScroll, targetScroll);
	const maxScroll = currentScroll;
	const duration = getLayoutTransitionDurationMs();
	const startTime = performance.now();

	const USER_SCROLL_THRESHOLD = 2;
	let lastSetScroll = currentScroll;

	const animate = (now: number): void => {
		const actualScroll = documentRoot.scrollTop;
		if (Math.abs(actualScroll - lastSetScroll) > USER_SCROLL_THRESHOLD) {
			runtimeWindow.__layoutCollapseScrollAnimationId = undefined;
			return;
		}

		const elapsed = now - startTime;
		const progress = Math.min(1, elapsed / duration);
		const eased = easeOutQuart(progress);
		const desiredViewportTop =
			startViewportTop + (targetViewportTop - startViewportTop) * eased;
		const currentViewportTop = anchor.getBoundingClientRect().top;
		const correction = currentViewportTop - desiredViewportTop;
		const nextScroll = Math.min(
			maxScroll,
			Math.max(minScroll, documentRoot.scrollTop + correction),
		);
		window.scrollTo({ top: nextScroll, behavior: "instant" });
		lastSetScroll = nextScroll;

		if (progress < 1) {
			runtimeWindow.__layoutCollapseScrollAnimationId =
				requestAnimationFrame(animate);
			return;
		}

		const finalViewportTop = anchor.getBoundingClientRect().top;
		const finalCorrection = finalViewportTop - targetViewportTop;
		const finalScroll = Math.min(
			maxScroll,
			Math.max(minScroll, documentRoot.scrollTop + finalCorrection),
		);
		window.scrollTo({ top: finalScroll, behavior: "instant" });
		lastSetScroll = finalScroll;
		runtimeWindow.__layoutCollapseScrollAnimationId = undefined;
	};

	runtimeWindow.__layoutCollapseScrollAnimationId =
		requestAnimationFrame(animate);
}

function isSwupTransitioning(): boolean {
	const html = document.documentElement;
	return (
		html.classList.contains("is-changing") ||
		html.classList.contains("is-animating")
	);
}

function clearNavbarEnterAnimation(
	runtimeWindow: LayoutDomRuntimeWindow,
): void {
	if (runtimeWindow.__layoutNavbarEnterTimeoutId !== undefined) {
		window.clearTimeout(runtimeWindow.__layoutNavbarEnterTimeoutId);
		runtimeWindow.__layoutNavbarEnterTimeoutId = undefined;
	}
	document
		.getElementById("navbar-wrapper")
		?.classList.remove(NAVBAR_ENTERING_CLASS);
}

function triggerNavbarEnterAnimation(
	runtimeWindow: LayoutDomRuntimeWindow,
): void {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return;
	}

	const navbarWrapper = document.getElementById("navbar-wrapper");
	if (!(navbarWrapper instanceof HTMLElement)) {
		return;
	}

	clearNavbarEnterAnimation(runtimeWindow);
	// Force reflow to reliably restart animation if user quickly re-enters.
	void navbarWrapper.offsetHeight;
	navbarWrapper.classList.add(NAVBAR_ENTERING_CLASS);

	runtimeWindow.__layoutNavbarEnterTimeoutId = window.setTimeout(() => {
		navbarWrapper.classList.remove(NAVBAR_ENTERING_CLASS);
		runtimeWindow.__layoutNavbarEnterTimeoutId = undefined;
	}, getLayoutTransitionDurationMs() + 80);
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
	const runtimeWindow = window as LayoutDomRuntimeWindow;
	if (
		next.mode !== "collapsed" &&
		runtimeWindow.__layoutCollapseScrollAnimationId !== undefined
	) {
		cancelAnimationFrame(runtimeWindow.__layoutCollapseScrollAnimationId);
		runtimeWindow.__layoutCollapseScrollAnimationId = undefined;
	}
	if (next.mode !== "collapsed") {
		clearNavbarEnterAnimation(runtimeWindow);
	}

	const collapsingFromBanner =
		prev?.mode === "banner" && next.mode === "collapsed";

	syncBodyState(next);
	syncBannerAndMainPanel(next);
	syncNavbar(next);
	syncToc(next, deps);

	if (collapsingFromBanner && !isSwupTransitioning()) {
		triggerNavbarEnterAnimation(runtimeWindow);
		compensateScrollForCollapse(deps);
	}

	if (shouldRestoreTopOnExpand(prev, next)) {
		window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
	}

	requestAnimationFrame(() => {
		deps.updateBannerCarouselState();
	});
}
