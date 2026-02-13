import { showConfirmDialog } from "@/scripts/dialogs";
import { showOverlayDialog } from "@/scripts/overlay-dialog";

const normalizeApiUrl = (input: string): string => {
	const [pathname, search = ""] = String(input || "").split("?");
	const normalizedPath = pathname.endsWith("/")
		? pathname.slice(0, -1)
		: pathname;
	return search ? `${normalizedPath}?${search}` : normalizedPath;
};

const api = async (url: string, init: RequestInit = {}) => {
	const response = await fetch(normalizeApiUrl(url), {
		credentials: "include",
		headers: {
			Accept: "application/json",
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...((init.headers as Record<string, string>) || {}),
		},
		...init,
	});
	const data = await response.json().catch(() => null);
	return { response, data };
};

const getUsersTableBody = (): HTMLTableSectionElement | null =>
	document.getElementById(
		"admin-users-table",
	) as HTMLTableSectionElement | null;
const getRegisterEnabledInput = (): HTMLInputElement | null =>
	document.getElementById(
		"admin-register-enabled",
	) as HTMLInputElement | null;
const getRegisterMessage = (): HTMLElement | null =>
	document.getElementById("admin-register-msg");
const getRegistrationTableBody = (): HTMLTableSectionElement | null =>
	document.getElementById(
		"admin-registration-table",
	) as HTMLTableSectionElement | null;
const getRegistrationMessage = (): HTMLElement | null =>
	document.getElementById("admin-registration-msg");
const getRegistrationStatusSelect = (): HTMLSelectElement | null =>
	document.getElementById(
		"admin-registration-status",
	) as HTMLSelectElement | null;

const setRegistrationMessage = (message: string) => {
	const registrationMessage = getRegistrationMessage();
	if (!registrationMessage) {
		return;
	}
	registrationMessage.textContent = String(message || "");
};

const setRegisterMessage = (message: string) => {
	const registerMessage = getRegisterMessage();
	if (!registerMessage) {
		return;
	}
	registerMessage.textContent = String(message || "");
};

type UnknownRecord = Record<string, unknown>;

const resolveErrorMessage = (data: UnknownRecord | null, fallback: string) => {
	const code = String(data?.code || "");
	if (code === "REGISTER_DISABLED") {
		return "注册入口未开启";
	}
	if (code === "EMAIL_EXISTS") {
		return "邮箱已存在";
	}
	if (code === "USERNAME_EXISTS") {
		return "用户名已存在";
	}
	if (code === "REGISTRATION_REQUEST_EXISTS") {
		return "该邮箱或用户名已有待处理申请";
	}
	if (code === "REGISTRATION_STATUS_CONFLICT") {
		return "申请状态冲突，请刷新后重试";
	}
	return String(data?.message || fallback || "请求失败");
};

let registrationRequestMap = new Map<string, UnknownRecord>();

const renderUsersRows = (rows: UnknownRecord[]) => {
	const usersTableBody = getUsersTableBody();
	if (!usersTableBody) return;
	if (!Array.isArray(rows) || rows.length === 0) {
		usersTableBody.innerHTML =
			'<tr><td colspan="4" class="py-4 text-60">暂无用户数据</td></tr>';
		return;
	}
	usersTableBody.innerHTML = rows
		.map((entry) => {
			const userRecord =
				typeof entry.user === "object" && entry.user
					? (entry.user as UnknownRecord)
					: {};
			const profileRecord =
				typeof entry.profile === "object" && entry.profile
					? (entry.profile as UnknownRecord)
					: {};
			const permissionsRecord =
				typeof entry.permissions === "object" && entry.permissions
					? (entry.permissions as UnknownRecord)
					: {};

			const userId = String(userRecord.id || "");
			const userEmail = String(userRecord.email || "");
			const username = String(profileRecord.username || "");
			const appRole = String(permissionsRecord.app_role || "member");
			return `
					<tr class="border-b border-(--line-divider) text-75">
						<td class="py-2 pr-2">${userEmail}</td>
						<td class="py-2 pr-2">${username}</td>
						<td class="py-2 pr-2">
							<select data-user-id="${userId}" data-field="app_role" class="rounded border border-(--line-divider) px-2 py-1 bg-black/5 dark:bg-white/5 text-75">
								<option value="member" ${appRole === "member" ? "selected" : ""}>member</option>
								<option value="admin" ${appRole === "admin" ? "selected" : ""}>admin</option>
							</select>
						</td>
						<td class="py-2 pr-2">
							<div class="flex items-center gap-2">
								<button class="text-xs text-(--primary) hover:underline" data-action="save" data-user-id="${userId}">保存</button>
								<button class="text-xs text-red-500 hover:underline" data-action="delete" data-user-id="${userId}" data-username="${username}">删除账号</button>
							</div>
						</td>
					</tr>
				`;
		})
		.join("");
};

