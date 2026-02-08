/**
 * /me/ account settings page logic.
 *
 * Converted from the original `<script is:inline>` so that Swup navigation
 * correctly re-initialises the page without a full reload.
 */

// ---------------------------------------------------------------------------
// Module-scope helpers (no DOM dependency)
// ---------------------------------------------------------------------------

const OUTSIDE_CLICK_KEY = "__mizuki_me_page_outside_click__";

interface RuntimeWindow extends Window {
	[OUTSIDE_CLICK_KEY]?: ((e: MouseEvent) => void) | undefined;
}
const runtimeWindow = window as RuntimeWindow;

const normalizeApiUrl = (input: string): string => {
	const [pathname, search = ""] = String(input || "").split("?");
	const normalizedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
	return search ? `${normalizedPath}?${search}` : normalizedPath;
};

interface ApiResult {
	response: Response;
	data: Record<string, unknown> | null;
}

const api = async (url: string, init: RequestInit = {}): Promise<ApiResult> => {
	const isFormData =
		typeof FormData !== "undefined" &&
		Boolean(init.body) &&
		init.body instanceof FormData;
	const response = await fetch(normalizeApiUrl(url), {
		credentials: "include",
		headers: {
			Accept: "application/json",
			...(init.body && !isFormData
				? { "Content-Type": "application/json" }
				: {}),
			...((init.headers as Record<string, string>) || {}),
		},
		...init,
	});
	const data: Record<string, unknown> | null = await response
		.json()
		.catch(() => null);
	return { response, data };
};

const isHanCharacter = (char: string): boolean =>
	/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(char);

const calculateUsernameWeight = (value: string): number => {
	let total = 0;
	for (const char of String(value || "")) {
		total += isHanCharacter(char) ? 2 : 1;
	}
	return total;
};

