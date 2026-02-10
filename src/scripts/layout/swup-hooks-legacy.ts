import { resetScrollCollapseState } from "./scroll-ui-legacy";
import { scrollToHashBelowTocBaseline } from "@/utils/hash-scroll";
import { getTocBaselineOffset } from "@/utils/toc-offset";

type SwupHookDependencies = {
	bannerEnabled: boolean;
	bannerHeight: number;
	bannerHeightHome: number;
	initFancybox: () => Promise<void>;
	cleanupFancybox: () => void;
	checkKatex: () => void;
	initKatexScrollbars: () => void;
	updateBannerCarouselState: () => void;
	defaultTheme: string;
	darkMode: string;
	pathsEqual: (left: string, right: string) => boolean;
	url: (path: string) => string;
};

type SwupVisit = {
	to: {
		url?: unknown;
		path?: unknown;
		pathname?: unknown;
		href?: unknown;
		document?: Document;
	};
};

const BANNER_TO_SPEC_TRANSITION_CLASS = "layout-banner-to-spec-transition";
const BANNER_TO_SPEC_TRANSITION_ACTIVE_CLASS =
	"layout-banner-to-spec-transition-active";
const BANNER_TO_SPEC_TRANSITION_CONTENT_FADE_IN_CLASS =
	"layout-banner-to-spec-transition-content-fade-in";
const BANNER_TO_SPEC_SHIFT_VAR = "--layout-banner-route-up-shift";
const COLLAPSED_MAIN_PANEL_TOP = "5.5rem";
const SIDEBAR_OVERSHOOT_TOLERANCE_PX = 0.75;

function isCurrentHomeRoute(body: HTMLElement): boolean {
	if (body.dataset.routeHome === "true") {
		return true;
	}
	if (body.dataset.routeHome === "false") {
		return false;
	}
	return body.classList.contains("lg:is-home");
}

function normalizePathname(pathname: string): string {
	const normalized = pathname.replace(/\/+$/, "");
	return normalized === "" ? "/" : normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	return value as Record<string, unknown>;
}

function extractPathnameFromUnknown(value: unknown): string | null {
	if (value instanceof URL) {
		return normalizePathname(value.pathname);
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return null;
		}

		try {
			const parsed = new URL(trimmed, window.location.origin);
			return normalizePathname(parsed.pathname);
		} catch {
			const fallbackPath = trimmed.split("#")[0]?.split("?")[0] || "";
			if (!fallbackPath) {
				return null;
			}
			return normalizePathname(fallbackPath);
		}
	}

	const record = asRecord(value);
	if (!record) {
		return null;
	}

	return (
		extractPathnameFromUnknown(record.pathname) ??
		extractPathnameFromUnknown(record.path) ??
		extractPathnameFromUnknown(record.url) ??
		extractPathnameFromUnknown(record.href)
	);
}

function extractVisitPathname(visit: SwupVisit): string | null {
	const to = asRecord(visit.to);
	const fromVisitTarget =
		extractPathnameFromUnknown(to?.url) ??
		extractPathnameFromUnknown(to?.pathname) ??
		extractPathnameFromUnknown(to?.path) ??
		extractPathnameFromUnknown(to?.href) ??
		extractPathnameFromUnknown(
			to?.document instanceof Document ? to.document.URL : null,
		);
	if (fromVisitTarget) {
		return fromVisitTarget;
	}

	// Swup history navigation can provide target URL through history.state.
	const historyState = asRecord(history.state);
	return extractPathnameFromUnknown(historyState?.url);
}

function parseCssLengthToPx(lengthValue: string): number | null {
	const trimmed = lengthValue.trim();
	if (!trimmed) {
		return null;
	}

	const probe = document.createElement("div");
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.pointerEvents = "none";
	probe.style.height = trimmed;
	document.body.appendChild(probe);
	const measuredPx = probe.getBoundingClientRect().height;
	probe.remove();

	if (!Number.isFinite(measuredPx) || measuredPx <= 0) {
		return null;
	}

	return measuredPx;
}

function resolveTargetMainPanelTopPx(visit: SwupVisit): number {
	const targetMainPanel = visit.to.document?.querySelector<HTMLElement>(
		".main-panel-wrapper",
	);
	const inlineTop = targetMainPanel?.style.top?.trim() || "";
	const parsedInlineTop =
		inlineTop.length > 0 ? parseCssLengthToPx(inlineTop) : null;
	if (parsedInlineTop !== null) {
		return parsedInlineTop;
	}

	const collapsedTopPx = parseCssLengthToPx(COLLAPSED_MAIN_PANEL_TOP);
	if (collapsedTopPx !== null) {
		return collapsedTopPx;
	}

	return getTocBaselineOffset();
}

function resolveAnchorViewportTop(selector: string): number | null {
	const element = document.querySelector<HTMLElement>(selector);
	if (!(element instanceof HTMLElement)) {
		return null;
	}

	const rect = element.getBoundingClientRect();
	if (rect.height <= 0 || rect.width <= 0) {
		return null;
	}

	return rect.top;
}

