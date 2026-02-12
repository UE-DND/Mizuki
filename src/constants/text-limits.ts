/**
 * Weighted character length — CJK fullwidth characters count as 2, others as 1.
 * This gives a more intuitive "visual width" metric for mixed CJK/Latin text.
 */
// eslint-disable-next-line no-control-regex
const CJK_RE =
	/[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u{20000}-\u{2FA1F}]/u;

export function weightedCharLength(str: string): number {
	let len = 0;
	for (const ch of str) {
		len += CJK_RE.test(ch) ? 2 : 1;
	}
	return len;
}

/** Weight of a single character (CJK = 2, otherwise 1). */
export function charWeight(ch: string): number {
	return CJK_RE.test(ch) ? 2 : 1;
}

/** Album title: max 20 weighted chars (Chinese = 2, ASCII = 1). */
export const ALBUM_TITLE_MAX = 20;
/** Max photos allowed in a single album. */
export const ALBUM_PHOTO_MAX = 50;

/** Username: max 14 weighted chars. */
export const USERNAME_MAX_WEIGHT = 14;

/** Display name: max 20 weighted chars. */
export const DISPLAY_NAME_MAX_WEIGHT = 20;

/** Profile bio: max 30 weighted chars. */
export const PROFILE_BIO_MAX_LENGTH = 30;