const calculateTextWeight = (value: string): number => {
	let total = 0;
	for (const char of String(value || "")) {
		total += isHanCharacter(char) ? 2 : 1;
	}
	return total;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const buildAssetUrl = (fileId: string): string => {
	const normalized = String(fileId || "").trim();
	if (!normalized) {
		return "";
	}
	return `/api/v1/public/assets/${encodeURIComponent(normalized)}/?width=128&height=128&fit=cover`;
};

const buildLoginRedirectHref = (): string => {
	const pathname = String(window.location.pathname || "/");
	const search = String(window.location.search || "");
	const hash = String(window.location.hash || "");
	const redirect = `${pathname}${search}${hash}` || "/";
	if (!redirect.startsWith("/") || redirect.startsWith("//")) {
		return "/login/";
	}
	return `/login/?redirect=${encodeURIComponent(redirect)}`;
};

const extractFileId = (value: unknown): string => {
	if (!value) {
		return "";
	}
	if (typeof value === "string") {
		return value.trim();
	}
	if (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof (value as { id: unknown }).id === "string"
	) {
		return String((value as { id: string }).id || "").trim();
	}
	return "";
};

const AUTH_ME_RETRY_DELAY_MS = 220;
const USERNAME_MAX_WEIGHT = 14;
const PROFILE_BIO_MAX_LENGTH = 30;
const AVATAR_CROP_OUTPUT_SIZE = 512;
const AVATAR_CROP_ZOOM_MIN = 100;
const AVATAR_CROP_ZOOM_MAX = 300;

const EMPTY_AVATAR_SRC =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect width='128' height='128' fill='%23d1d5db'/%3E%3C/svg%3E";

const DATA_BOUND = "data-me-bound";

// ---------------------------------------------------------------------------
// initMePage — called on first load AND on every astro:after-swap
// ---------------------------------------------------------------------------

export function initMePage(): void {
	const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
	if (normalizedPath !== "/me") {
		return;
	}

	// ---- DOM queries (fresh every call) ----
	const authenticatedSections = document.getElementById(
		"me-authenticated-sections",
	);
	const profileMsg = document.getElementById("me-profile-msg");
	const privacyMsg = document.getElementById("me-privacy-msg");
	const emailInput = document.getElementById(
		"me-email",
	) as HTMLInputElement | null;
	const usernameDisplayBtn = document.getElementById(
		"me-username-display-btn",
	) as HTMLButtonElement | null;
	const usernameDisplayText = document.getElementById("me-username-display");
	const usernameEditor = document.getElementById("me-username-editor");
	const usernameInput = document.getElementById(
		"me-username",
	) as HTMLInputElement | null;
	const usernameCounter = document.getElementById("me-username-counter");
	const bioDisplayBtn = document.getElementById(
		"me-bio-display-btn",
	) as HTMLButtonElement | null;
	const bioDisplayText = document.getElementById("me-bio-display");
	const bioEditor = document.getElementById("me-bio-editor");
	const bioInput = document.getElementById(
		"me-bio",
	) as HTMLTextAreaElement | null;
	const bioCounter = document.getElementById("me-bio-counter");
	const avatarPreviewEl = document.getElementById(
		"me-avatar-preview",
	) as HTMLImageElement | null;
	const avatarUrlInput = document.getElementById(
		"me-avatar-url",
	) as HTMLInputElement | null;
	const avatarUploadBtn = document.getElementById("me-avatar-upload-btn");
	const avatarClearBtn = document.getElementById("me-avatar-clear-btn");
	const avatarCropModal = document.getElementById("me-avatar-crop-modal");
	const avatarCropViewport = document.getElementById(
		"me-avatar-crop-viewport",
	) as HTMLElement | null;
	const avatarCropImage = document.getElementById(
		"me-avatar-crop-image",
	) as HTMLImageElement | null;
	const avatarCropEmpty = document.getElementById("me-avatar-crop-empty");
	const avatarCropFileInput = document.getElementById(
		"me-avatar-crop-file",
	) as HTMLInputElement | null;
	const avatarCropSelectBtn = document.getElementById(
		"me-avatar-crop-select-btn",
	);
	const avatarCropApplyBtn = document.getElementById(
		"me-avatar-crop-apply-btn",
	) as HTMLButtonElement | null;
	const avatarCropCancelBtn = document.getElementById(
		"me-avatar-crop-cancel-btn",
	);
	const avatarCropZoomInput = document.getElementById(
		"me-avatar-crop-zoom",
	) as HTMLInputElement | null;
	const avatarCropMsg = document.getElementById("me-avatar-crop-msg");

	if (!authenticatedSections) {
		return;
	}

	// ---- mutable state ----
	let currentAvatarFileId = "";
	let currentAvatarFallbackUrl = "";
	let avatarCropObjectUrl = "";
	let avatarCropLoaded = false;
	let avatarCropImageWidth = 0;
	let avatarCropImageHeight = 0;
	let avatarCropViewportSize = 0;
	let avatarCropMinScale = 1;
	let avatarCropScale = 1;
	let avatarCropOffsetX = 0;
	let avatarCropOffsetY = 0;
	let avatarCropPointerId: number | null = null;
	let avatarCropPointerX = 0;
	let avatarCropPointerY = 0;
	let avatarUploading = false;

	// ---- DOM helpers (closures over fresh refs) ----

	const updateAvatarPreview = (): void => {
		if (!avatarPreviewEl) {
			return;
		}
		const avatarUrl = avatarUrlInput
			? String(avatarUrlInput.value || "").trim()
			: "";
		const src =
			avatarUrl ||
			buildAssetUrl(currentAvatarFileId) ||
			currentAvatarFallbackUrl;
		avatarPreviewEl.src = src || EMPTY_AVATAR_SRC;
	};

	const setProfileMessage = (message: string): void => {
		if (profileMsg) {
			profileMsg.textContent = message;
		}
	};

	const setCropMessage = (message: string): void => {
		if (avatarCropMsg) {
			avatarCropMsg.textContent = message;
		}
	};

	const setUsernameEditing = (editing: boolean, focusInput = false): void => {
		if (!usernameDisplayBtn || !usernameEditor) {
			return;
		}
		usernameDisplayBtn.classList.toggle("hidden", editing);
		usernameEditor.classList.toggle("hidden", !editing);
		if (editing && focusInput && usernameInput) {
			window.requestAnimationFrame(() => {
				usernameInput.focus();
				const length = usernameInput.value.length;
				usernameInput.setSelectionRange(length, length);
			});
		}
	};

	const setBioEditing = (editing: boolean, focusInput = false): void => {
		if (!bioDisplayBtn || !bioEditor) {
			return;
		}
		bioDisplayBtn.classList.toggle("hidden", editing);
		bioEditor.classList.toggle("hidden", !editing);
		if (editing && focusInput && bioInput) {
			window.requestAnimationFrame(() => {
				bioInput.focus();
				const length = bioInput.value.length;
				bioInput.setSelectionRange(length, length);
			});
		}
	};

	const updateUsernameCounter = (): void => {
		if (!usernameInput || !usernameCounter) {
			return;
		}
		const current = calculateUsernameWeight(
			String(usernameInput.value || "").trim(),
		);
		usernameCounter.textContent = `${current}/${USERNAME_MAX_WEIGHT}`;
	};

	const updateUsernameDisplay = (): void => {
		if (!usernameDisplayText || !usernameInput) {
			return;
		}
		const text = String(usernameInput.value || "").trim();
		const hasValue = Boolean(text);
		usernameDisplayText.textContent = hasValue ? text : "点击编辑用户名";
		usernameDisplayText.classList.toggle("text-60", !hasValue);
	};

	const updateBioCounter = (): void => {
		if (!bioInput || !bioCounter) {
			return;
		}
		const current = calculateTextWeight(String(bioInput.value || ""));
		bioCounter.textContent = `${current}/${PROFILE_BIO_MAX_LENGTH}`;
	};

	const updateBioDisplay = (): void => {
		if (!bioDisplayText || !bioInput) {
			return;
		}
		const text = String(bioInput.value || "").trim();
		const hasValue = Boolean(text);
		bioDisplayText.textContent = hasValue ? text : "点击编辑简介";
		bioDisplayText.classList.toggle("text-60", !hasValue);
	};

	const validateUsernameInput = (): string | null => {
		if (!usernameInput) {
			return null;
		}
		const raw = String(usernameInput.value || "").trim();
		if (!raw) {
			return "用户名不能为空";
		}
		if (
			!/^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFFA-Za-z0-9_-]+$/u.test(
				raw,
			)
		) {
			return "用户名仅支持中文、英文、数字、下划线和短横线";
		}
		if (calculateUsernameWeight(raw) > USERNAME_MAX_WEIGHT) {
			return "用户名最多 14 字符（中文按 2 字符计）";
		}
		return null;
	};

	const validateBioInput = (): string | null => {
		if (!bioInput) {
			return null;
		}
		if (
			calculateTextWeight(String(bioInput.value || "")) >
			PROFILE_BIO_MAX_LENGTH
		) {
			return "个人简介最多 30 字符（中文按 2 字符计）";
		}
		return null;
	};

	// ---- avatar crop helpers ----

	const revokeAvatarCropObjectUrl = (): void => {
		if (avatarCropObjectUrl) {
			URL.revokeObjectURL(avatarCropObjectUrl);
			avatarCropObjectUrl = "";
		}
	};

	const setAvatarCropEmptyVisible = (visible: boolean): void => {
		if (avatarCropEmpty) {
			avatarCropEmpty.classList.toggle("hidden", !visible);
		}
	};

	const setAvatarCropApplyEnabled = (enabled: boolean): void => {
		if (avatarCropApplyBtn) {
			avatarCropApplyBtn.disabled = !enabled;
		}
	};

	const updateAvatarCropApplyState = (): void => {
		setAvatarCropApplyEnabled(avatarCropLoaded && !avatarUploading);
		if (avatarCropApplyBtn) {
			avatarCropApplyBtn.textContent = avatarUploading
				? "上传中..."
				: "裁剪并上传";
		}
	};

	const resetAvatarCropState = (): void => {
		revokeAvatarCropObjectUrl();
		avatarCropLoaded = false;
		avatarCropImageWidth = 0;
		avatarCropImageHeight = 0;
		avatarCropViewportSize = 0;
		avatarCropMinScale = 1;
		avatarCropScale = 1;
		avatarCropOffsetX = 0;
		avatarCropOffsetY = 0;
		avatarCropPointerId = null;
		avatarCropPointerX = 0;
		avatarCropPointerY = 0;
		if (avatarCropImage) {
			avatarCropImage.removeAttribute("src");
			avatarCropImage.classList.add("hidden");
			avatarCropImage.style.transform = "";
			avatarCropImage.style.width = "";
			avatarCropImage.style.height = "";
			avatarCropImage.style.transformOrigin = "top left";
		}
		if (avatarCropZoomInput) {
			avatarCropZoomInput.value = String(AVATAR_CROP_ZOOM_MIN);
		}
		setAvatarCropEmptyVisible(true);
		updateAvatarCropApplyState();
	};

	const openAvatarCropModal = (): void => {
		if (!avatarCropModal) {
			setProfileMessage("裁剪层初始化失败");
			return;
		}
		avatarCropModal.classList.remove("hidden");
		avatarCropModal.classList.add("flex");
		document.body.classList.add("overflow-hidden");
		avatarCropModal.focus();
	};

	const closeAvatarCropModal = (): void => {
		if (!avatarCropModal) {
			return;
		}
		avatarCropModal.classList.remove("flex");
		avatarCropModal.classList.add("hidden");
		document.body.classList.remove("overflow-hidden");
		if (avatarCropFileInput) {
			avatarCropFileInput.value = "";
		}
		resetAvatarCropState();
		avatarUploading = false;
		updateAvatarCropApplyState();
		setCropMessage("");
	};

	const measureAvatarCropViewportSize = (): number => {
		if (!avatarCropViewport) {
			return 0;
		}
		const rect = avatarCropViewport.getBoundingClientRect();
		return Math.max(0, Math.floor(Math.min(rect.width, rect.height)));
	};

	const clampAvatarCropOffset = (): void => {
		if (!avatarCropLoaded || avatarCropViewportSize <= 0) {
			return;
		}
		const scaledWidth = avatarCropImageWidth * avatarCropScale;
		const scaledHeight = avatarCropImageHeight * avatarCropScale;
		const minX = avatarCropViewportSize - scaledWidth;
		const minY = avatarCropViewportSize - scaledHeight;
		avatarCropOffsetX = clamp(avatarCropOffsetX, minX, 0);
		avatarCropOffsetY = clamp(avatarCropOffsetY, minY, 0);
	};

	const renderAvatarCropImage = (): void => {
		if (!avatarCropImage) {
			return;
		}
		if (!avatarCropLoaded) {
			avatarCropImage.classList.add("hidden");
			setAvatarCropEmptyVisible(true);
			return;
		}
		clampAvatarCropOffset();
		avatarCropImage.classList.remove("hidden");
		avatarCropImage.style.width = `${avatarCropImageWidth}px`;
		avatarCropImage.style.height = `${avatarCropImageHeight}px`;
		avatarCropImage.style.transformOrigin = "top left";
		avatarCropImage.style.transform = `translate3d(${avatarCropOffsetX}px, ${avatarCropOffsetY}px, 0) scale(${avatarCropScale})`;
		setAvatarCropEmptyVisible(false);
	};

	const setAvatarCropScaleFromZoom = (
		zoomPercent: number,
		anchorX: number,
		anchorY: number,
	): void => {
		if (!avatarCropLoaded || avatarCropViewportSize <= 0) {
			return;
		}
		const normalizedZoom = clamp(
			Number.isFinite(zoomPercent) ? zoomPercent : AVATAR_CROP_ZOOM_MIN,
			AVATAR_CROP_ZOOM_MIN,
			AVATAR_CROP_ZOOM_MAX,
		);
		const nextScale = avatarCropMinScale * (normalizedZoom / 100);
		const safeAnchorX = clamp(anchorX, 0, avatarCropViewportSize);
		const safeAnchorY = clamp(anchorY, 0, avatarCropViewportSize);
		const imagePointX = (safeAnchorX - avatarCropOffsetX) / avatarCropScale;
		const imagePointY = (safeAnchorY - avatarCropOffsetY) / avatarCropScale;
		avatarCropScale = nextScale;
		avatarCropOffsetX = safeAnchorX - imagePointX * avatarCropScale;
		avatarCropOffsetY = safeAnchorY - imagePointY * avatarCropScale;
		clampAvatarCropOffset();
		renderAvatarCropImage();
		if (avatarCropZoomInput) {
			avatarCropZoomInput.value = String(Math.round(normalizedZoom));
		}
	};

	const loadAvatarCropFile = (file: File): void => {
		if (!avatarCropImage) {
			setCropMessage("裁剪层初始化失败");
			return;
		}
		if (!file.type.startsWith("image/")) {
			setCropMessage("请选择图片文件");
			return;
		}
		const AVATAR_MAX_SIZE = 1.5 * 1024 * 1024;
		if (file.size > AVATAR_MAX_SIZE) {
			setCropMessage("图片文件过大，请选择不超过 1.5 MB 的图片");
			return;
		}
		setCropMessage("");
		const nextObjectUrl = URL.createObjectURL(file);
		const img = avatarCropImage;
		img.onload = () => {
			avatarCropLoaded = true;
			avatarCropImageWidth = Math.max(1, img.naturalWidth);
			avatarCropImageHeight = Math.max(1, img.naturalHeight);
			avatarCropViewportSize = measureAvatarCropViewportSize();
			if (avatarCropViewportSize <= 0) {
				avatarCropViewportSize = 320;
			}
			avatarCropMinScale = Math.max(
				avatarCropViewportSize / avatarCropImageWidth,
				avatarCropViewportSize / avatarCropImageHeight,
			);
			avatarCropScale = avatarCropMinScale;
			avatarCropOffsetX =
				(avatarCropViewportSize -
					avatarCropImageWidth * avatarCropScale) /
				2;
			avatarCropOffsetY =
				(avatarCropViewportSize -
					avatarCropImageHeight * avatarCropScale) /
				2;
			if (avatarCropZoomInput) {
				avatarCropZoomInput.value = String(AVATAR_CROP_ZOOM_MIN);
			}
			renderAvatarCropImage();
			updateAvatarCropApplyState();
			setProfileMessage("");
		};
		img.onerror = () => {
			setCropMessage("图片读取失败，请重试");
			resetAvatarCropState();
		};
		revokeAvatarCropObjectUrl();
		avatarCropObjectUrl = nextObjectUrl;
		img.src = nextObjectUrl;
	};

	const buildAvatarCropBlob = async (): Promise<Blob | null> => {
		if (!avatarCropLoaded || !avatarCropImage) {
			return null;
		}
		if (avatarCropViewportSize <= 0) {
			return null;
		}
		const canvas = document.createElement("canvas");
		canvas.width = AVATAR_CROP_OUTPUT_SIZE;
		canvas.height = AVATAR_CROP_OUTPUT_SIZE;
		const context = canvas.getContext("2d");
		if (!context) {
			return null;
		}
		const ratio = AVATAR_CROP_OUTPUT_SIZE / avatarCropViewportSize;
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(
			avatarCropImage,
			avatarCropOffsetX * ratio,
			avatarCropOffsetY * ratio,
			avatarCropImageWidth * avatarCropScale * ratio,
			avatarCropImageHeight * avatarCropScale * ratio,
		);
		return await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
		});
	};

	const uploadAvatarFromCrop = async (): Promise<void> => {
		if (!avatarCropLoaded) {
			setCropMessage("请先选择头像文件");
			return;
		}
		avatarUploading = true;
		updateAvatarCropApplyState();
		try {
			const croppedBlob = await buildAvatarCropBlob();
			if (!croppedBlob) {
				setCropMessage("头像裁剪失败");
				return;
			}
			const formData = new FormData();
			formData.append("file", croppedBlob, `avatar-${Date.now()}.jpg`);
			formData.append("title", `avatar-${Date.now()}`);
			const { response, data } = await api("/api/v1/uploads", {
				method: "POST",
				body: formData,
			});
			if (
				!response.ok ||
				!data?.ok ||
				!(data?.file as Record<string, unknown> | undefined)?.id
			) {
				setCropMessage(
					(data?.message as string | undefined) || "头像上传失败",
				);
				return;
			}
			currentAvatarFileId = String(
				(data.file as Record<string, unknown>).id,
			);
			if (avatarUrlInput) {
				avatarUrlInput.value = "";
			}
			updateAvatarPreview();
			closeAvatarCropModal();
			setProfileMessage("头像上传成功，请点击\u201C保存资料\u201D生效");
		} finally {
			avatarUploading = false;
			updateAvatarCropApplyState();
		}
	};

	// ---- fill helpers ----

	const fillProfile = (
		profile: Record<string, unknown> | null | undefined,
		fallbackAvatarUrl = "",
	): void => {
		if (usernameInput) {
			usernameInput.value = (profile?.username as string) || "";
			updateUsernameCounter();
			updateUsernameDisplay();
			setUsernameEditing(false);
		}
		if (avatarUrlInput) {
			avatarUrlInput.value = (profile?.avatar_url as string) || "";
		}
		currentAvatarFileId = extractFileId(profile?.avatar_file);
		currentAvatarFallbackUrl = String(fallbackAvatarUrl || "").trim();
		updateAvatarPreview();
		if (bioInput) {
			bioInput.value = (profile?.bio as string) || "";
			updateBioCounter();
			updateBioDisplay();
			setBioEditing(false);
		}
	};

	const fillPrivacy = (
		privacy: Record<string, unknown> | null | undefined,
	): void => {
		const ids: [string, string][] = [
			["pv-profile-public", "profile_public"],
			["pv-show-articles", "show_articles_on_profile"],
			["pv-show-diaries", "show_diaries_on_profile"],
			["pv-show-anime", "show_anime_on_profile"],
			["pv-show-albums", "show_albums_on_profile"],
			["pv-show-comments", "show_comments_on_profile"],
		];
		for (const [elId, key] of ids) {
			const el = document.getElementById(elId) as HTMLInputElement | null;
			if (el) {
				el.checked = Boolean(privacy?.[key]);
			}
		}
	};

	const loadAuthMe = async (): Promise<ApiResult> => {
		let result = await api("/api/auth/me/");
		if (
			(!result.response.ok || !result.data?.ok) &&
			result.response.status === 401
		) {
			await new Promise<void>((resolve) =>
				window.setTimeout(resolve, AUTH_ME_RETRY_DELAY_MS),
			);
			result = await api("/api/auth/me/");
		}
		return result;
	};

	// ---- initial state ----

	resetAvatarCropState();
	updateAvatarPreview();
	updateUsernameCounter();
	updateBioCounter();
	updateUsernameDisplay();
	updateBioDisplay();
	setUsernameEditing(false);
	setBioEditing(false);

	// ---- event bindings (guarded with data-bound to prevent duplicates) ----

	const profileForm = document.getElementById("me-profile-form");
	if (profileForm && !profileForm.hasAttribute(DATA_BOUND)) {
		profileForm.setAttribute(DATA_BOUND, "");
		profileForm.addEventListener("submit", async (event: Event) => {
			event.preventDefault();
			const usernameError = validateUsernameInput();
			if (usernameError) {
				setProfileMessage(usernameError);
				return;
			}
			const bioError = validateBioInput();
			if (bioError) {
				setProfileMessage(bioError);
				return;
			}
			const avatarUrl = avatarUrlInput
				? String(avatarUrlInput.value || "").trim()
				: "";
			const payload = {
				username: usernameInput ? usernameInput.value : "",
				bio: bioInput ? bioInput.value : "",
				avatar_url: avatarUrl || null,
				avatar_file: avatarUrl ? null : currentAvatarFileId || null,
			};
			const { response, data } = await api("/api/v1/me/profile", {
				method: "PATCH",
				body: JSON.stringify(payload),
			});
			if (!response.ok || !data?.ok) {
				setProfileMessage(
					(data?.message as string | undefined) || "保存失败",
				);
				return;
			}
			setProfileMessage("已保存，正在刷新...");
			window.setTimeout(() => {
				window.location.reload();
			}, 120);
		});
	}

	if (avatarUrlInput && !avatarUrlInput.hasAttribute(DATA_BOUND)) {
		avatarUrlInput.setAttribute(DATA_BOUND, "");
		avatarUrlInput.addEventListener("input", () => updateAvatarPreview());
	}

	if (usernameInput && !usernameInput.hasAttribute(DATA_BOUND)) {
		usernameInput.setAttribute(DATA_BOUND, "");
		usernameInput.addEventListener("input", () => {
			updateUsernameCounter();
			updateUsernameDisplay();
		});
	}

	if (bioInput && !bioInput.hasAttribute(DATA_BOUND)) {
		bioInput.setAttribute(DATA_BOUND, "");
		bioInput.addEventListener("input", () => {
			updateBioCounter();
			updateBioDisplay();
		});
	}

	if (usernameDisplayBtn && !usernameDisplayBtn.hasAttribute(DATA_BOUND)) {
		usernameDisplayBtn.setAttribute(DATA_BOUND, "");
		usernameDisplayBtn.addEventListener("click", () =>
			setUsernameEditing(true, true),
		);
	}

	if (bioDisplayBtn && !bioDisplayBtn.hasAttribute(DATA_BOUND)) {
		bioDisplayBtn.setAttribute(DATA_BOUND, "");
		bioDisplayBtn.addEventListener("click", () =>
			setBioEditing(true, true),
		);
	}

	// outside-click: remove previous handler, register new one
	const previousOutsideClick = runtimeWindow[OUTSIDE_CLICK_KEY];
	if (typeof previousOutsideClick === "function") {
		document.removeEventListener("click", previousOutsideClick);
	}

	const handleOutsideClick = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Node)) {
			return;
		}
		if (usernameEditor && !usernameEditor.classList.contains("hidden")) {
			const insideEditor = usernameEditor.contains(target);
			const insideDisplay = usernameDisplayBtn?.contains(target);
			if (!insideEditor && !insideDisplay) {
				setUsernameEditing(false);
			}
		}
		if (bioEditor && !bioEditor.classList.contains("hidden")) {
			const insideEditor = bioEditor.contains(target);
			const insideDisplay = bioDisplayBtn?.contains(target);
			if (!insideEditor && !insideDisplay) {
				setBioEditing(false);
			}
		}
	};
	document.addEventListener("click", handleOutsideClick);
	runtimeWindow[OUTSIDE_CLICK_KEY] = handleOutsideClick;

	// avatar upload / crop buttons
	if (avatarUploadBtn && !avatarUploadBtn.hasAttribute(DATA_BOUND)) {
		avatarUploadBtn.setAttribute(DATA_BOUND, "");
		avatarUploadBtn.addEventListener("click", () => {
			openAvatarCropModal();
			setProfileMessage("");
		});
	}

	if (avatarCropSelectBtn && !avatarCropSelectBtn.hasAttribute(DATA_BOUND)) {
		avatarCropSelectBtn.setAttribute(DATA_BOUND, "");
		avatarCropSelectBtn.addEventListener("click", () => {
			if (avatarCropFileInput) {
				avatarCropFileInput.click();
			}
		});
	}

	if (avatarCropFileInput && !avatarCropFileInput.hasAttribute(DATA_BOUND)) {
		avatarCropFileInput.setAttribute(DATA_BOUND, "");
		avatarCropFileInput.addEventListener("change", () => {
			const file = avatarCropFileInput.files?.[0];
			if (file) {
				loadAvatarCropFile(file);
			}
		});
	}

	if (avatarCropZoomInput && !avatarCropZoomInput.hasAttribute(DATA_BOUND)) {
		avatarCropZoomInput.setAttribute(DATA_BOUND, "");
		avatarCropZoomInput.addEventListener("input", () => {
			const zoom = Number.parseFloat(
				avatarCropZoomInput.value || String(AVATAR_CROP_ZOOM_MIN),
			);
			const anchor =
				avatarCropViewportSize > 0 ? avatarCropViewportSize / 2 : 0;
			setAvatarCropScaleFromZoom(zoom, anchor, anchor);
		});
	}

	if (avatarCropApplyBtn && !avatarCropApplyBtn.hasAttribute(DATA_BOUND)) {
		avatarCropApplyBtn.setAttribute(DATA_BOUND, "");
		avatarCropApplyBtn.addEventListener("click", async () => {
			await uploadAvatarFromCrop();
		});
	}

	if (avatarCropCancelBtn && !avatarCropCancelBtn.hasAttribute(DATA_BOUND)) {
		avatarCropCancelBtn.setAttribute(DATA_BOUND, "");
		avatarCropCancelBtn.addEventListener("click", () => {
			if (!avatarUploading) {
				closeAvatarCropModal();
			}
		});
	}

	if (avatarCropModal && !avatarCropModal.hasAttribute(DATA_BOUND)) {
		avatarCropModal.setAttribute(DATA_BOUND, "");
		avatarCropModal.addEventListener("click", (event: MouseEvent) => {
			if (!avatarUploading && event.target === avatarCropModal) {
				closeAvatarCropModal();
			}
		});
		avatarCropModal.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Escape" && !avatarUploading) {
				closeAvatarCropModal();
			}
		});
	}

	if (avatarCropViewport && !avatarCropViewport.hasAttribute(DATA_BOUND)) {
		avatarCropViewport.setAttribute(DATA_BOUND, "");
		avatarCropViewport.addEventListener(
			"pointerdown",
			(event: PointerEvent) => {
				if (!avatarCropLoaded || !avatarCropViewport) {
					return;
				}
				avatarCropPointerId = event.pointerId;
				avatarCropPointerX = event.clientX;
				avatarCropPointerY = event.clientY;
				avatarCropViewport.setPointerCapture(event.pointerId);
				event.preventDefault();
			},
		);
		avatarCropViewport.addEventListener(
			"pointermove",
			(event: PointerEvent) => {
				if (
					!avatarCropLoaded ||
					avatarCropPointerId !== event.pointerId
				) {
					return;
				}
				const deltaX = event.clientX - avatarCropPointerX;
				const deltaY = event.clientY - avatarCropPointerY;
				avatarCropPointerX = event.clientX;
				avatarCropPointerY = event.clientY;
				avatarCropOffsetX += deltaX;
				avatarCropOffsetY += deltaY;
				renderAvatarCropImage();
				event.preventDefault();
			},
		);
		const releasePointer = (event: PointerEvent): void => {
			if (
				avatarCropPointerId !== event.pointerId ||
				!avatarCropViewport
			) {
				return;
			}
			if (avatarCropViewport.hasPointerCapture(event.pointerId)) {
				avatarCropViewport.releasePointerCapture(event.pointerId);
			}
			avatarCropPointerId = null;
		};
		avatarCropViewport.addEventListener("pointerup", releasePointer);
		avatarCropViewport.addEventListener("pointercancel", releasePointer);
	}

	if (avatarClearBtn && !avatarClearBtn.hasAttribute(DATA_BOUND)) {
		avatarClearBtn.setAttribute(DATA_BOUND, "");
		avatarClearBtn.addEventListener("click", () => {
			currentAvatarFileId = "";
			currentAvatarFallbackUrl = "";
			if (avatarUrlInput) {
				avatarUrlInput.value = "";
			}
			if (avatarCropFileInput) {
				avatarCropFileInput.value = "";
			}
			updateAvatarPreview();
			setProfileMessage("已清空头像，点击\u201C保存资料\u201D生效");
		});
	}

	const privacyForm = document.getElementById("me-privacy-form");
	if (privacyForm && !privacyForm.hasAttribute(DATA_BOUND)) {
		privacyForm.setAttribute(DATA_BOUND, "");
		privacyForm.addEventListener("submit", async (event: Event) => {
			event.preventDefault();
			const ids: [string, string][] = [
				["pv-profile-public", "profile_public"],
				["pv-show-articles", "show_articles_on_profile"],
				["pv-show-diaries", "show_diaries_on_profile"],
				["pv-show-anime", "show_anime_on_profile"],
				["pv-show-albums", "show_albums_on_profile"],
				["pv-show-comments", "show_comments_on_profile"],
			];
			const payload: Record<string, boolean> = {};
			for (const [elId, key] of ids) {
				const el = document.getElementById(
					elId,
				) as HTMLInputElement | null;
				payload[key] = el?.checked ?? false;
			}
			const { response, data } = await api("/api/v1/me/privacy", {
				method: "PATCH",
				body: JSON.stringify(payload),
			});
			if (privacyMsg) {
				privacyMsg.textContent =
					response.ok && data?.ok
						? "已保存"
						: (data?.message as string | undefined) || "保存失败";
			}
		});
	}

	// ---- kick off auth check ----

	const runInit = async (): Promise<void> => {
		authenticatedSections.classList.add("hidden");
		const me = await loadAuthMe();
		if (!me.response.ok || !me.data?.ok) {
			window.location.href = buildLoginRedirectHref();
			return;
		}
		const loginEmail = String(
			(me.data.user as Record<string, unknown> | undefined)?.email || "",
		).trim();
		const fallbackAvatarUrl = String(
			(me.data.user as Record<string, unknown> | undefined)?.avatarUrl ||
				"",
		).trim();
		if (emailInput) {
			emailInput.value = loginEmail;
		}
		currentAvatarFallbackUrl = fallbackAvatarUrl;
		updateAvatarPreview();

		const [profileResp, privacyResp] = await Promise.all([
			api("/api/v1/me/profile"),
			api("/api/v1/me/privacy"),
		]);
		if (profileResp.response.ok && profileResp.data?.ok) {
			fillProfile(
				profileResp.data.profile as Record<string, unknown> | undefined,
				fallbackAvatarUrl,
			);
		}
		if (privacyResp.response.ok && privacyResp.data?.ok) {
			fillPrivacy(
				privacyResp.data.privacy as Record<string, unknown> | undefined,
			);
		}
		authenticatedSections.classList.remove("hidden");
	};

	runInit().catch((err) => {
		console.error("[me-page] init failed", err);
	});
}

// NOTE: Initialization is handled by the global layout runtime via dynamic
// import, not by module-level auto-init. This avoids reliance on
// SwupHeadPlugin to load page-specific module scripts during Swup navigation.