const renderRegistrationRows = (rows: UnknownRecord[]) => {
	const registrationTableBody = getRegistrationTableBody();
	if (!registrationTableBody) {
		return;
	}
	if (!Array.isArray(rows) || rows.length === 0) {
		registrationTableBody.innerHTML =
			'<tr><td colspan="2" class="py-4 text-60">暂无申请数据</td></tr>';
		registrationRequestMap = new Map<string, UnknownRecord>();
		return;
	}
	registrationRequestMap = new Map<string, UnknownRecord>();
	registrationTableBody.innerHTML = rows
		.map((item) => {
			const id = String(item.id || "").trim();
			if (id) {
				registrationRequestMap.set(id, item);
			}
			const avatarFile = String(item.avatar_file || "").trim();
			const avatarHtml = avatarFile
				? `<img src="/api/v1/public/assets/${encodeURIComponent(avatarFile)}?width=72&height=72&fit=cover" class="w-10 h-10 rounded-full object-cover border border-(--line-divider)" alt="avatar" loading="lazy" />`
				: '<span class="inline-flex w-10 h-10 rounded-full items-center justify-center text-xs text-50 border border-(--line-divider)">无</span>';
			const username = String(item.username || "").trim() || "未命名用户";
			const rowAttrs = id
				? `data-registration-action="detail" data-registration-id="${id}"`
				: "";
			return `
					<tr class="border-b border-(--line-divider) text-75 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" ${rowAttrs}>
						<td class="py-2 pr-2">${avatarHtml}</td>
						<td class="py-2 pr-2">
							<div class="flex items-center justify-between gap-3">
								<span>${username}</span>
								<span class="text-xs text-(--primary)">查看详情</span>
							</div>
						</td>
					</tr>
				`;
		})
		.join("");
};

const loadUsers = async () => {
	const { response, data } = await api("/api/v1/admin/users?limit=200");
	if (!response.ok || !data?.ok) {
		renderUsersRows([]);
		return;
	}
	renderUsersRows(data.items || []);
};

const loadRegisterSwitch = async () => {
	const registerEnabledInput = getRegisterEnabledInput();
	const { response, data } = await api("/api/v1/admin/settings/site");
	if (!response.ok || !data?.ok) {
		setRegisterMessage(resolveErrorMessage(data, "读取开关失败"));
		return;
	}
	const enabled = Boolean(data?.settings?.auth?.register_enabled);
	if (registerEnabledInput) {
		registerEnabledInput.checked = enabled;
	}
	setRegisterMessage("");
};

const loadRegistrationRequests = async () => {
	const registrationStatusSelect = getRegistrationStatusSelect();
	const status =
		String(registrationStatusSelect?.value || "").trim() || "pending";
	const params =
		status && status !== "all"
			? `?status=${encodeURIComponent(status)}&limit=200`
			: "?limit=200";
	const { response, data } = await api(
		`/api/v1/admin/registration-requests${params}`,
	);
	if (!response.ok || !data?.ok) {
		renderRegistrationRows([]);
		setRegistrationMessage(resolveErrorMessage(data, "加载申请失败"));
		return;
	}
	setRegistrationMessage("");
	renderRegistrationRows(data.items || []);
};