function resolveBannerToSpecShiftPx(visit: SwupVisit): number {
	const targetTop = resolveTargetMainPanelTopPx(visit);
	const mainPanelTop = resolveAnchorViewportTop(".main-panel-wrapper");
	if (mainPanelTop === null) {
		return 0;
	}

	// Keep the main panel as the primary anchor so transition end aligns
	// exactly with the target layout top and avoids a tail "catch-up" snap.
	const rawMainShift = mainPanelTop - targetTop;
	if (rawMainShift <= 0) {
		return 0;
	}

	// Apply a safety cap only when a sidebar would move above navbar baseline.
	// This prevents overshoot while avoiding conservative under-shift.
	const sidebarCap = ["#sidebar", "#right-sidebar-slot"]
		.map((selector) => resolveAnchorViewportTop(selector))
		.filter((top): top is number => typeof top === "number")
		.map((top) => top - (targetTop - SIDEBAR_OVERSHOOT_TOLERANCE_PX))
		.reduce<number>(
			(minCap, candidate) => Math.min(minCap, candidate),
			Number.POSITIVE_INFINITY,
		);

	const resolvedShift = Number.isFinite(sidebarCap)
		? Math.min(rawMainShift, sidebarCap)
		: rawMainShift;

	return Math.max(0, Number(resolvedShift.toFixed(3)));
}

