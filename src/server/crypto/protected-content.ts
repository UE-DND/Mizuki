import { webcrypto } from "node:crypto";

const MARKER = "MIZUKI-VERIFY:";
const VERSION_PREFIX = "MZK2:";
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

type ProtectedPayloadV2 = {
	v: 2;
	alg: "AES-GCM";
	kdf: "PBKDF2";
	hash: "SHA-256";
	it: number;
	s: string;
	iv: string;
	ct: string;
};

function toBase64Url(input: ArrayBuffer | Uint8Array | string): string {
	const buffer =
		typeof input === "string"
			? Buffer.from(input, "utf8")
			: Buffer.from(
					input instanceof Uint8Array ? input : new Uint8Array(input),
				);
	return buffer
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

async function deriveAesKey(password: string, salt: Uint8Array) {
	const encoder = new TextEncoder();
	const keyMaterial = await webcrypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);

	return await webcrypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations: PBKDF2_ITERATIONS,
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);
}

export async function encryptProtectedContent(
	html: string,
	password: string,
): Promise<string> {
	const cleanPassword = String(password || "").trim();
	if (!cleanPassword) {
		throw new Error("PASSWORD_REQUIRED");
	}

	const source = `${MARKER}${String(html || "")}`;
	const encoder = new TextEncoder();
	const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
	const key = await deriveAesKey(cleanPassword, salt);

	const encrypted = await webcrypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(source),
	);

	const payload: ProtectedPayloadV2 = {
		v: 2,
		alg: "AES-GCM",
		kdf: "PBKDF2",
		hash: "SHA-256",
		it: PBKDF2_ITERATIONS,
		s: toBase64Url(salt),
		iv: toBase64Url(iv),
		ct: toBase64Url(encrypted),
	};

	return `${VERSION_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}