const showRegistrationDetailDialog = async (
	requestId: string,
): Promise<void> => {
	const item = registrationRequestMap.get(requestId);
	if (!item) {
		setRegistrationMessage("申请不存在或已更新，请刷新后重试");
		return;
	}

	const status = String(item.request_status || "").trim();
	const canReview = status === "pending";
	const username = String(item.username || "").trim() || "未命名用户";
	const displayName = String(item.display_name || "").trim();
	const reviewedBy = String(item.reviewed_by || "").trim();
	const reviewedAt = String(item.reviewed_at || "").trim();
	const rejectReason = String(item.reject_reason || "").trim();
	const reason = String(item.registration_reason || "").trim();
	const content = [
		{ label: "用户名", value: username, tone: "primary" as const },
		{ label: "邮箱", value: String(item.email || "").trim() || "无" },
		{ label: "昵称", value: displayName || "无" },
		{ label: "申请状态", value: status || "unknown" },
		{ label: "拒绝原因", value: rejectReason || "无" },
		{ label: "审批人", value: reviewedBy || "无" },
		{ label: "审批时间", value: reviewedAt || "无" },
		{
			label: "提交时间",
			value: String(item.date_created || "").trim() || "无",
		},
		{
			label: "注册理由",
			value: reason || "无",
			fullWidth: true,
		},
	];

	const result = await showOverlayDialog({
		ariaLabel: "注册申请详情",
		message: "注册申请详情",
		dismissKey: "close",
		content,
		contentColumns: 2,
		fields: canReview
			? [
					{
						name: "reason",
						label: "拒绝原因（可选）",
						kind: "textarea",
						required: false,
						placeholder: "仅在“拒绝申请”时写入",
						rows: 3,
					},
				]
			: [],
		actions: canReview
			? [
					{
						key: "approve",
						label: "确认通过",
						variant: "primary",
					},
					{
						key: "reject",
						label: "拒绝申请",
						variant: "danger",
					},
					{
						key: "close",
						label: "关闭",
						variant: "secondary",
					},
				]
			: [
					{
						key: "close",
						label: "关闭",
						variant: "secondary",
					},
				],
	});

	if (!canReview || result.actionKey === "close") {
		return;
	}

	const action = result.actionKey === "approve" ? "approve" : "reject";
	const payload: {
		action: "approve" | "reject";
		reason?: string;
	} = {
		action,
	};
	if (action !== "approve") {
		payload.reason = String(result.values.reason || "").trim();
	}

	setRegistrationMessage("处理中...");
	const { response, data } = await api(
		`/api/v1/admin/registration-requests/${encodeURIComponent(requestId)}`,
		{
			method: "PATCH",
			body: JSON.stringify(payload),
		},
	);
	if (!response.ok || !data?.ok) {
		setRegistrationMessage(resolveErrorMessage(data, "操作失败"));
		return;
	}

	setRegistrationMessage("操作成功");
	await loadRegistrationRequests();
	if (action === "approve") {
		await loadUsers();
	}
};

let pageEventsController: AbortController | null = null;

