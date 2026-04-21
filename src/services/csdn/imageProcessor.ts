import { App, normalizePath, requestUrl, TAbstractFile, TFile } from "obsidian";
import { CsdnClient } from "./client";

type DebugLogger = (message: string, payload?: unknown) => void;

interface Replacement {
	start: number;
	end: number;
	value: string;
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const WIKI_IMAGE_PATTERN = /!\[\[([^\]]+)\]\]/g;

export async function replaceLocalImagesForCsdn(
	app: App,
	client: CsdnClient,
	noteFile: TFile,
	markdown: string,
	debug?: DebugLogger,
): Promise<string> {
	const replacements: Replacement[] = [];
	const uploadedUrlCache = new Map<string, string>();

	const uploadImageByLink = async (linkPath: string): Promise<string | null> => {
		const remoteUrl = toRemoteHttpUrl(linkPath);
		if (remoteUrl) {
			if (isCsdnImageUrl(remoteUrl)) {
				return remoteUrl;
			}

			const cacheKey = `remote:${remoteUrl}`;
			const cachedUrl = uploadedUrlCache.get(cacheKey);
			if (cachedUrl) {
				return cachedUrl;
			}

			const remoteFile = await fetchRemoteImage(remoteUrl);
			const imageUrl = await client.uploadImage(remoteFile.fileName, remoteFile.mimeType, remoteFile.bytes);
			uploadedUrlCache.set(cacheKey, imageUrl);
			debug?.("CSDN 远程图片上传完成", {
				note: noteFile.path,
				source: remoteUrl,
				imageUrl,
			});
			return imageUrl;
		}

		if (isExternalNonHttpUrl(linkPath)) {
			return null;
		}

		const imageFile = resolveVaultImageFile(app, noteFile, linkPath);
		if (!imageFile) {
			return null;
		}

		const cacheKey = `local:${imageFile.path}`;
		const cachedUrl = uploadedUrlCache.get(cacheKey);
		if (cachedUrl) {
			return cachedUrl;
		}

		const bytes = await app.vault.readBinary(imageFile);
		const mimeType = detectMimeType(imageFile);
		const imageUrl = await client.uploadImage(imageFile.name, mimeType, bytes);
		uploadedUrlCache.set(cacheKey, imageUrl);
		debug?.("CSDN 图片上传完成", {
			note: noteFile.path,
			image: imageFile.path,
			imageUrl,
		});
		return imageUrl;
	};

	for (const match of markdown.matchAll(MARKDOWN_IMAGE_PATTERN)) {
		const full = match[0];
		const alt = match[1] ?? "";
		const targetRaw = match[2] ?? "";
		const index = match.index;
		if (index === undefined) {
			continue;
		}

		const target = extractMarkdownLinkTarget(targetRaw);
		if (!target) {
			continue;
		}

		const imageUrl = await uploadImageByLink(target);
		if (!imageUrl) {
			continue;
		}

		replacements.push({
			start: index,
			end: index + full.length,
			value: `![${alt}](${imageUrl})`,
		});
	}

	for (const match of markdown.matchAll(WIKI_IMAGE_PATTERN)) {
		const full = match[0];
		const body = match[1] ?? "";
		const index = match.index;
		if (index === undefined) {
			continue;
		}

		const target = extractWikiImageTarget(body);
		if (!target) {
			continue;
		}

		const imageUrl = await uploadImageByLink(target);
		if (!imageUrl) {
			continue;
		}

		replacements.push({
			start: index,
			end: index + full.length,
			value: `![](${imageUrl})`,
		});
	}

	return applyReplacements(markdown, replacements);
}

function applyReplacements(source: string, replacements: Replacement[]): string {
	if (replacements.length === 0) {
		return source;
	}

	const sorted = replacements.sort((a, b) => b.start - a.start);
	let result = source;
	for (const replacement of sorted) {
		result = `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`;
	}
	return result;
}

