import "overlayscrollbars/overlayscrollbars.css";

import { siteConfig, widgetConfigs } from "@/config";
import { DARK_MODE, DEFAULT_THEME } from "@/constants/constants";
import { setupCodeCopyDelegation } from "@/scripts/code-copy";
import {
	encodeHashId,
	resolveSamePageHashLink,
	scrollElementBelowTocBaseline,
	scrollToHashBelowTocBaseline,
} from "@/utils/hash-scroll";
import { initKatexScrollbars } from "@/utils/katex-scrollbar";
import { setupPanelOutsideHandler } from "@/utils/panel-outside-handler";
import { panelManager } from "@/utils/panel-manager.js";
import { initSakura } from "@/utils/sakura-manager";
import { pathsEqual, url } from "@/utils/url-utils";
import {
	setupBannerRuntime,
	showBanner,
	updateBannerCarouselState,
} from "./banner-carousel";
import { createFancyboxController } from "./fancybox-init";
import { checkKatex } from "./katex-loader";
import { initLayoutController } from "./layout-controller";
import { setupScrollIntentSource } from "./scroll-ui";
import { setupScrollUi as setupScrollUiLegacy } from "./scroll-ui-legacy";
import { setupSwupIntentSource } from "./swup-hooks";
import { setupSwupHooks as setupSwupHooksLegacy } from "./swup-hooks-legacy";

const BANNER_HEIGHT = 35;
const BANNER_HEIGHT_EXTEND = 30;
const BANNER_HEIGHT_HOME = BANNER_HEIGHT + BANNER_HEIGHT_EXTEND;

type LayoutRuntimeWindow = Window &
	typeof globalThis & {
		sakuraInitialized?: boolean;
		__layoutRuntimeInitialized?: boolean;
		__layoutSwupHooksAttached?: boolean;
		__layoutHashOffsetBound?: boolean;
		swup?: {
			hooks?: {
				on: (
					event: string,
					callback: (...args: never[]) => void,
				) => void;
			};
		};
	};

export function initLayoutRuntime(): void {
	const runtimeWindow = window as LayoutRuntimeWindow;
	if (runtimeWindow.__layoutRuntimeInitialized) {
		return;
	}

	runtimeWindow.__layoutRuntimeInitialized = true;
	const bannerEnabled = Boolean(document.getElementById("banner-wrapper"));
	const fancyboxController = createFancyboxController();
	const useLayoutStateMachineV2 =
		siteConfig.experimental?.layoutStateMachineV2 ?? true;
	const navbarTransparentMode =
		siteConfig.banner?.navbar?.transparentMode || "semi";

	setupPanelOutsideHandler(panelManager);
	setupCodeCopyDelegation();
	setupBannerRuntime();
	setupHashOffsetNavigation(runtimeWindow);

	const setupSakura = () => {
		const sakuraConfig = widgetConfigs.sakura;
		if (!sakuraConfig || !sakuraConfig.enable) {
			return;
		}
		if (runtimeWindow.sakuraInitialized) {
			return;
		}
		initSakura(sakuraConfig);
		runtimeWindow.sakuraInitialized = true;
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", setupSakura, {
			once: true,
		});
	} else {
		setupSakura();
	}

	if (useLayoutStateMachineV2) {
		const layoutController = initLayoutController({
			bannerEnabled,
			defaultWallpaperMode: siteConfig.wallpaperMode.defaultMode,
			navbarTransparentMode,
			bannerHeight: BANNER_HEIGHT,
			bannerHeightHome: BANNER_HEIGHT_HOME,
			bannerHeightExtend: BANNER_HEIGHT_EXTEND,
			updateBannerCarouselState,
		});

		setupScrollIntentSource({
			controller: layoutController,
			bannerHeight: BANNER_HEIGHT,
			bannerHeightHome: BANNER_HEIGHT_HOME,
			bannerHeightExtend: BANNER_HEIGHT_EXTEND,
		});

		const attachSwupHooks = () => {
			if (runtimeWindow.__layoutSwupHooksAttached) {
				return;
			}
			if (!runtimeWindow.swup?.hooks) {
				return;
			}
			setupSwupIntentSource({
				controller: layoutController,
				initFancybox: fancyboxController.initFancybox,
				cleanupFancybox: fancyboxController.cleanupFancybox,
				checkKatex,
				initKatexScrollbars,
				defaultTheme: DEFAULT_THEME,
				darkMode: DARK_MODE,
				pathsEqual,
				url,
			});
			runtimeWindow.__layoutSwupHooksAttached = true;
		};

		if (runtimeWindow.swup?.hooks) {
			void fancyboxController.initFancybox();
			checkKatex();
			attachSwupHooks();
		} else {
			document.addEventListener("swup:enable", attachSwupHooks, {
				once: true,
			});
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", () => {
					void fancyboxController.initFancybox();
					checkKatex();
				});
			} else {
				void fancyboxController.initFancybox();
				checkKatex();
			}
		}
	} else {
		const attachLegacySwupHooks = () => {
			if (runtimeWindow.__layoutSwupHooksAttached) {
				return;
			}
			if (!runtimeWindow.swup?.hooks) {
				return;
			}
			setupSwupHooksLegacy({
				bannerEnabled,
				bannerHeight: BANNER_HEIGHT,
				bannerHeightHome: BANNER_HEIGHT_HOME,
				initFancybox: fancyboxController.initFancybox,
				cleanupFancybox: fancyboxController.cleanupFancybox,
				checkKatex,
				initKatexScrollbars,
				updateBannerCarouselState,
				defaultTheme: DEFAULT_THEME,
				darkMode: DARK_MODE,
				pathsEqual,
				url,
			});
			runtimeWindow.__layoutSwupHooksAttached = true;
		};

		if (runtimeWindow.swup?.hooks) {
			void fancyboxController.initFancybox();
			checkKatex();
			attachLegacySwupHooks();
		} else {
			document.addEventListener("swup:enable", attachLegacySwupHooks, {
				once: true,
			});
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", () => {
					void fancyboxController.initFancybox();
					checkKatex();
				});
			} else {
				void fancyboxController.initFancybox();
				checkKatex();
			}
		}

		setupScrollUiLegacy({
			bannerEnabled,
			bannerHeight: BANNER_HEIGHT,
			bannerHeightHome: BANNER_HEIGHT_HOME,
			bannerHeightExtend: BANNER_HEIGHT_EXTEND,
		});
	}

	const initBannerAndPanels = async () => {
		showBanner();
		try {
			await import("@/utils/panel-manager.js");
		} catch (error) {
			console.error("Failed to initialize panel manager:", error);
		}
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			void initBannerAndPanels();
		});
	} else {
		void initBannerAndPanels();
	}
}

