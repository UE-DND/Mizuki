import type { LayoutController } from "./layout-controller";

type SwupVisit = {
	containers: string[];
	to: {
		document?: Document;
	};
};

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
					before: (
						event: string,
						callback: (visit: SwupVisit) => void,
					) => void;
				};
			};
			mobileTOCInit?: () => void;
		};

	const swup = runtimeWindow.swup;
	if (!swup?.hooks) {
		return;
	}

	swup.hooks.before("content:replace", (visit: SwupVisit) => {
		const currentSidebar = document.querySelector<HTMLElement>("#sidebar");
		const newSidebar = visit.to.document?.querySelector("#sidebar");
		if (!currentSidebar || !newSidebar) {
			return;
		}

		const currentUid = currentSidebar.getAttribute("data-sidebar-uid");
		const newUid = newSidebar.getAttribute("data-sidebar-uid");

		if (currentUid && newUid && currentUid === newUid) {
			visit.containers = visit.containers.filter((c) => c !== "#sidebar");
			currentSidebar.dataset.sidebarPreserved = "";
		}
	});

	swup.hooks.on("link:click", () => {
		document.documentElement.style.setProperty("--content-delay", "0ms");
	});

	swup.hooks.on("content:replace", () => {
		void deps.initFancybox();
		deps.checkKatex();
		deps.initKatexScrollbars();

		const tocWrapper = document.getElementById("toc-wrapper");
		const isArticlePage = tocWrapper !== null;

		if (isArticlePage) {
			const tocElement = document.querySelector("table-of-contents") as
				| (HTMLElement & { init?: () => void })
				| null;
			if (typeof tocElement?.init === "function") {
				window.setTimeout(() => {
					tocElement.init?.();
				}, 100);
			}
			if (typeof runtimeWindow.mobileTOCInit === "function") {
				window.setTimeout(() => {
					runtimeWindow.mobileTOCInit?.();
				}, 100);
			}
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
				document
					.getElementById(hash)
					?.scrollIntoView({ behavior: "instant" });
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
		const sidebar = document.getElementById("sidebar");
		if (sidebar) {
			delete sidebar.dataset.sidebarPreserved;
		}

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
