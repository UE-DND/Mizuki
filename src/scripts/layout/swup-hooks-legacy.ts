import { resetScrollCollapseState } from "./scroll-ui-legacy";
import { scrollToHashBelowTocBaseline } from "@/utils/hash-scroll";

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

	swup.hooks.on("link:click", () => {
		document.documentElement.style.setProperty("--content-delay", "0ms");

		if (deps.bannerEnabled) {
			const navbar = document.getElementById("navbar-wrapper");
			if (navbar && document.body.classList.contains("lg:is-home")) {
				// Banner 已被滚动折叠时，不隐藏导航栏
				if (
					document.body.classList.contains("scroll-collapsed-banner")
				) {
					return;
				}
				const threshold =
					window.innerHeight * (deps.bannerHeight / 100) - 88;
				if (document.documentElement.scrollTop >= threshold) {
					navbar.classList.add("navbar-hidden");
				}
			}
		}
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
	});

	swup.hooks.on("visit:start", (visit: { to: { url: string } }) => {
		deps.cleanupFancybox();
		const isHomePage = deps.pathsEqual(visit.to.url, deps.url("/"));
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

	swup.hooks.on("page:view", () => {
		resetScrollCollapseState();
		deps.updateBannerCarouselState();
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

		const hash = window.location.hash?.slice(1);
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