export function setupSwupHooks(deps: SwupHookDependencies): void {
	const runtimeWindow = window as Window &
		typeof globalThis & {
			swup?: {
				hooks?: {
					on: (
						event: string,
						callback: (...args: never[]) => void,
					) => void;
				};
			};
			mobileTOCInit?: () => void;
			floatingTOCInit?: () => void;
			initSemifullScrollDetection?: () => void;
		};

	const swup = runtimeWindow.swup;
	if (!swup?.hooks) {
		return;
	}

	let pendingBannerToSpecTransition = false;

	const clearBannerToSpecTransitionVisualState = (): void => {
		const root = document.documentElement;
		root.classList.remove(BANNER_TO_SPEC_TRANSITION_CLASS);
		root.classList.remove(BANNER_TO_SPEC_TRANSITION_ACTIVE_CLASS);
		root.classList.remove(BANNER_TO_SPEC_TRANSITION_CONTENT_FADE_IN_CLASS);
		root.style.removeProperty(BANNER_TO_SPEC_SHIFT_VAR);
		pendingBannerToSpecTransition = false;
	};

	swup.hooks.on("link:click", () => {
		document.documentElement.style.setProperty("--content-delay", "0ms");
	});

	swup.hooks.on("content:replace", () => {
		void deps.initFancybox();
		deps.checkKatex();
		deps.initKatexScrollbars();

		const tocElement = document.querySelector("table-of-contents") as
			| (HTMLElement & { init?: () => void })
			| null;
		const hasAnyTOCRuntime =
			typeof tocElement?.init === "function" ||
			typeof runtimeWindow.mobileTOCInit === "function" ||
			typeof runtimeWindow.floatingTOCInit === "function";

		if (hasAnyTOCRuntime) {
			window.setTimeout(() => {
				tocElement?.init?.();
				runtimeWindow.mobileTOCInit?.();
				runtimeWindow.floatingTOCInit?.();
			}, 100);
		}

		const navbar = document.getElementById("navbar");
		if (navbar) {
			const transparentMode = navbar.getAttribute(
				"data-transparent-mode",
			);
			if (transparentMode === "semifull") {
				if (
					typeof runtimeWindow.initSemifullScrollDetection ===
					"function"
				) {
					runtimeWindow.initSemifullScrollDetection?.();
				}
			}
		}

		// After container swap, crossfade in the new content while keeping
		// the global upward move continuous.
		if (pendingBannerToSpecTransition) {
			document.documentElement.classList.add(
				BANNER_TO_SPEC_TRANSITION_ACTIVE_CLASS,
			);
			document.documentElement.classList.add(
				BANNER_TO_SPEC_TRANSITION_CONTENT_FADE_IN_CLASS,
			);
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					document.documentElement.classList.remove(
						BANNER_TO_SPEC_TRANSITION_CONTENT_FADE_IN_CLASS,
					);
				});
			});
		}
	});

	swup.hooks.on("visit:start", (visit: SwupVisit) => {
		deps.cleanupFancybox();
		clearBannerToSpecTransitionVisualState();
		pendingBannerToSpecTransition = false;

		const targetPathname = extractVisitPathname(visit);
		const isTargetHome =
			targetPathname !== null &&
			deps.pathsEqual(targetPathname, deps.url("/"));
		const body = document.body;
		const currentPathname = normalizePathname(window.location.pathname);
		const currentIsHome =
			deps.pathsEqual(currentPathname, deps.url("/")) ||
			isCurrentHomeRoute(body);
		const shouldUseBannerToSpecTransition =
			deps.bannerEnabled &&
			currentIsHome &&
			targetPathname !== null &&
			!isTargetHome;

		if (shouldUseBannerToSpecTransition) {
			const root = document.documentElement;
			const shiftPx = resolveBannerToSpecShiftPx(visit);
			root.style.setProperty(BANNER_TO_SPEC_SHIFT_VAR, `${shiftPx}px`);
			root.classList.add(BANNER_TO_SPEC_TRANSITION_CLASS);
			pendingBannerToSpecTransition = true;
		}

		const isHomePage =
			targetPathname !== null &&
			deps.pathsEqual(targetPathname, deps.url("/"));
		const bannerWrapper = document.getElementById("banner-wrapper");
		const mainContentWrapper = document.querySelector(
			".absolute.w-full.z-30",
		);

		if (bannerWrapper && mainContentWrapper) {
			if (isHomePage) {
				requestAnimationFrame(() => {
					bannerWrapper.classList.remove("mobile-hide-banner");
					mainContentWrapper.classList.remove(
						"mobile-main-no-banner",
					);
				});
			} else {
				requestAnimationFrame(() => {
					bannerWrapper.classList.add("mobile-hide-banner");
					mainContentWrapper.classList.add("mobile-main-no-banner");
				});
			}
		}

		const heightExtend = document.getElementById("page-height-extend");
		if (heightExtend) {
			heightExtend.classList.remove("hidden");
		}

		const toc = document.getElementById("toc-wrapper");
		if (toc) {
			toc.classList.add("toc-not-ready");
		}
	});

	swup.hooks.on("animation:out:start", () => {
		if (!pendingBannerToSpecTransition) {
			return;
		}
		document.documentElement.classList.add(
			BANNER_TO_SPEC_TRANSITION_ACTIVE_CLASS,
		);
	});

	swup.hooks.on("page:view", () => {
		const hash = window.location.hash?.slice(1);

		resetScrollCollapseState();
		deps.updateBannerCarouselState();

		clearBannerToSpecTransitionVisualState();
		pendingBannerToSpecTransition = false;

		const isHomePage = deps.pathsEqual(
			window.location.pathname,
			deps.url("/"),
		);
		const bodyElement = document.querySelector("body");
		if (bodyElement) {
			if (isHomePage) {
				bodyElement.classList.add("lg:is-home");
			} else {
				bodyElement.classList.remove("lg:is-home");
			}
		}

		const bannerTextOverlay = document.querySelector(
			".banner-text-overlay",
		);
		if (bannerTextOverlay) {
			if (isHomePage) {
				bannerTextOverlay.classList.remove("hidden");
			} else {
				bannerTextOverlay.classList.add("hidden");
			}
		}

		const navbar = document.getElementById("navbar");
		if (navbar) {
			navbar.setAttribute("data-is-home", isHomePage.toString());
			const transparentMode = navbar.getAttribute(
				"data-transparent-mode",
			);
			if (transparentMode === "semifull") {
				if (
					typeof runtimeWindow.initSemifullScrollDetection ===
					"function"
				) {
					runtimeWindow.initSemifullScrollDetection?.();
				}
			}
		}

		const heightExtend = document.getElementById("page-height-extend");
		if (heightExtend) {
			heightExtend.classList.remove("hidden");
		}

		if (hash) {
			requestAnimationFrame(() => {
				scrollToHashBelowTocBaseline(hash, {
					behavior: "instant",
				});
			});
		} else {
			window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
		}

		const storedTheme = localStorage.getItem("theme") || deps.defaultTheme;
		const isDark = storedTheme === deps.darkMode;
		const expectedTheme = isDark ? "github-dark" : "github-light";
		const currentTheme =
			document.documentElement.getAttribute("data-theme");
		const hasDarkClass =
			document.documentElement.classList.contains("dark");

		if (currentTheme !== expectedTheme || hasDarkClass !== isDark) {
			requestAnimationFrame(() => {
				if (currentTheme !== expectedTheme) {
					document.documentElement.setAttribute(
						"data-theme",
						expectedTheme,
					);
				}
				if (hasDarkClass !== isDark) {
					if (isDark) {
						document.documentElement.classList.add("dark");
					} else {
						document.documentElement.classList.remove("dark");
					}
				}
			});
		}

		window.setTimeout(() => {
			if (document.getElementById("tcomment")) {
				document.dispatchEvent(
					new CustomEvent("mizuki:page:loaded", {
						detail: {
							path: window.location.pathname,
							timestamp: Date.now(),
						},
					}),
				);
			}
		}, 300);
	});

	swup.hooks.on("visit:end", () => {
		clearBannerToSpecTransitionVisualState();

		window.setTimeout(() => {
			const heightExtend = document.getElementById("page-height-extend");
			if (heightExtend) {
				heightExtend.classList.add("hidden");
			}
			const toc = document.getElementById("toc-wrapper");
			if (toc) {
				toc.classList.remove("toc-not-ready");
			}
		}, 200);
	});
}
