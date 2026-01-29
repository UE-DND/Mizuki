import { getSortedPosts } from "../../utils/content-utils";
import type { CollectionEntry } from "astro:content";

export async function GET() {
	const posts = await getSortedPosts();

	const allPostsData = posts.map((post: CollectionEntry<"posts">) => {
		const date = new Date(post.data.published);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");

		return {
			id: post.id,
			title: post.data.title,
			date: `${year}-${month}-${day}`,
		};
	});

	return new Response(JSON.stringify(allPostsData), {
		headers: {
			"Content-Type": "application/json",
		},
	});
}
