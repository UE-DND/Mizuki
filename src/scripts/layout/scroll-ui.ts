import type { LayoutController } from "./layout-controller";

type ScrollIntentSourceOptions = {
	controller: LayoutController;
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

function updateBackToTopButton(
	backToTopBtn: HTMLElement | null,
	bannerHeight: number,
): void {
	if (!backToTopBtn) {
		return;
	}

	const scrollTop = document.documentElement.scrollTop;
	const bannerHeightPx = window.innerHeight * (bannerHeight / 100);
	const contentWrapper = document.getElementById("content-wrapper");
	let showBackToTopThreshold = bannerHeightPx + 100;

	if (contentWrapper) {
		const rect = contentWrapper.getBoundingClientRect();
		const absoluteTop = rect.top + scrollTop;
		showBackToTopThreshold = absoluteTop + window.innerHeight / 4;
	}

	if (scrollTop > showBackToTopThreshold) {
		backToTopBtn.classList.remove("hide");
	} else {
		backToTopBtn.classList.add("hide");
	}
}

function updateBannerExtendCssVar(bannerHeightExtend: number): void {
	let offset = Math.floor(window.innerHeight * (bannerHeightExtend / 100));
	offset = offset - (offset % 4);
	document.documentElement.style.setProperty(
		"--banner-height-extend",
		`${offset}px`,
	);
}

export function setupScrollIntentSource(
	options: ScrollIntentSourceOptions,
): () => void {
	const backToTopBtn = document.getElementById("back-to-top-btn");

	const handleScroll = () => {
		const scrollTop = document.documentElement.scrollTop;
		const viewportWidth = window.innerWidth;
		const currentState = options.controller.dispatch({
			type: "SCROLL_UPDATE",
			scrollTop,
			viewportWidth,
		});

		requestAnimationFrame(() => {
			updateBackToTopButton(backToTopBtn, options.bannerHeight);

			if (
				currentState.mode === "banner" &&
				currentState.isHome &&
				viewportWidth >= 1024
			) {
				const threshold =
					window.innerHeight * (options.bannerHeightHome / 100) - 88;
				if (scrollTop >= threshold) {
					options.controller.dispatch({
						type: "COLLAPSE_BANNER",
						reason: "scroll-collapse",
					});
				}
			}
		});
	};

	const handleResize = () => {
		options.controller.dispatch({
			type: "RESIZE",
			scrollTop: document.documentElement.scrollTop,
			viewportWidth: window.innerWidth,
		});
		updateBannerExtendCssVar(options.bannerHeightExtend);
	};

	const throttledScroll = throttle(handleScroll, 16);
	window.addEventListener("scroll", throttledScroll, { passive: true });
	window.addEventListener("resize", handleResize, { passive: true });

	updateBannerExtendCssVar(options.bannerHeightExtend);
	handleScroll();

	return () => {
		window.removeEventListener("scroll", throttledScroll);
		window.removeEventListener("resize", handleResize);
	};
}
