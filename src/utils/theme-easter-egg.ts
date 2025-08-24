import { MD3_COLOR_SCHEMES } from "./auto-theme-utils";

let rightKeyCount = 0;
let lastKeyTime = 0;
let currentThemeIndex = 0;
const KEY_TIMEOUT = 1000;

function applyTheme(hue: number): void {
	const root = document.querySelector(":root") as HTMLElement;
	if (root) {
		root.style.setProperty("--hue", String(hue));
	}
}

function showSurpriseNotification(themeName: string, hue: number): void {
	const notification = document.createElement("div");
	notification.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--float-panel-bg);
            border: 1px solid var(--line-divider);
            border-radius: var(--radius-large);
            padding: 1.5rem 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
            backdrop-filter: blur(20px);
            z-index: 9999;
            font-size: 1.1rem;
            font-weight: 500;
            color: var(--primary);
            text-align: center;
            animation: surpriseIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
        ">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎨</div>
            <div>你发现了一个秘密！</div>
            <div style="margin-top: 0.3rem;">主题色已切换</div>
            <div style="font-size: 1.2rem; font-weight: 600; color: white; background: oklch(0.70 0.14 ${hue}); padding: 0.5rem 1rem; border-radius: 0.5rem; margin-top: 0.5rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);">${themeName}</div>
        </div>
    `;

	const style = document.createElement("style");
	style.textContent = `
        @keyframes surpriseIn {
            0% {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.8) rotate(-10deg);
            }
            50% {
                transform: translate(-50%, -50%) scale(1.05) rotate(2deg);
            }
            100% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1) rotate(0deg);
            }
        }
        @keyframes surpriseOut {
            0% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            100% {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
            }
        }
    `;
	document.head.appendChild(style);
	document.body.appendChild(notification);

	setTimeout(() => {
		const notificationEl = notification.querySelector("div") as HTMLElement;
		if (notificationEl) {
			notificationEl.style.animation = "surpriseOut 0.3s ease-out forwards";
		}
		setTimeout(() => {
			document.body.removeChild(notification);
			document.head.removeChild(style);
		}, 300);
	}, 3000);
}

function getThemeName(hue: number): string {
	const themeNames: { [key: number]: string } = {
		214: "海洋蓝",
		142: "森林绿",
		262: "薰衣草紫",
		24: "温暖橙",
		340: "玫瑰粉",
		174: "薄荷绿",
		38: "金秋黄",
	};
	return themeNames[hue] || `色相 ${hue}°`;
}

function handleKeyPress(event: KeyboardEvent): void {
	const currentTime = Date.now();

	if (event.key === "ArrowRight") {
		if (currentTime - lastKeyTime > KEY_TIMEOUT) {
			rightKeyCount = 1;
		} else {
			rightKeyCount++;
		}

		lastKeyTime = currentTime;

		if (rightKeyCount === 4) {
			rightKeyCount = 0;

			currentThemeIndex = (currentThemeIndex + 1) % MD3_COLOR_SCHEMES.length;
			const newTheme = MD3_COLOR_SCHEMES[currentThemeIndex];

			applyTheme(newTheme.hue);
			showSurpriseNotification(getThemeName(newTheme.hue), newTheme.hue);

			localStorage.setItem("easterEggThemeIndex", String(currentThemeIndex));
		}
	} else {
		rightKeyCount = 0;
	}
}

export function initThemeEasterEgg(): void {
	const savedIndex = localStorage.getItem("easterEggThemeIndex");
	if (savedIndex) {
		currentThemeIndex = Number.parseInt(savedIndex, 10) || 0;
	}
	document.addEventListener("keydown", handleKeyPress);
}

export function cleanupThemeEasterEgg(): void {
	document.removeEventListener("keydown", handleKeyPress);
}
