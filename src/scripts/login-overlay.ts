import { buildLoginUrl } from "@utils/login-url";

let overlayEl: HTMLElement | null = null;
let linkEl: HTMLAnchorElement | null = null;
let messageEl: HTMLElement | null = null;
let savedOverflow = "";

function ensureDOM(): void {
	if (overlayEl) {
		return;
	}

	overlayEl = document.createElement("div");
	overlayEl.className = "login-overlay";
	overlayEl.setAttribute("role", "dialog");
	overlayEl.setAttribute("aria-modal", "true");
	overlayEl.setAttribute("aria-label", "登录提示");
	overlayEl.hidden = true;

	const card = document.createElement("div");
	card.className = "login-overlay-card";

	messageEl = document.createElement("p");
	messageEl.className = "login-overlay-message";
	messageEl.textContent = "请先登录后再操作。";

	const actions = document.createElement("div");
	actions.className = "login-overlay-actions";

	linkEl = document.createElement("a");
	linkEl.className = "login-overlay-login";
	linkEl.textContent = "前往登录";
	linkEl.addEventListener("click", hideImmediate);

	const cancelBtn = document.createElement("button");
	cancelBtn.type = "button";
	cancelBtn.className = "login-overlay-cancel";
	cancelBtn.textContent = "取消";
	cancelBtn.addEventListener("click", hide);

	actions.appendChild(linkEl);
	actions.appendChild(cancelBtn);
	card.appendChild(messageEl);
	card.appendChild(actions);
	overlayEl.appendChild(card);

	overlayEl.addEventListener("click", (e) => {
		if (e.target === overlayEl) {
			hide();
		}
	});

	document.body.appendChild(overlayEl);
}

function onKeyDown(e: KeyboardEvent): void {
	if (e.key === "Escape") {
		e.preventDefault();
		hide();
	}
}

function hideImmediate(): void {
	if (!overlayEl) {
		return;
	}
	overlayEl.hidden = true;
	overlayEl.classList.remove("is-closing");
	document.body.style.overflow = savedOverflow;
	document.removeEventListener("keydown", onKeyDown);
}

function hide(): void {
	if (!overlayEl || overlayEl.hidden) {
		return;
	}

	overlayEl.classList.add("is-closing");
	overlayEl.addEventListener(
		"animationend",
		() => {
			if (!overlayEl) {
				return;
			}
			overlayEl.hidden = true;
			overlayEl.classList.remove("is-closing");
			document.body.style.overflow = savedOverflow;
		},
		{ once: true },
	);

	document.removeEventListener("keydown", onKeyDown);
}

export function showLoginOverlay(message?: string): void {
	ensureDOM();
	if (!overlayEl || !linkEl || !messageEl) {
		return;
	}

	messageEl.textContent = message || "请先登录后再操作。";
	linkEl.href = buildLoginUrl();

	savedOverflow = document.body.style.overflow;
	document.body.style.overflow = "hidden";

	overlayEl.hidden = false;
	document.addEventListener("keydown", onKeyDown);
}

// 挂载到 window 供 is:inline 脚本调用
declare global {
	interface Window {
		showLoginOverlay: typeof showLoginOverlay;
	}
}
window.showLoginOverlay = showLoginOverlay;