const bindEvents = () => {
	pageEventsController?.abort();
	pageEventsController = new AbortController();
	const { signal } = pageEventsController;

	document
		.getElementById("admin-users-refresh")
		?.addEventListener("click", () => void loadUsers(), { signal });

	document
		.getElementById("admin-registration-refresh")
		?.addEventListener("click", () => void loadRegistrationRequests(), {
			signal,
		});

	const registrationStatusSelect = getRegistrationStatusSelect();
	registrationStatusSelect?.addEventListener(
		"change",
		() => {
			void loadRegistrationRequests();
		},
		{ signal },
	);

	const registerEnabledInput = getRegisterEnabledInput();
	registerEnabledInput?.addEventListener(
		"change",
		async () => {
			const currentRegisterEnabledInput = getRegisterEnabledInput();
			if (!currentRegisterEnabledInput) {
				return;
			}
			const previousChecked = !currentRegisterEnabledInput.checked;
			currentRegisterEnabledInput.disabled = true;
			setRegisterMessage("保存中...");
			const { response, data } = await api(
				"/api/v1/admin/settings/site",
				{
					method: "PATCH",
					body: JSON.stringify({
						auth: {
							register_enabled: Boolean(
								currentRegisterEnabledInput.checked,
							),
						},
					}),
				},
			);
			if (!response.ok || !data?.ok) {
				currentRegisterEnabledInput.checked = previousChecked;
				currentRegisterEnabledInput.disabled = false;
				setRegisterMessage(resolveErrorMessage(data, "保存失败"));
				return;
			}
			currentRegisterEnabledInput.disabled = false;
			setRegisterMessage("保存成功");
		},
		{ signal },
	);

	const usersTableBody = getUsersTableBody();
	usersTableBody?.addEventListener(
		"click",
		async (event) => {
			const target =
				event.target instanceof HTMLElement ? event.target : null;
			if (!target) return;
			const action = target.getAttribute("data-action");
			const userId = target.getAttribute("data-user-id");
			if (!action || !userId) return;

			if (action === "save") {
				const row = target.closest("tr");
				if (!row) return;
				const appRole = (
					row.querySelector(
						`select[data-user-id="${userId}"][data-field="app_role"]`,
					) as HTMLSelectElement | null
				)?.value;
				const { response, data } = await api(
					`/api/v1/admin/users/${userId}`,
					{
						method: "PATCH",
						body: JSON.stringify({
							app_role: appRole,
						}),
					},
				);
				if (!response.ok || !data?.ok) {
					window.alert(resolveErrorMessage(data, "保存失败"));
					return;
				}
				await loadUsers();
				return;
			}

			if (action === "delete") {
				const username = String(
					target.getAttribute("data-username") || "",
				).trim();
				const expectedText = `确认删除${username || userId}`;
				const confirmDelete = await showConfirmDialog({
					message: "确认删除这个账号？删除后不可恢复。",
					confirmText: "确认删除",
					confirmVariant: "danger",
					manualConfirm: {
						expectedText,
						placeholder: expectedText,
						mismatchMessage: "输入内容不匹配，请重试",
					},
				});
				if (!confirmDelete) {
					return;
				}

				const { response, data } = await api(
					`/api/v1/admin/users/${userId}`,
					{
						method: "DELETE",
					},
				);
				if (!response.ok || !data?.ok) {
					window.alert(resolveErrorMessage(data, "删除失败"));
					return;
				}
				window.alert("账号已删除");
				await loadUsers();
			}
		},
		{ signal },
	);

	const registrationTableBody = getRegistrationTableBody();
	registrationTableBody?.addEventListener(
		"click",
		async (event) => {
			const target =
				event.target instanceof HTMLElement ? event.target : null;
			if (!target) {
				return;
			}
			const actionTarget = target.closest<HTMLElement>(
				"[data-registration-action]",
			);
			if (!actionTarget) {
				return;
			}
			const action = String(
				actionTarget.getAttribute("data-registration-action") || "",
			);
			const requestId = String(
				actionTarget.getAttribute("data-registration-id") || "",
			).trim();
			if (action !== "detail" || !requestId) {
				return;
			}
			await showRegistrationDetailDialog(requestId);
		},
		{ signal },
	);
};

export const initAdminUsersPage = (): void => {
	if (!getUsersTableBody() || !getRegistrationTableBody()) {
		pageEventsController?.abort();
		return;
	}
	bindEvents();
	void Promise.all([
		loadUsers(),
		loadRegistrationRequests(),
		loadRegisterSwitch(),
	]);
};
