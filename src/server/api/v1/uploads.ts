import type { APIContext } from "astro";

import { assertCan } from "@/server/auth/acl";
import { uploadDirectusFile } from "@/server/directus/client";
import { fail, ok } from "@/server/api/response";

import { requireAccess } from "./shared";

export async function handleUploads(context: APIContext): Promise<Response> {
	if (context.request.method !== "POST") {
		return fail("方法不允许", 405);
	}
	const required = await requireAccess(context);
	if ("response" in required) {
		return required.response;
	}
	const access = required.access;
	assertCan(access, "can_upload_files");

	const formData = await context.request.formData();
	const file = formData.get("file");
	if (!(file instanceof File)) {
		return fail("缺少上传文件", 400);
	}

	const UPLOAD_MAX_SIZE = 1.5 * 1024 * 1024; // 1.5 MB
	if (file.size > UPLOAD_MAX_SIZE) {
		return fail("文件过大，最大允许 1.5 MB", 413);
	}

	const titleRaw = formData.get("title");
	const folderRaw = formData.get("folder");
	const uploaded = await uploadDirectusFile({
		file,
		title: typeof titleRaw === "string" ? titleRaw : undefined,
		folder: typeof folderRaw === "string" ? folderRaw : undefined,
	});
	return ok({ file: uploaded });
}
