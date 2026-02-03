type PanelOutsideConfig = {
	panelId: string;
	ignores: string[];
};

type PanelManager = {
	closePanel: (panelId: string) => Promise<void>;
};

export const setupPanelOutsideHandler = (panelManager: PanelManager): void => {
	const panelOutsideConfigs: PanelOutsideConfig[] = [
		{
			panelId: "nav-menu-panel",
			ignores: ["nav-menu-panel", "nav-menu-switch"],
		},
		{
			panelId: "search-panel",
			ignores: ["search-panel", "search-bar", "search-switch"],
		},
		{
			panelId: "mobile-toc-panel",
			ignores: ["mobile-toc-panel", "mobile-toc-switch"],
		},
		{
			panelId: "wallpaper-mode-panel",
			ignores: ["wallpaper-mode-panel", "wallpaper-mode-switch"],
		},
	];

	const outsideHandlerInitialized =
		document.documentElement.dataset.panelOutsideHandlerInitialized ===
		"true";

	if (outsideHandlerInitialized) {
		return;
	}

	document.documentElement.dataset.panelOutsideHandlerInitialized = "true";
	document.addEventListener("click", async (event) => {
		const tDom = event.target;
		if (!(tDom instanceof Node)) {
			return;
		}
		await Promise.all(
			panelOutsideConfigs.map(async ({ panelId, ignores }) => {
				const isIgnored = ignores.some((ignoreId) => {
					const ignoreEl = document.getElementById(ignoreId);
					return (
						ignoreEl !== null &&
						(ignoreEl === tDom || ignoreEl.contains(tDom))
					);
				});
				if (!isIgnored) {
					await panelManager.closePanel(panelId);
				}
			}),
		);
	});
};
