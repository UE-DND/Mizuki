<script lang="ts">
import { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants";
import Icon from "@iconify/svelte";
import {
	applyThemeToDocument,
	getStoredTheme,
	setTheme,
} from "@utils/setting-utils";
import { onMount } from "svelte";
import type { LIGHT_DARK_MODE } from "@/types/config";

const seq: LIGHT_DARK_MODE[] = [LIGHT_MODE, DARK_MODE, AUTO_MODE];
let mode: LIGHT_DARK_MODE = $state(AUTO_MODE);

// 根据当前时间判断初始模式（6点到18点为白天，使用浅色模式）
function getInitialModeByTime(): LIGHT_DARK_MODE {
	const hour = new Date().getHours();
	return (hour >= 6 && hour < 18) ? LIGHT_MODE : DARK_MODE;
}

onMount(() => {
	// 先尝试从存储中获取主题
	const storedTheme = getStoredTheme();
	
	// 如果没有存储的主题或者是自动模式，则基于时间选择
	if (!storedTheme || storedTheme === AUTO_MODE) {
		mode = getInitialModeByTime();
		setTheme(mode);
	} else {
		mode = storedTheme;
	}
	const darkModePreference = window.matchMedia("(prefers-color-scheme: dark)");
	const changeThemeWhenSchemeChanged: Parameters<
		typeof darkModePreference.addEventListener<"change">
	>[1] = (_e) => {
		applyThemeToDocument(mode);
	};
	darkModePreference.addEventListener("change", changeThemeWhenSchemeChanged);
	return () => {
		darkModePreference.removeEventListener(
			"change",
			changeThemeWhenSchemeChanged,
		);
	};
});

function switchScheme(newMode: LIGHT_DARK_MODE) {
	mode = newMode;
	setTheme(newMode);
}

function toggleScheme() {
	// 只在浅色和深色模式之间切换，跳过自动模式
	if (mode === LIGHT_MODE) {
		switchScheme(DARK_MODE);
	} else if (mode === DARK_MODE) {
		switchScheme(LIGHT_MODE);
	} else {
		// 如果当前是自动模式，根据时间决定切换到哪个模式
		switchScheme(getInitialModeByTime() === LIGHT_MODE ? DARK_MODE : LIGHT_MODE);
	}
}

function showPanel() {
	const panel = document.querySelector("#light-dark-panel");
	if (panel) {
		panel.classList.remove("float-panel-closed");
	}
}

function hidePanel() {
	const panel = document.querySelector("#light-dark-panel");
	if (panel) {
		panel.classList.add("float-panel-closed");
	}
}
</script>

<!-- z-50 make the panel higher than other float panels -->
<div class="relative z-50" role="menu" tabindex="-1" onmouseleave={hidePanel}>
    <button aria-label="Light/Dark Mode" role="menuitem" class="relative btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90" id="scheme-switch" onclick={toggleScheme} onmouseenter={showPanel}>
        <div class="absolute" class:opacity-0={mode !== LIGHT_MODE}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute" class:opacity-0={mode !== DARK_MODE}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute" class:opacity-0={mode !== AUTO_MODE}>
            <Icon icon="material-symbols:radio-button-partial-outline" class="text-[1.25rem]"></Icon>
        </div>
    </button>

    <div id="light-dark-panel" class="hidden lg:block absolute transition float-panel-closed top-11 -right-2 pt-5" >
        <div class="card-base float-panel p-2">
            <button class="flex transition whitespace-nowrap items-center !justify-start w-full btn-plain scale-animation rounded-lg h-9 px-3 font-medium active:scale-95 mb-0.5 theme-menu-item"
                    class:current-theme-btn={mode === LIGHT_MODE}
                    onclick={() => switchScheme(LIGHT_MODE)}
            >
                <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem] mr-3"></Icon>
                {"浅色模式"}
            </button>
            <button class="flex transition whitespace-nowrap items-center !justify-start w-full btn-plain scale-animation rounded-lg h-9 px-3 font-medium active:scale-95 mb-0.5 theme-menu-item"
                    class:current-theme-btn={mode === DARK_MODE}
                    onclick={() => switchScheme(DARK_MODE)}
            >
                <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem] mr-3"></Icon>
                {"深色模式"}
            </button>
            <button class="flex transition whitespace-nowrap items-center !justify-start w-full btn-plain scale-animation rounded-lg h-9 px-3 font-medium active:scale-95 theme-menu-item"
                    class:current-theme-btn={mode === AUTO_MODE}
                    onclick={() => switchScheme(AUTO_MODE)}
            >
                <Icon icon="material-symbols:radio-button-partial-outline" class="text-[1.25rem] mr-3"></Icon>
                {"跟随系统"}
            </button>
        </div>
    </div>
</div>
