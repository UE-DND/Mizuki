// 导出SearchResult类型
export interface SearchResult {
	url: string;
	meta: {
		title: string;
	};
	excerpt: string;
	content?: string;
	word_count?: number;
	filters?: Record<string, unknown>;
	anchors?: Array<{
		element: string;
		id: string;
		text: string;
		location: number;
	}>;
	weighted_locations?: Array<{
		weight: number;
		balanced_score: number;
		location: number;
	}>;
	locations?: number[];
	raw_content?: string;
	raw_url?: string;
	sub_results?: SearchResult[];
}

// GalleryManager 类的类型定义
declare class GalleryManager {
	isInitialized: boolean;
	clickHandler: ((e: Event) => void) | null;
	constructor();
	init(): void;
	cleanup(): void;
	handleClick(e: Event): void;
	toggleGallery(header: Element): void;
	showImageModal(imageSrc: string): void;
}

declare global {
	interface HTMLElementTagNameMap {
		"table-of-contents": HTMLElement & {
			init?: () => void;
		};
	}

	interface Window {
		// Define swup type with proper hooks
		swup?: {
			hooks: {
				on: (
					event: string,
					callback: (visit?: { to: { url: string } }) => void,
					options?: { before?: boolean },
				) => void;
			};
		};
		pagefind: {
			search: (query: string) => Promise<{
				results: Array<{
					data: () => Promise<SearchResult>;
				}>;
			}>;
		};
		mobileTOCInit?: () => void;
		galleryManager?: GalleryManager;
	}

	interface Element {
		init?: () => void;
	}
}

interface SearchResult {
	url: string;
	meta: {
		title: string;
	};
	excerpt: string;
	content?: string;
	word_count?: number;
	filters?: Record<string, unknown>;
	anchors?: Array<{
		element: string;
		id: string;
		text: string;
		location: number;
	}>;
	weighted_locations?: Array<{
		weight: number;
		balanced_score: number;
		location: number;
	}>;
	locations?: number[];
	raw_content?: string;
	raw_url?: string;
	sub_results?: SearchResult[];
}
