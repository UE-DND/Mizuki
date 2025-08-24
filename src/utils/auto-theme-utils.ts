/**
 * 自动主题色管理工具
 * 基于Material Design 3规范的7种配色方案，每天自动切换
 */

export const MD3_COLOR_SCHEMES = [
	{ hue: 214 },
	{ hue: 142 },
	{ hue: 262 },
	{ hue: 24 },
	{ hue: 340 },
	{ hue: 174 },
	{ hue: 38 },
];

/**
 * 获取当前日期对应的主题色方案
 * 基于一周7天循环，每天对应一种配色
 */
export function getDailyThemeScheme() {
	const today = new Date();
	const dayOfWeek = today.getDay(); // 0-6 (周日到周六)
	return MD3_COLOR_SCHEMES[dayOfWeek];
}

/**
 * 获取当前应该使用的主题色色相值
 */
export function getDailyHue(): number {
	return getDailyThemeScheme().hue;
}



/**
 * 检查是否启用了自动主题色
 */
export function isAutoThemeEnabled(): boolean {
	const stored = localStorage.getItem("autoTheme");
	return stored === "true";
}

/**
 * 设置自动主题色开关状态
 */
export function setAutoThemeEnabled(enabled: boolean): void {
	localStorage.setItem("autoTheme", String(enabled));
}

/**
 * 应用自动主题色
 * 总是使用每日主题色（因为我们已经移除了手动主题色功能）
 */
export function applyAutoTheme(): void {
	const dailyHue = getDailyHue();
	const r = document.querySelector(":root") as HTMLElement;
	if (r) {
		r.style.setProperty("--hue", String(dailyHue));
	}
}

/**
 * 获取所有可用的主题色方案（用于预览）
 */
export function getAllThemeSchemes() {
	return MD3_COLOR_SCHEMES;
}

/**
 * 根据日期获取主题色方案（用于预览特定日期的主题）
 */
export function getThemeSchemeByDate(date: Date) {
	const dayOfWeek = date.getDay();
	return MD3_COLOR_SCHEMES[dayOfWeek];
}