function setupHashOffsetNavigation(runtimeWindow: LayoutRuntimeWindow): void {
	if (runtimeWindow.__layoutHashOffsetBound) {
		return;
	}

	const handleHashAnchorClick = (event: MouseEvent): void => {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}

		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}

		const anchor = target.closest<HTMLAnchorElement>("a[href]");
		if (!anchor || anchor.hasAttribute("download")) {
			return;
		}

		const resolvedLink = resolveSamePageHashLink(anchor);
		if (!resolvedLink) {
			return;
		}

		event.preventDefault();

		const nextHash = encodeHashId(resolvedLink.id);
		if (window.location.hash !== nextHash) {
			history.pushState(null, "", nextHash);
		}

		scrollElementBelowTocBaseline(resolvedLink.target, {
			behavior: "smooth",
		});
	};

	const handleHashChange = (): void => {
		if (!window.location.hash) {
			return;
		}

		requestAnimationFrame(() => {
			scrollToHashBelowTocBaseline(window.location.hash, {
				behavior: "instant",
			});
		});
	};

	document.addEventListener("click", handleHashAnchorClick);
	window.addEventListener("hashchange", handleHashChange);

	if (window.location.hash) {
		requestAnimationFrame(() => {
			scrollToHashBelowTocBaseline(window.location.hash, {
				behavior: "instant",
			});
			window.setTimeout(() => {
				scrollToHashBelowTocBaseline(window.location.hash, {
					behavior: "instant",
				});
			}, 120);
		});
	}

	runtimeWindow.__layoutHashOffsetBound = true;
}

initLayoutRuntime();

// ---------------------------------------------------------------------------
// Dynamic page-specific initialization
//
// Some pages (e.g. /me/) have page-specific modules that must re-initialise
// after every Swup navigation.  We cannot rely on SwupHeadPlugin to inject
// and execute a new <script type="module"> during Swup transitions — ES
// modules only execute once per URL per document.
//
// Instead, we register a global listener here (guaranteed to be loaded on
// the very first full page load) and dynamically import the page module on
// demand.
// ---------------------------------------------------------------------------

const runDynamicPageInit = async (): Promise<void> => {
	const path = window.location.pathname.replace(/\/+$/, "") || "/";
	if (path === "/me") {
		const { initMePage } = await import("@/scripts/me-page");
		initMePage();
	}
};

void runDynamicPageInit();
document.addEventListener("astro:after-swap", () => void runDynamicPageInit());
