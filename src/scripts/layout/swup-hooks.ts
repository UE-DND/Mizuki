import type { LayoutController } from "./layout-controller";
import { scrollToHashBelowTocBaseline } from "@/utils/hash-scroll";

type SwupIntentSourceDependencies = {
	controller: LayoutController;
	initFancybox: () => Promise<void>;
	cleanupFancybox: () => void;
	checkKatex: () => void;
	initKatexScrollbars: () => void;
	defaultTheme: string;
	darkMode: string;
	pathsEqual: (left: string, right: string) => boolean;
	url: (path: string) => string;
};

export function setupSwupIntentSource(
	deps: SwupIntentSourceDependencies,
): void {
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
		};

	const swup = runtimeWindow.swup;
	if (!swup?.hooks) {
		return;
	}

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
	});

	swup.hooks.on("visit:start", () => {
		deps.cleanupFancybox();

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
		deps.controller.dispatch({
			type: "ROUTE_CHANGED",
			path: window.location.pathname,
			scrollTop: document.documentElement.scrollTop,
			viewportWidth: window.innerWidth,
			reason: "route-change",
		});

		const isHomePage = deps.pathsEqual(
			window.location.pathname,
			deps.url("/"),
		);

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
