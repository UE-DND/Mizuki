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

export function setupScrollUi(options: ScrollUiOptions): void {
	const backToTopBtn = document.getElementById("back-to-top-btn");
	const toc = document.getElementById("toc-wrapper");
	const navbar = document.getElementById("navbar-wrapper");

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
				if (scrollTop >= threshold) {
					navbar.classList.add("navbar-hidden");
				} else {
					navbar.classList.remove("navbar-hidden");
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
