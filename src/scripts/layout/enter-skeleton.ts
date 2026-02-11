type EnterSkeletonMode = "post-card" | "post-detail" | "fallback";

const ACTIVE_CLASS = "enter-skeleton-active";
const MODE_ATTR = "data-enter-skeleton-mode";
const MIN_VISIBLE_MS = 120;

let activatedAt = 0;
let deactivationTimer: number | null = null;
let activationToken = 0;

function getRoot(): HTMLElement | null {
	if (typeof document === "undefined") {
		return null;
	}
	return document.documentElement;
}

function clearDeactivationTimer(): void {
	if (deactivationTimer !== null) {
		window.clearTimeout(deactivationTimer);
		deactivationTimer = null;
	}
}

function detectEnterSkeletonMode(): EnterSkeletonMode {
	if (document.querySelector('[data-enter-skeleton-target="post-detail"]')) {
		return "post-detail";
	}
	if (document.querySelector('[data-enter-skeleton-target="post-card"]')) {
		return "post-card";
	}
	return "fallback";
}

function applyMode(mode: EnterSkeletonMode): void {
	const root = getRoot();
	if (!root) {
		return;
	}

	root.classList.add(ACTIVE_CLASS);
	root.setAttribute(MODE_ATTR, mode);
}

function clearMode(): void {
	const root = getRoot();
	if (!root) {
		return;
	}

	root.classList.remove(ACTIVE_CLASS);
	root.removeAttribute(MODE_ATTR);
}

export function activateEnterSkeleton(): void {
	if (typeof window === "undefined") {
		return;
	}

	activationToken += 1;
	clearDeactivationTimer();

	const mode = detectEnterSkeletonMode();
	activatedAt = performance.now();
	applyMode(mode);
}

export function deactivateEnterSkeleton(): void {
	const root = getRoot();
	if (!root || typeof window === "undefined") {
		return;
	}
	if (!root.classList.contains(ACTIVE_CLASS)) {
		return;
	}

	const elapsed = performance.now() - activatedAt;
	const remainingMs = Math.max(0, MIN_VISIBLE_MS - elapsed);
	const currentToken = activationToken;
	const finish = (): void => {
		if (currentToken !== activationToken) {
			return;
		}
		clearDeactivationTimer();
		clearMode();
		activatedAt = 0;
	};

	if (remainingMs <= 0) {
		finish();
		return;
	}

	clearDeactivationTimer();
	deactivationTimer = window.setTimeout(finish, Math.ceil(remainingMs));
}

export function forceResetEnterSkeleton(): void {
	activationToken += 1;
	clearDeactivationTimer();
	activatedAt = 0;
	clearMode();
}
