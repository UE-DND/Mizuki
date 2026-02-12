import type { APIContext } from "astro";
import sharp from "sharp";

import type { UploadPurpose } from "@/constants/upload-limits";
import { UPLOAD_LIMITS, UPLOAD_LIMIT_LABELS } from "@/constants/upload-limits";
import { assertCan } from "@/server/auth/acl";
import {
	uploadDirectusFile,
	updateDirectusFileMetadata,
} from "@/server/directus/client";
import { fail, ok } from "@/server/api/response";

import { requireAccess } from "./shared";

const VALID_PURPOSES = new Set<string>(Object.keys(UPLOAD_LIMITS));

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

function resolvePurpose(raw: FormDataEntryValue | null): UploadPurpose {
	if (typeof raw === "string" && VALID_PURPOSES.has(raw)) {
		return raw as UploadPurpose;
	}
	return "general";
}

export async function handleUploads(context: APIContext): Promise<Response> {
	if (context.request.method !== "POST") {
		return fail("方法不允许", 405);
	}
	const formData = await context.request.formData();
	const purpose = resolvePurpose(formData.get("purpose"));
	if (purpose !== "registration-avatar") {
		const required = await requireAccess(context);
		if ("response" in required) {
			return required.response;
		}
		const access = required.access;
		assertCan(access, "can_upload_files");
	}

	const file = formData.get("file");
	if (!(file instanceof File)) {
		return fail("缺少上传文件", 400);
	}
	const targetFormatRaw = formData.get("target_format");
	const targetFormat =
		typeof targetFormatRaw === "string" ? targetFormatRaw : "";
	const maxSize = UPLOAD_LIMITS[purpose];
	const label = UPLOAD_LIMIT_LABELS[purpose];

	if (file.size > maxSize) {
		return fail(`文件过大，最大允许 ${label}`, 413);
	}

	let uploadFile = file;
	if (targetFormat === "ico") {
		try {
			uploadFile = await convertImageFileToIco(file);
		} catch (error) {
			console.error("[uploads] favicon ico conversion failed", error);
			return fail("站点图标转换失败", 400);
		}
		if (uploadFile.size > maxSize) {
			return fail(`站点图标过大，最大允许 ${label}`, 413);
		}
	}

	const titleRaw = formData.get("title");
	const folderRaw = formData.get("folder");
	const requestedTitle = typeof titleRaw === "string" ? titleRaw.trim() : "";
	const uploaded = await uploadDirectusFile({
		file: uploadFile,
		title: requestedTitle || undefined,
		folder: typeof folderRaw === "string" ? folderRaw : undefined,
	});
	if (requestedTitle && uploaded.id) {
		await updateDirectusFileMetadata(uploaded.id, {
			title: requestedTitle,
		});
	}
	return ok({ file: uploaded });
}
