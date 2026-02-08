const COPY_SUCCESS_DURATION_MS = 1000;

type RuntimeWindow = Window &
	typeof globalThis & {
		__mzkCodeCopyDelegated?: boolean;
	};

function extractCodeText(codeElement: HTMLElement): string {
	const lineElements = codeElement.querySelectorAll<HTMLElement>("span.line");
	if (lineElements.length > 0) {
		const lines = Array.from(
			lineElements,
			(lineElement) => lineElement.textContent || "",
		);
		return lines.join("\n");
	}

	const explicitCodeLines = codeElement.querySelectorAll<HTMLElement>(
		".code:not(summary *)",
	);
	if (explicitCodeLines.length > 0) {
		const lines = Array.from(
			explicitCodeLines,
			(lineElement) => lineElement.textContent || "",
		);
		return lines.join("\n");
	}

	return codeElement.textContent || "";
}

function normalizeCopiedCode(rawCode: string): string {
	return rawCode.replace(/\n{3,}/g, (match) => {
		const emptyLineCount = Math.max(0, match.length - 1);
		const normalizedEmptyLines = Math.max(1, Math.ceil(emptyLineCount / 2));
		return "\n".repeat(normalizedEmptyLines + 1);
	});
}

function writeClipboardFallback(text: string): void {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.top = "-9999px";
	textarea.style.left = "-9999px";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	let copied = false;
	try {
		copied = document.execCommand("copy");
	} finally {
		document.body.removeChild(textarea);
	}

	if (!copied) {
		throw new Error("execCommand 复制失败");
	}
}

async function writeClipboard(text: string): Promise<void> {
	if (
		navigator.clipboard &&
		typeof navigator.clipboard.writeText === "function"
	) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch (error) {
			console.warn(
				"[markdown] navigator.clipboard.writeText failed, fallback to execCommand:",
				error,
			);
		}
	}

	writeClipboardFallback(text);
}

function markCopySuccess(button: HTMLElement): void {
	const timeoutId = button.getAttribute("data-timeout-id");
	if (timeoutId) {
		clearTimeout(Number.parseInt(timeoutId, 10));
	}

	button.classList.add("success");

	const newTimeoutId = window.setTimeout(() => {
		button.classList.remove("success");
	}, COPY_SUCCESS_DURATION_MS);

	button.setAttribute("data-timeout-id", String(newTimeoutId));
}

export async function copyCodeFromButton(button: HTMLElement): Promise<void> {
	const codeScope =
		button.closest<HTMLElement>(".expressive-code, figure, pre") ??
		button.parentElement;
	const codeElement = codeScope?.querySelector<HTMLElement>("code");
	if (!codeElement) {
		return;
	}

	const code = normalizeCopiedCode(extractCodeText(codeElement));
	await writeClipboard(code);
	markCopySuccess(button);
}

function handleDocumentClick(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const copyButton = target.closest<HTMLElement>(".copy-btn");
	if (!copyButton) {
		return;
	}

	void copyCodeFromButton(copyButton).catch((error) => {
		console.error("[markdown] copy code failed:", error);
	});
}

export function setupCodeCopyDelegation(): void {
	const runtimeWindow = window as RuntimeWindow;
	if (runtimeWindow.__mzkCodeCopyDelegated) {
		return;
	}

	document.addEventListener("click", handleDocumentClick);
	runtimeWindow.__mzkCodeCopyDelegated = true;
}