function extractMarkdownLinkTarget(rawTarget: string): string {
	const trimmed = rawTarget.trim();
	if (!trimmed) {
		return "";
	}

	if (trimmed.startsWith("<")) {
		const end = trimmed.indexOf(">");
		if (end > 1) {
			return trimmed.slice(1, end).trim();
		}
	}

	const firstPart = trimmed.match(/^(\S+)/)?.[1] ?? trimmed;
	return firstPart.replace(/^['"]|['"]$/g, "").trim();
}

function extractWikiImageTarget(rawTarget: string): string {
	const content = rawTarget.trim();
	if (!content) {
		return "";
	}

	const withoutPipe = content.split("|")[0]?.trim() ?? "";
	const withoutHeading = withoutPipe.split("#")[0]?.trim() ?? "";
	return withoutHeading;
}

function toRemoteHttpUrl(rawUrl: string): string | null {
	const trimmed = rawUrl.trim();
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}
	if (/^\/\//.test(trimmed)) {
		return `https:${trimmed}`;
	}
	return null;
}

function isExternalNonHttpUrl(url: string): boolean {
	const trimmed = url.trim();
	return /^data:/i.test(trimmed) || /^app:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed);
}

function isCsdnImageUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname.includes("csdnimg.cn");
	} catch {
		return false;
	}
}

function resolveVaultImageFile(app: App, noteFile: TFile, rawPath: string): TFile | null {
	const cleanedPath = cleanLinkPath(rawPath);
	if (!cleanedPath) {
		return null;
	}

	const linkResolved = app.metadataCache.getFirstLinkpathDest(cleanedPath, noteFile.path);
	if (linkResolved instanceof TFile && isImageFile(linkResolved)) {
		return linkResolved;
	}

	const relativePath = resolveRelativePath(noteFile.path, cleanedPath);
	const byRelative = app.vault.getAbstractFileByPath(relativePath);
	if (byRelative instanceof TFile && isImageFile(byRelative)) {
		return byRelative;
	}

	const byAbsolute = app.vault.getAbstractFileByPath(normalizePath(cleanedPath.replace(/^\/+/, "")));
	if (byAbsolute instanceof TFile && isImageFile(byAbsolute)) {
		return byAbsolute;
	}

	return null;
}

function cleanLinkPath(rawPath: string): string {
	const normalizedSlash = rawPath.replace(/\\/g, "/").trim();
	const withoutQuery = normalizedSlash.split("?")[0]?.split("#")[0] ?? "";
	const decoded = safeDecodeURIComponent(withoutQuery);
	return decoded.trim();
}

function resolveRelativePath(notePath: string, linkPath: string): string {
	if (linkPath.startsWith("/")) {
		return normalizePath(linkPath.slice(1));
	}

	const parentPath = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
	return normalizePath(parentPath ? `${parentPath}/${linkPath}` : linkPath);
}

function isImageFile(file: TAbstractFile): file is TFile {
	if (!(file instanceof TFile)) {
		return false;
	}

	return ["png", "jpg", "jpeg", "gif"].includes(file.extension.toLowerCase());
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function detectMimeType(file: TFile): string {
	const ext = file.extension.toLowerCase();
	switch (ext) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		default:
			return "application/octet-stream";
	}
}

async function fetchRemoteImage(url: string): Promise<{ bytes: ArrayBuffer; mimeType: string; fileName: string }> {
	const response = await requestUrl({
		url,
		method: "GET",
		throw: false,
	});

	if (response.status >= 400) {
		throw new Error(`下载远程图片失败 (${response.status})：${url}`);
	}

	const mimeType = pickHeader(response.headers, "content-type")?.split(";")[0]?.trim() || "application/octet-stream";
	const fileName = buildRemoteFileName(url, mimeType);
	return {
		bytes: response.arrayBuffer,
		mimeType,
		fileName,
	};
}

function pickHeader(headers: Record<string, string>, key: string): string | undefined {
	const target = key.toLowerCase();
	for (const headerKey of Object.keys(headers)) {
		if (headerKey.toLowerCase() === target) {
			return headers[headerKey];
		}
	}
	return undefined;
}

function buildRemoteFileName(url: string, mimeType: string): string {
	let parsed: URL | null = null;
	try {
		parsed = new URL(url);
	} catch {
		parsed = null;
	}

	const rawName = parsed?.pathname.split("/").pop()?.trim() || "";
	const cleanName = safeDecodeURIComponent(rawName).replace(/[\\/:*?"<>|]/g, "_");
	if (cleanName && cleanName.includes(".")) {
		return cleanName;
	}

	const ext = mimeTypeToExtension(mimeType);
	return `remote-image-${Date.now()}.${ext}`;
}

function mimeTypeToExtension(mimeType: string): string {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("jpeg") || normalized.includes("jpg")) {
		return "jpg";
	}
	if (normalized.includes("png")) {
		return "png";
	}
	if (normalized.includes("gif")) {
		return "gif";
	}
	return "png";
}
