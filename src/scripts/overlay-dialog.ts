export type OverlayDialogActionVariant = "primary" | "secondary" | "danger";
export type OverlayDialogActionKind = "button" | "link";

export type OverlayDialogAction = {
	key: string;
	label: string;
	variant: OverlayDialogActionVariant;
	kind?: OverlayDialogActionKind;
	href?: string;
};

export type OverlayDialogFieldOption = {
	label: string;
	value: string;
};

export type OverlayDialogField = {
	name: string;
	label: string;
	kind: "input" | "textarea" | "select";
	required?: boolean;
	placeholder?: string;
	value?: string;
	rows?: number;
	options?: OverlayDialogFieldOption[];
};

export type OverlayDialogOptions = {
	ariaLabel: string;
	message: string;
	actions: OverlayDialogAction[];
	dismissKey: string | null;
	fields?: OverlayDialogField[];
};

export type OverlayDialogResult = {
	actionKey: string;
	values: Record<string, string>;
};

type OverlayDialogControl = {
	name: string;
	required: boolean;
	element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};

let overlayEl: HTMLElement | null = null;
let messageEl: HTMLElement | null = null;
let fieldsEl: HTMLElement | null = null;
let actionsEl: HTMLElement | null = null;
let savedOverflow = "";
let activeResolve: ((result: OverlayDialogResult) => void) | null = null;
let activeDismissKey: string | null = null;
let fieldControls: OverlayDialogControl[] = [];

function ensureDOM(): void {
	if (overlayEl) {
		return;
	}

	overlayEl = document.createElement("div");
	overlayEl.className = "overlay-dialog";
	overlayEl.setAttribute("role", "dialog");
	overlayEl.setAttribute("aria-modal", "true");
	overlayEl.setAttribute("aria-label", "提示");
	overlayEl.hidden = true;

	const card = document.createElement("div");
	card.className = "overlay-dialog-card";

	messageEl = document.createElement("p");
	messageEl.className = "overlay-dialog-message";

	fieldsEl = document.createElement("div");
	fieldsEl.className = "overlay-dialog-fields";
	fieldsEl.hidden = true;

	actionsEl = document.createElement("div");
	actionsEl.className = "overlay-dialog-actions";

	card.appendChild(messageEl);
	card.appendChild(fieldsEl);
	card.appendChild(actionsEl);
	overlayEl.appendChild(card);

	overlayEl.addEventListener("click", (event) => {
		if (event.target === overlayEl && activeDismissKey) {
			hide(activeDismissKey, collectFieldValues());
		}
	});

	document.body.appendChild(overlayEl);
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key === "Escape" && activeDismissKey) {
		event.preventDefault();
		hide(activeDismissKey, collectFieldValues());
	}
}

function resolveActive(result: OverlayDialogResult): void {
	if (!activeResolve) {
		return;
	}
	const resolve = activeResolve;
	activeResolve = null;
	resolve(result);
}

function getActionClassName(variant: OverlayDialogActionVariant): string {
	if (variant === "primary") {
		return "overlay-dialog-action-primary";
	}
	if (variant === "danger") {
		return "overlay-dialog-action-danger";
	}
	return "overlay-dialog-action-secondary";
}

function closeWithoutAnimation(result?: OverlayDialogResult): void {
	if (!overlayEl) {
		return;
	}
	overlayEl.hidden = true;
	overlayEl.classList.remove("is-closing");
	document.body.style.overflow = savedOverflow;
	document.removeEventListener("keydown", onKeyDown);
	activeDismissKey = null;
	fieldControls = [];

	if (result) {
		resolveActive(result);
	}
}

function hide(actionKey?: string, values?: Record<string, string>): void {
	if (!overlayEl || overlayEl.hidden) {
		if (actionKey) {
			resolveActive({
				actionKey,
				values: values || {},
			});
		}
		return;
	}

	if (actionKey) {
		resolveActive({
			actionKey,
			values: values || {},
		});
	}

	overlayEl.classList.add("is-closing");
	document.removeEventListener("keydown", onKeyDown);

	let closed = false;
	const finishClose = () => {
		if (closed) {
			return;
		}
		closed = true;
		closeWithoutAnimation();
	};

	overlayEl.addEventListener("animationend", finishClose, { once: true });
	window.setTimeout(finishClose, 220);
}

