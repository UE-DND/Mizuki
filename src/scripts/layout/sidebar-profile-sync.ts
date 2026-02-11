export type SidebarProfilePatch = {
	uid: string;
	displayName: string;
	bio: string;
	profileLink: string;
	avatarUrl: string;
	socialHtml: string;
};

const PROFILE_UPDATE_TIMEOUT_MS = 420;

function clean(value: string | null | undefined): string {
	return String(value || "").trim();
}

function readProfileRoot(scope: ParentNode | null): HTMLElement | null {
	if (!scope) {
		return null;
	}
	const root = scope.querySelector<HTMLElement>(
		"[data-sidebar-profile-root]",
	);
	return root instanceof HTMLElement ? root : null;
}

function readAllProfileRoots(scope: ParentNode | null): HTMLElement[] {
	if (!scope) {
		return [];
	}
	return Array.from(
		scope.querySelectorAll<HTMLElement>("[data-sidebar-profile-root]"),
	);
}

export function extractSidebarProfilePatch(
	scope: ParentNode | null,
): SidebarProfilePatch | null {
	const root = readProfileRoot(scope);
	if (!root) {
		return null;
	}

	const link = root.querySelector<HTMLAnchorElement>(
		"[data-sidebar-profile-link]",
	);
	const name = root.querySelector<HTMLElement>("[data-sidebar-profile-name]");
	const bio = root.querySelector<HTMLElement>("[data-sidebar-profile-bio]");
	const avatar = root.querySelector<HTMLImageElement>(
		"[data-sidebar-profile-avatar] img",
	);
	const social = root.querySelector<HTMLElement>(
		"[data-sidebar-profile-social]",
	);

	const displayName =
		clean(root.dataset.sidebarProfileName) ||
		clean(name?.textContent) ||
		"user";
	const uid = clean(root.dataset.sidebarProfileUid) || "__official__";
	const profileLink =
		clean(root.dataset.sidebarProfileLink) ||
		clean(link?.getAttribute("href")) ||
		"/about";
	const avatarUrl =
		clean(root.dataset.sidebarProfileAvatar) ||
		clean(avatar?.getAttribute("src"));
	const bioText =
		clean(root.dataset.sidebarProfileBio) || clean(bio?.textContent);

	return {
		uid,
		displayName,
		bio: bioText,
		profileLink,
		avatarUrl,
		socialHtml: social?.innerHTML || "",
	};
}

export function applySidebarProfilePatch(patch: SidebarProfilePatch): void {
	const sidebar = document.getElementById("sidebar");
	if (!(sidebar instanceof HTMLElement)) {
		return;
	}

	const roots = readAllProfileRoots(sidebar);
	if (roots.length === 0) {
		return;
	}

	const avatars: HTMLImageElement[] = [];

	roots.forEach((root) => {
		const link = root.querySelector<HTMLAnchorElement>(
			"[data-sidebar-profile-link]",
		);
		const name = root.querySelector<HTMLElement>(
			"[data-sidebar-profile-name]",
		);
		const bio = root.querySelector<HTMLElement>(
			"[data-sidebar-profile-bio]",
		);
		const avatar = root.querySelector<HTMLImageElement>(
			"[data-sidebar-profile-avatar] img",
		);
		const social = root.querySelector<HTMLElement>(
			"[data-sidebar-profile-social]",
		);

		if (link) {
			link.setAttribute("href", patch.profileLink || "/about");
		}
		if (name) {
			name.textContent = patch.displayName || "user";
		}
		if (bio) {
			bio.textContent = patch.bio;
		}
		if (social && social.innerHTML !== patch.socialHtml) {
			social.innerHTML = patch.socialHtml;
		}
		if (avatar) {
			avatars.push(avatar);
		}

		root.dataset.sidebarProfileUid = patch.uid || "__official__";
		root.dataset.sidebarProfileName = patch.displayName || "user";
		root.dataset.sidebarProfileBio = patch.bio;
		root.dataset.sidebarProfileAvatar = patch.avatarUrl;
		root.dataset.sidebarProfileLink = patch.profileLink || "/about";
	});

	sidebar.dataset.sidebarUid = patch.uid || "__official__";

	const nextAvatarUrl = clean(patch.avatarUrl);
	const currentAvatarUrl = clean(avatars[0]?.getAttribute("src"));
	if (
		avatars.length === 0 ||
		!nextAvatarUrl ||
		nextAvatarUrl === currentAvatarUrl
	) {
		return;
	}

	let finished = false;
	const finish = (): void => {
		if (finished) {
			return;
		}
		finished = true;
		avatars.forEach((avatar) => {
			avatar.setAttribute("src", nextAvatarUrl);
			avatar.removeAttribute("srcset");
		});
	};

	const preloader = new Image();
	preloader.addEventListener("load", finish, { once: true });
	preloader.addEventListener("error", finish, { once: true });
	preloader.src = nextAvatarUrl;
	window.setTimeout(finish, PROFILE_UPDATE_TIMEOUT_MS);
}
