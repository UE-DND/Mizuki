export type AuthState = {
	userId: string;
	isAdmin: boolean;
	isLoggedIn: boolean;
};

const AUTH_STATE_CACHE_KEY = "__mizukiAuthState";

function normalizeState(
	input: Partial<AuthState> | null | undefined,
): AuthState {
	return {
		userId: input?.userId ? String(input.userId) : "",
		isAdmin: Boolean(input?.isAdmin),
		isLoggedIn: Boolean(input?.isLoggedIn),
	};
}

export function getAuthState(): AuthState {
	const raw = (
		window as Window &
			typeof globalThis & {
				[key: string]: Partial<AuthState> | undefined;
			}
	)[AUTH_STATE_CACHE_KEY];
	return normalizeState(raw);
}

export function emitAuthState(
	input: Partial<AuthState> | null | undefined,
): AuthState {
	const state = normalizeState(input);
	(
		window as Window &
			typeof globalThis & {
				[key: string]: AuthState;
			}
	)[AUTH_STATE_CACHE_KEY] = state;

	document.dispatchEvent(
		new CustomEvent("mizuki:auth-state", {
			detail: state,
		}),
	);

	return state;
}

export function subscribeAuthState(
	handler: (state: AuthState) => void,
): () => void {
	const listener = (event: Event) => {
		if (!(event instanceof CustomEvent)) {
			return;
		}
		handler(
			normalizeState((event as CustomEvent<Partial<AuthState>>).detail),
		);
	};
	document.addEventListener("mizuki:auth-state", listener);
	return () => {
		document.removeEventListener("mizuki:auth-state", listener);
	};
}
