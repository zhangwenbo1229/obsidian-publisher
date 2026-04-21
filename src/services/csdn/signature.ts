import { CSDN_APP_SECRET, CSDN_APP_SECRET_MEDIA, CSDN_X_CA_KEY, CSDN_X_CA_KEY_MEDIA } from "./constants";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

export function generateXCaNonce(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
		const random = Math.floor(Math.random() * 16);
		const value = char === "x" ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

function buildSignPath(rawUrl: string, method: HttpMethod): string {
	const url = new URL(rawUrl);
	return method === "GET" ? `${url.pathname}${url.search}` : url.pathname;
}

function toBase64(bytes: ArrayBuffer): string {
	const binary = String.fromCharCode(...new Uint8Array(bytes));
	return btoa(binary);
}

async function hmacSha256Base64(secret: string, source: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) {
		throw new Error("WebCrypto is not available. Cannot sign CSDN requests.");
	}

	const key = await subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const digest = await subtle.sign("HMAC", key, new TextEncoder().encode(source));
	return toBase64(digest);
}

export async function generateXCaSignature(
	url: string,
	method: HttpMethod,
	accept: string,
	nonce: string,
	contentType: string,
): Promise<string> {
	const path = buildSignPath(url, method);
	const normalizedMethod = method.toUpperCase();
	const toSign = `${normalizedMethod}\n${accept}\n\n${contentType}\n\nx-ca-key:${CSDN_X_CA_KEY}\nx-ca-nonce:${nonce}\n${path}`;
	return hmacSha256Base64(CSDN_APP_SECRET, toSign);
}

export async function generateXCaSignatureForMedia(
	url: string,
	method: HttpMethod,
	accept: string,
	nonce: string,
	contentType: string,
	timestamp: string,
): Promise<string> {
	const path = buildSignPath(url, method);
	const normalizedMethod = method.toUpperCase();
	const toSign =
		`${normalizedMethod}\n${accept}\n\n${contentType}\n\n` +
		`x-ca-key:${CSDN_X_CA_KEY_MEDIA}\n` +
		`x-ca-nonce:${nonce}\n` +
		`x-ca-timestamp:${timestamp}\n` +
		`${path}`;
	return hmacSha256Base64(CSDN_APP_SECRET_MEDIA, toSign);
}
