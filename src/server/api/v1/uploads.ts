import type { APIContext } from "astro";
import sharp from "sharp";

import { assertCan } from "@/server/auth/acl";
import { uploadDirectusFile } from "@/server/directus/client";
import { fail, ok } from "@/server/api/response";

import { requireAccess } from "./shared";

function toIcoBufferFromPngBuffer(pngBuffer: Buffer): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(1, 4); // image count

	const directoryEntry = Buffer.alloc(16);
	directoryEntry.writeUInt8(0, 0); // width: 256
	directoryEntry.writeUInt8(0, 1); // height: 256
	directoryEntry.writeUInt8(0, 2); // color count
	directoryEntry.writeUInt8(0, 3); // reserved
	directoryEntry.writeUInt16LE(1, 4); // color planes
	directoryEntry.writeUInt16LE(32, 6); // bits per pixel
	directoryEntry.writeUInt32LE(pngBuffer.length, 8); // image bytes
	directoryEntry.writeUInt32LE(6 + 16, 12); // offset

	return Buffer.concat([header, directoryEntry, pngBuffer]);
}

async function convertImageFileToIco(file: File): Promise<File> {
	const inputBuffer = Buffer.from(await file.arrayBuffer());
	const pngBuffer = await sharp(inputBuffer)
		.resize(256, 256, { fit: "cover" })
		.png()
		.toBuffer();
	const icoBuffer = toIcoBufferFromPngBuffer(pngBuffer);
	const baseName = file.name.replace(/\.[^/.]+$/u, "") || "favicon";
	return new File([new Uint8Array(icoBuffer)], `${baseName}.ico`, {
		type: "image/x-icon",
	});
}

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
	const targetFormatRaw = formData.get("target_format");
	const targetFormat =
		typeof targetFormatRaw === "string" ? targetFormatRaw : "";

	const UPLOAD_MAX_SIZE = 1.5 * 1024 * 1024; // 1.5 MB
	if (file.size > UPLOAD_MAX_SIZE) {
		return fail("文件过大，最大允许 1.5 MB", 413);
	}

	let uploadFile = file;
	if (targetFormat === "ico") {
		try {
			uploadFile = await convertImageFileToIco(file);
		} catch (error) {
			console.error("[uploads] favicon ico conversion failed", error);
			return fail("站点图标转换失败", 400);
		}
		if (uploadFile.size > UPLOAD_MAX_SIZE) {
			return fail("站点图标过大，最大允许 1.5 MB", 413);
		}
	}

	const titleRaw = formData.get("title");
	const folderRaw = formData.get("folder");
	const uploaded = await uploadDirectusFile({
		file: uploadFile,
		title: typeof titleRaw === "string" ? titleRaw : undefined,
		folder: typeof folderRaw === "string" ? folderRaw : undefined,
	});
	return ok({ file: uploaded });
}