function createFieldControl(field: OverlayDialogField): OverlayDialogControl {
	if (field.kind === "textarea") {
		const textarea = document.createElement("textarea");
		textarea.className = "overlay-dialog-field-control";
		textarea.rows = Number.isFinite(field.rows)
			? Math.max(2, Number(field.rows))
			: 4;
		textarea.placeholder = field.placeholder || "";
		textarea.value = field.value || "";
		textarea.required = Boolean(field.required);
		return {
			name: field.name,
			required: Boolean(field.required),
			element: textarea,
		};
	}

	if (field.kind === "select") {
		const select = document.createElement("select");
		select.className = "overlay-dialog-field-control";
		select.required = Boolean(field.required);

		for (const option of field.options || []) {
			const item = document.createElement("option");
			item.value = option.value;
			item.textContent = option.label;
			select.appendChild(item);
		}

		if (field.value) {
			select.value = field.value;
		}

		return {
			name: field.name,
			required: Boolean(field.required),
			element: select,
		};
	}

	const input = document.createElement("input");
	input.type = "text";
	input.className = "overlay-dialog-field-control";
	input.placeholder = field.placeholder || "";
	input.value = field.value || "";
	input.required = Boolean(field.required);
	return {
		name: field.name,
		required: Boolean(field.required),
		element: input,
	};
}

function renderFields(fields: OverlayDialogField[] | undefined): void {
	if (!fieldsEl) {
		return;
	}

	fieldsEl.replaceChildren();
	fieldControls = [];

	if (!fields || fields.length === 0) {
		fieldsEl.hidden = true;
		return;
	}

	fieldsEl.hidden = false;
	for (const field of fields) {
		const group = document.createElement("label");
		group.className = "overlay-dialog-field";

		const label = document.createElement("span");
		label.className = "overlay-dialog-field-label";
		label.textContent = field.label;

		const control = createFieldControl(field);
		control.element.addEventListener("input", () => {
			control.element.classList.remove("is-invalid");
		});
		control.element.addEventListener("change", () => {
			control.element.classList.remove("is-invalid");
		});

		group.appendChild(label);
		group.appendChild(control.element);
		fieldsEl.appendChild(group);
		fieldControls.push(control);
	}
}

function collectFieldValues(): Record<string, string> {
	const values: Record<string, string> = {};
	for (const control of fieldControls) {
		values[control.name] = String(control.element.value || "").trim();
	}
	return values;
}

function validateFields(actionKey: string): boolean {
	if (activeDismissKey && actionKey === activeDismissKey) {
		return true;
	}

	let firstInvalid:
		| HTMLInputElement
		| HTMLTextAreaElement
		| HTMLSelectElement
		| null = null;

	for (const control of fieldControls) {
		if (!control.required) {
			control.element.classList.remove("is-invalid");
			continue;
		}

		const valid = String(control.element.value || "").trim().length > 0;
		control.element.classList.toggle("is-invalid", !valid);
		if (!valid && !firstInvalid) {
			firstInvalid = control.element;
		}
	}

	if (firstInvalid) {
		firstInvalid.focus();
		return false;
	}
	return true;
}

function renderActions(actions: OverlayDialogAction[]): void {
	if (!actionsEl) {
		return;
	}

	actionsEl.replaceChildren();
	for (const action of actions) {
		const kind = action.kind || "button";
		const className = getActionClassName(action.variant);

		if (kind === "link") {
			const link = document.createElement("a");
			link.className = className;
			link.textContent = action.label;
			link.href = action.href || "#";
			link.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const values = collectFieldValues();
				closeWithoutAnimation({
					actionKey: action.key,
					values,
				});
				if (action.href && action.href !== "#") {
					window.location.assign(action.href);
				}
			});
			actionsEl.appendChild(link);
			continue;
		}

		const button = document.createElement("button");
		button.type = "button";
		button.className = className;
		button.textContent = action.label;
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!validateFields(action.key)) {
				return;
			}
			const values = collectFieldValues();
			if (activeDismissKey && action.key === activeDismissKey) {
				closeWithoutAnimation({
					actionKey: action.key,
					values,
				});
				return;
			}
			hide(action.key, values);
		});
		actionsEl.appendChild(button);
	}
}

export function showOverlayDialog(
	options: OverlayDialogOptions,
): Promise<OverlayDialogResult> {
	ensureDOM();
	if (!overlayEl || !messageEl || !fieldsEl || !actionsEl) {
		return Promise.resolve({
			actionKey: options.dismissKey || "",
			values: {},
		});
	}

	if (activeResolve) {
		closeWithoutAnimation({
			actionKey: activeDismissKey || "dismiss",
			values: {},
		});
	}

	overlayEl.setAttribute("aria-label", options.ariaLabel);
	messageEl.textContent = options.message;
	renderFields(options.fields);
	renderActions(options.actions);
	activeDismissKey = options.dismissKey;

	savedOverflow = document.body.style.overflow;
	document.body.style.overflow = "hidden";

	overlayEl.classList.remove("is-closing");
	overlayEl.hidden = false;
	document.addEventListener("keydown", onKeyDown);

	return new Promise<OverlayDialogResult>((resolve) => {
		activeResolve = resolve;
	});
}
