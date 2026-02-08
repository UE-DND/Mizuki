import { buildLoginUrl } from "@utils/login-url";

import {
	showOverlayDialog,
	type OverlayDialogField,
	type OverlayDialogActionVariant,
} from "@/scripts/overlay-dialog";

type ConfirmDialogOptions = {
	ariaLabel?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmVariant?: OverlayDialogActionVariant;
};

type NoticeDialogOptions = {
	ariaLabel?: string;
	message: string;
	buttonText?: string;
};

type FormDialogFieldType = "text" | "textarea" | "select";

type FormDialogFieldOption = {
	label: string;
	value: string;
};

type FormDialogField = {
	name: string;
	label: string;
	type: FormDialogFieldType;
	required?: boolean;
	placeholder?: string;
	value?: string;
	rows?: number;
	options?: FormDialogFieldOption[];
};

type FormDialogOptions = {
	ariaLabel?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmVariant?: OverlayDialogActionVariant;
	fields: FormDialogField[];
};

function toOverlayField(field: FormDialogField): OverlayDialogField {
	return {
		name: field.name,
		label: field.label,
		kind:
			field.type === "textarea"
				? "textarea"
				: field.type === "select"
					? "select"
					: "input",
		required: field.required,
		placeholder: field.placeholder,
		value: field.value,
		rows: field.rows,
		options: field.options,
	};
}

export function showAuthRequiredDialog(message?: string): void {
	void showOverlayDialog({
		ariaLabel: "登录提示",
		message: message || "登录后才能使用相关功能哦～",
		dismissKey: "cancel",
		actions: [
			{
				key: "login",
				label: "前往登录",
				variant: "primary",
				kind: "link",
				href: buildLoginUrl(),
			},
			{
				key: "cancel",
				label: "取消",
				variant: "secondary",
			},
		],
	});
}

export async function showConfirmDialog(
	options: ConfirmDialogOptions,
): Promise<boolean> {
	const result = await showOverlayDialog({
		ariaLabel: options.ariaLabel || "确认操作",
		message: options.message,
		dismissKey: "cancel",
		actions: [
			{
				key: "confirm",
				label: options.confirmText || "确认",
				variant: options.confirmVariant || "primary",
			},
			{
				key: "cancel",
				label: options.cancelText || "取消",
				variant: "secondary",
			},
		],
	});
	return result.actionKey === "confirm";
}

export async function showNoticeDialog(
	options: NoticeDialogOptions,
): Promise<void> {
	await showOverlayDialog({
		ariaLabel: options.ariaLabel || "提示",
		message: options.message,
		dismissKey: "ok",
		actions: [
			{
				key: "ok",
				label: options.buttonText || "我知道了",
				variant: "secondary",
			},
		],
	});
}

export async function showFormDialog(
	options: FormDialogOptions,
): Promise<Record<string, string> | null> {
	const result = await showOverlayDialog({
		ariaLabel: options.ariaLabel || "填写信息",
		message: options.message,
		dismissKey: "cancel",
		fields: options.fields.map(toOverlayField),
		actions: [
			{
				key: "confirm",
				label: options.confirmText || "确认",
				variant: options.confirmVariant || "primary",
			},
			{
				key: "cancel",
				label: options.cancelText || "取消",
				variant: "secondary",
			},
		],
	});

	if (result.actionKey !== "confirm") {
		return null;
	}
	return result.values;
}

declare global {
	interface Window {
		showAuthRequiredDialog: typeof showAuthRequiredDialog;
	}
}

window.showAuthRequiredDialog = showAuthRequiredDialog;
