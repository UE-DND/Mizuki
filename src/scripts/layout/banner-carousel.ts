type CarouselController = {
	setPaused: (paused: boolean) => void;
};

type BannerWindow = Window &
	typeof globalThis & {
		__bannerCarouselController?: CarouselController;
		__updateBannerCarouselState?: () => void;
	};

const BANNER_CAROUSEL_ID = "banner-carousel";

function isBannerVisibleByState(): boolean {
	const mode = document.body.dataset.layoutMode;
	return mode === "banner";
}

function getRuntimeWindow(): BannerWindow {
	return window as BannerWindow;
}

export function updateBannerCarouselState(): void {
	const runtimeWindow = getRuntimeWindow();
	const controller = runtimeWindow.__bannerCarouselController;
	if (!controller || typeof controller.setPaused !== "function") {
		return;
	}
	const bannerWrapper = document.getElementById("banner-wrapper");
	const isBannerHidden =
		bannerWrapper?.classList.contains("wallpaper-layer-hidden") === true;
	controller.setPaused(!isBannerVisibleByState() || isBannerHidden);
}

export function initBannerCarousel(): void {
	const runtimeWindow = getRuntimeWindow();
	const existingController = runtimeWindow.__bannerCarouselController;
	if (
		existingController &&
		typeof existingController.setPaused === "function"
	) {
		updateBannerCarouselState();
		return;
	}

	const carouselItems =
		document.querySelectorAll<HTMLElement>(".carousel-item");
	const isMobile = window.innerWidth < 768;
	const validItems = Array.from(carouselItems).filter((item) => {
		if (isMobile) {
			return item.querySelector(".block.md\\:hidden");
		}
		return item.querySelector(".hidden.md\\:block");
	});
	const carouselConfig =
		runtimeWindow.__DACAPO_RUNTIME_SETTINGS__?.settings.banner.carousel;

	if (validItems.length <= 1 || !carouselConfig?.enable) {
		return;
	}

	let currentIndex = 0;
	const interval = carouselConfig.interval || 6;
	let carouselInterval: number | undefined;
	let isPaused = false;

	let startX = 0;
	let startY = 0;
	let isSwiping = false;

	const carousel = document.getElementById(BANNER_CAROUSEL_ID);

	function switchToSlide(index: number): void {
		const currentItem = validItems[currentIndex];
		currentItem.classList.remove("opacity-100", "scale-100");
		currentItem.classList.add("opacity-0", "scale-110");

		currentIndex = index;

		const nextItem = validItems[currentIndex];
		nextItem.classList.add("opacity-100", "scale-100");
		nextItem.classList.remove("opacity-0", "scale-110");
	}

	carouselItems.forEach((item) => {
		item.classList.add("opacity-0", "scale-110");
		item.classList.remove("opacity-100", "scale-100");
	});

	if (validItems.length > 0) {
		validItems[0].classList.add("opacity-100", "scale-100");
		validItems[0].classList.remove("opacity-0", "scale-110");
	}

	if (carousel && "ontouchstart" in window) {
		carousel.addEventListener(
			"touchstart",
			(e) => {
				startX = e.touches[0].clientX;
				startY = e.touches[0].clientY;
				isSwiping = false;
				isPaused = true;
				clearInterval(carouselInterval);
			},
			{ passive: true },
		);

		carousel.addEventListener(
			"touchmove",
			(e) => {
				if (!startX || !startY) {
					return;
				}
				const diffX = Math.abs(e.touches[0].clientX - startX);
				const diffY = Math.abs(e.touches[0].clientY - startY);
				if (diffX > diffY && diffX > 30) {
					isSwiping = true;
					e.preventDefault();
				}
			},
			{ passive: false },
		);

		carousel.addEventListener(
			"touchend",
			(e) => {
				if (!startX || !startY || !isSwiping) {
					isPaused = false;
					startCarousel();
					return;
				}

				const endX = e.changedTouches[0].clientX;
				const diffX = startX - endX;
				if (Math.abs(diffX) > 50) {
					if (diffX > 0) {
						switchToSlide((currentIndex + 1) % validItems.length);
					} else {
						switchToSlide(
							(currentIndex - 1 + validItems.length) %
								validItems.length,
						);
					}
				}

				startX = 0;
				startY = 0;
				isSwiping = false;
				isPaused = false;
				startCarousel();
			},
			{ passive: true },
		);
	}

	function startCarousel(): void {
		clearInterval(carouselInterval);
		carouselInterval = window.setInterval(() => {
			if (!isPaused) {
				switchToSlide((currentIndex + 1) % validItems.length);
			}
		}, interval * 1000);
	}

	function setPaused(paused: boolean): void {
		isPaused = paused;
		if (paused) {
			clearInterval(carouselInterval);
		} else {
			startCarousel();
		}
	}

	runtimeWindow.__bannerCarouselController = { setPaused };
	if (carousel) {
		carousel.addEventListener("mouseenter", () => {
			isPaused = true;
			clearInterval(carouselInterval);
		});
		carousel.addEventListener("mouseleave", () => {
			isPaused = false;
			startCarousel();
		});
	}

	startCarousel();
	updateBannerCarouselState();
}

export function showBanner(): void {
	requestAnimationFrame(() => {
		const banner = document.getElementById("banner");
		if (banner) {
			banner.classList.remove("opacity-0", "scale-105");
		}

		const mobileBanner = document.querySelector(
			'.block.md\\:hidden[alt="Mobile banner image of the blog"]',
		);
		if (mobileBanner && !document.getElementById(BANNER_CAROUSEL_ID)) {
			mobileBanner.classList.remove("opacity-0", "scale-105");
			mobileBanner.classList.add("opacity-100");
		}

		if (document.getElementById(BANNER_CAROUSEL_ID)) {
			initBannerCarousel();
			updateBannerCarouselState();
		}
	});
}

export function setupBannerRuntime(): void {
	const runtimeWindow = getRuntimeWindow();
	runtimeWindow.__updateBannerCarouselState = updateBannerCarouselState;
}
