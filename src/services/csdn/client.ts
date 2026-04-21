import { requestUrl } from "obsidian";
import type { CsdnSettings } from "../../types";
import { buildCsdnEndpoints, CSDN_DEFAULT_API_URL, CSDN_X_CA_KEY, CSDN_X_CA_KEY_MEDIA } from "./constants";
import { generateXCaNonce, generateXCaSignature, generateXCaSignatureForMedia, type HttpMethod } from "./signature";

export interface CsdnMetaData {
	flag: boolean;
	uid: string;
	title: string;
	avatar?: string;
	type: "csdn";
	displayName: string;
	supportTypes: Array<"markdown" | "html">;
	home: string;
	icon: string;
}

export interface CsdnUserBlog {
	blogId: string;
	blogName: string;
	url: string;
}

export interface CsdnCategoryInfo {
	categoryId: string;
	categoryName: string;
	description?: string;
	categoryDescription?: string;
}

export interface CsdnPostPayload {
	title: string;
	markdown: string;
	html?: string;
	description?: string;
	tags: string[];
	categories: string[];
}

export interface CsdnPostInfo {
	postId: string;
	title: string;
	tags: string[];
	categories: string[];
}

interface CsdnApiResponse<T> {
	code?: number | string;
	message?: string;
	msg?: string;
	data?: T;
}

interface CsdnColumnItem {
	id?: number | string;
	edit_title?: string;
	column_url?: string;
	desc?: string;
}

interface CsdnColumnListData {
	list?: {
		column?: CsdnColumnItem[];
		pay_column?: CsdnColumnItem[];
	};
}

interface CsdnGetArticleData {
	article_id?: number | string;
	title?: string;
	tags?: string;
	categories?: string;
}

interface CsdnSaveArticleData {
	id?: number | string;
	article_id?: number | string;
}

interface CsdnImageSignCustomParam {
	rtype?: string;
	watermark?: string;
	templateName?: string;
	filePath?: string;
	isAudit?: string;
	type?: string;
	username?: string;
	"x-image-app"?: string;
	"x-image-suffix"?: string;
}

interface CsdnImageSignData {
	host?: string;
	filePath?: string;
	policy?: string;
	signature?: string;
	callbackBody?: string;
	callbackBodyType?: string;
	callbackUrl?: string;
	accessId?: string;
	customParam?: CsdnImageSignCustomParam;
}

interface CsdnImageUploadData {
	targetObjectKey?: string;
	imageUrl?: string;
}

interface CsdnRequestOptions {
	url: string;
	method?: HttpMethod;
	headers?: Record<string, string>;
	body?: string;
	contentType?: string;
	useMediaKey?: boolean;
}

type DebugLogger = (message: string, payload?: unknown) => void;

export class CsdnClient {
	constructor(
		private readonly getSettings: () => CsdnSettings,
		private readonly debug?: DebugLogger,
	) {}

	async getMetaData(): Promise<CsdnMetaData> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const res = await this.request<{ username?: string; avatar?: string }>({
			url: endpoints.userInfo,
		});

		const username = (res.data?.username ?? "").toString().trim();
		return {
			flag: username.length > 0,
			uid: username,
			title: username,
			avatar: res.data?.avatar,
			type: "csdn",
			displayName: "CSDN",
			supportTypes: ["markdown", "html"],
			home: "https://mp.csdn.net/",
			icon: "https://g.csdnimg.cn/static/logo/favicon32.ico",
		};
	}

	async getUsersBlogs(): Promise<CsdnUserBlog[]> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const res = await this.request<CsdnColumnListData>({
			url: endpoints.columnList,
		});

		const columns = this.collectColumns(res.data);
		return columns.map((item) => ({
			blogId: this.toId(item.id),
			blogName: (item.edit_title ?? "").trim(),
			url: (item.column_url ?? "").trim(),
		}));
	}

	async getCategories(): Promise<CsdnCategoryInfo[]> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const res = await this.request<CsdnColumnListData>({
			url: endpoints.columnList,
		});

		const columns = this.collectColumns(res.data);
		return columns.map((item) => ({
			categoryId: this.toId(item.id),
			categoryName: (item.edit_title ?? "").trim(),
			description: item.column_url,
			categoryDescription: item.desc,
		}));
	}

	async addPost(post: CsdnPostPayload): Promise<string> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const res = await this.request<CsdnSaveArticleData>({
			url: endpoints.saveArticle,
			method: "POST",
			body: JSON.stringify(this.buildSavePayload(post)),
		});

		const postId = this.pickPostId(res.data);
		if (!postId) {
			throw new Error("CSDN 返回成功，但未返回文章 ID。");
		}

		return postId;
	}

	async editPost(postId: string, post: CsdnPostPayload): Promise<string> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const res = await this.request<CsdnSaveArticleData>({
			url: endpoints.saveArticle,
			method: "POST",
			body: JSON.stringify({
				...this.buildSavePayload(post),
				id: postId,
				level: "1",
				resource_url: "",
			}),
		});

		return this.pickPostId(res.data) ?? postId;
	}

	async getPost(postId: string): Promise<CsdnPostInfo> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const url = `${endpoints.getArticle}?id=${encodeURIComponent(postId)}`;
		const res = await this.request<CsdnGetArticleData>({
			url,
		});

		const data = res.data;
		const resolvedPostId = this.toId(data?.article_id) || postId;
		return {
			postId: resolvedPostId,
			title: (data?.title ?? "").toString(),
			tags: this.splitCommaList(data?.tags),
			categories: this.splitCommaList(data?.categories),
		};
	}

	async deletePost(postId: string): Promise<void> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		await this.request({
			url: endpoints.deleteArticle,
			method: "POST",
			body: JSON.stringify({
				articleId: postId,
				deep: false,
			}),
		});
	}

	async uploadImage(fileName: string, mimeType: string, bytes: ArrayBuffer): Promise<string> {
		const settings = this.ensureConfigured();
		const endpoints = buildCsdnEndpoints(settings.apiUrl || CSDN_DEFAULT_API_URL);
		const imageSuffix = this.getImageSuffix(fileName);
		if (!imageSuffix) {
			throw new Error(`不支持的图片格式：${fileName}`);
		}

		const signRes = await this.request<CsdnImageSignData>({
			url: endpoints.imageSign,
			method: "POST",
			body: JSON.stringify({
				imageTemplate: "standard",
				appName: "direct_blog_markdown",
				imageSuffix,
			}),
			useMediaKey: true,
		});
		const signData = signRes.data;
		if (!signData?.host) {
			throw new Error(`获取 CSDN 图片签名失败：${fileName}`);
		}

		const multipart = this.buildImageMultipartBody({
			fileName,
			mimeType,
			bytes,
			signData,
		});

		const uploadResponse = await requestUrl({
			url: signData.host,
			method: "POST",
			headers: {
				"content-type": multipart.contentType,
			},
			body: multipart.body,
			throw: false,
		});

		const uploadPayload = this.normalizePayload<CsdnImageUploadData>(uploadResponse.json, uploadResponse.text);
		const uploadCode = this.normalizeCode(uploadPayload.code);
		if (uploadResponse.status >= 400) {
			throw new Error(
				`CSDN 图片上传 HTTP 错误 (${uploadResponse.status})：${this.pickErrorMessage(uploadPayload, uploadResponse.text)}`,
			);
		}
		if (uploadCode !== 200) {
			throw new Error(
				`CSDN 图片上传失败 (${uploadCode ?? "unknown"})：${this.pickErrorMessage(uploadPayload, uploadResponse.text)}`,
			);
		}

		const imageUrl = (uploadPayload.data?.imageUrl ?? "").trim();
		if (!imageUrl) {
			throw new Error(`CSDN 图片上传成功但未返回图片地址：${fileName}`);
		}

		return imageUrl;
	}

	getPreviewUrl(postId: string): string {
		const settings = this.getSettings();
		const home = settings.home?.trim() || "https://blog.csdn.net";
		const template = settings.previewUrl?.trim() || "/[userid]/article/details/[postid]";
		const userId = this.readCookieValue(settings.cookie ?? "", "UserName");

		let replaced = template.replace(/\[postid\]/gi, postId);
		replaced = replaced.replace(/\[userid\]/gi, userId);

		if (/^https?:\/\//i.test(replaced)) {
			return replaced;
		}

		return new URL(replaced, this.ensureTrailingSlash(home)).toString();
	}

	private async request<T>(options: CsdnRequestOptions): Promise<CsdnApiResponse<T>> {
		const settings = this.ensureConfigured();
		const method = options.method ?? "GET";
		const accept = "*/*";
		const contentType = options.contentType ?? "application/json";
		const nonce = generateXCaNonce();
		const timestamp = `${Date.now()}`;

		const signature = options.useMediaKey
			? await generateXCaSignatureForMedia(options.url, method, accept, nonce, contentType, timestamp)
			: await generateXCaSignature(options.url, method, accept, nonce, contentType);

		const signatureHeaders = options.useMediaKey
			? "x-ca-key,x-ca-nonce,x-ca-timestamp"
			: "x-ca-key,x-ca-nonce";
		const caKey = options.useMediaKey ? CSDN_X_CA_KEY_MEDIA : CSDN_X_CA_KEY;

		const headers: Record<string, string> = {
			accept,
			"content-type": contentType,
			"x-ca-key": caKey,
			"x-ca-nonce": nonce,
			"x-ca-signature": signature,
			"x-ca-signature-headers": signatureHeaders,
			Cookie: settings.cookie,
			...(options.useMediaKey ? { "x-ca-timestamp": timestamp } : {}),
			...(options.headers ?? {}),
		};

		this.debug?.("CSDN 请求", {
			method,
			url: options.url,
			headers: this.maskHeaders(headers),
		});

		const response = await requestUrl({
			url: options.url,
			method,
			headers,
			body: options.body,
			throw: false,
		});

		const payload = this.normalizePayload<T>(response.json, response.text);
		const code = this.normalizeCode(payload.code);
		if (response.status >= 400) {
			throw new Error(`CSDN HTTP 错误 (${response.status})：${this.pickErrorMessage(payload, response.text)}`);
		}
		if (code !== 200) {
			throw new Error(`CSDN 接口错误 (${code ?? "unknown"})：${this.pickErrorMessage(payload, response.text)}`);
		}

		return payload;
	}

	private ensureConfigured(): CsdnSettings {
		const settings = this.getSettings();
		if (!settings.enabled) {
			throw new Error("请先在插件设置中启用 CSDN 发布。");
		}
		if (!settings.cookie || settings.cookie.trim().length === 0) {
			throw new Error("请先在插件设置中填写 CSDN Cookie。");
		}

		return settings;
	}

	private normalizePayload<T>(jsonPayload: unknown, textPayload: string): CsdnApiResponse<T> {
		if (this.isRecord(jsonPayload)) {
			return jsonPayload as CsdnApiResponse<T>;
		}

		try {
			const parsed = JSON.parse(textPayload) as unknown;
			if (this.isRecord(parsed)) {
				return parsed as CsdnApiResponse<T>;
			}
		} catch (error) {
			// ignore
		}

		return {
			code: -1,
			message: textPayload || "无法解析 CSDN 响应",
		};
	}

	private buildImageMultipartBody(options: {
		fileName: string;
		mimeType: string;
		bytes: ArrayBuffer;
		signData: CsdnImageSignData;
	}): { body: ArrayBuffer; contentType: string } {
		const boundary = `----ObsidianPublisherBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
		const encoder = new TextEncoder();
		const chunks: Uint8Array[] = [];

		const appendText = (value: string): void => {
			chunks.push(encoder.encode(value));
		};

		const appendField = (name: string, value: string | undefined): void => {
			if (value === undefined || value === null) {
				return;
			}

			appendText(`--${boundary}\r\n`);
			appendText(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
			appendText(`${value}\r\n`);
		};

		appendField("key", options.signData.filePath);
		appendField("policy", options.signData.policy);
		appendField("signature", options.signData.signature);
		appendField("callbackBody", options.signData.callbackBody);
		appendField("callbackBodyType", options.signData.callbackBodyType);
		appendField("callbackUrl", options.signData.callbackUrl);
		appendField("AccessKeyId", options.signData.accessId);

		const customParam = options.signData.customParam ?? {};
		appendField("x:rtype", customParam.rtype);
		appendField("x:watermark", customParam.watermark);
		appendField("x:templateName", customParam.templateName);
		appendField("x:filePath", customParam.filePath);
		appendField("x:isAudit", customParam.isAudit);
		appendField("x:x-image-app", customParam["x-image-app"]);
		appendField("x:type", customParam.type);
		appendField("x:x-image-suffix", customParam["x-image-suffix"]);
		appendField("x:username", customParam.username);

		appendText(`--${boundary}\r\n`);
		appendText(`Content-Disposition: form-data; name="file"; filename="${options.fileName}"\r\n`);
		appendText(`Content-Type: ${options.mimeType}\r\n\r\n`);
		chunks.push(new Uint8Array(options.bytes));
		appendText(`\r\n--${boundary}--\r\n`);

		let totalLength = 0;
		for (const chunk of chunks) {
			totalLength += chunk.byteLength;
		}
		const merged = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.byteLength;
		}

		return {
			body: merged.buffer,
			contentType: `multipart/form-data; boundary=${boundary}`,
		};
	}

	private buildSavePayload(post: CsdnPostPayload): Record<string, unknown> {
		return {
			title: post.title,
			markdowncontent: post.markdown,
			content: post.html || post.markdown,
			readType: "public",
			level: 0,
			tags: post.tags.join(","),
			status: 0,
			categories: post.categories.join(","),
			type: "original",
			original_link: "",
			authorized_status: false,
			Description: post.description ?? "",
			not_auto_saved: "1",
			source: "pc_mdeditor",
			cover_images: [],
			cover_type: 1,
			is_new: 1,
			vote_id: 0,
			resource_id: "",
			pubStatus: "publish",
		};
	}

	private getImageSuffix(fileName: string): string {
		const dot = fileName.lastIndexOf(".");
		if (dot < 0 || dot >= fileName.length - 1) {
			return "";
		}

		const suffix = fileName.slice(dot + 1).toLowerCase();
		return ["jpg", "jpeg", "png", "gif"].includes(suffix) ? suffix : "";
	}

	private collectColumns(data: CsdnColumnListData | undefined): CsdnColumnItem[] {
		const columns = data?.list?.column ?? [];
		const payColumns = data?.list?.pay_column ?? [];
		return [...columns, ...payColumns];
	}

	private splitCommaList(value: unknown): string[] {
		if (typeof value !== "string") {
			return [];
		}

		return value
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
	}

	private pickPostId(data: CsdnSaveArticleData | undefined): string | undefined {
		if (!data) {
			return undefined;
		}

		return this.toId(data.id) || this.toId(data.article_id);
	}

	private toId(value: unknown): string {
		if (typeof value === "string") {
			return value.trim();
		}
		if (typeof value === "number" && Number.isFinite(value)) {
			return `${value}`;
		}
		return "";
	}

	private readCookieValue(cookie: string, key: string): string {
		const needle = `${key}=`;
		const items = cookie.split(";");
		for (const rawItem of items) {
			const item = rawItem.trim();
			if (item.startsWith(needle)) {
				return decodeURIComponent(item.slice(needle.length));
			}
		}
		return "";
	}

	private ensureTrailingSlash(url: string): string {
		return url.endsWith("/") ? url : `${url}/`;
	}

	private normalizeCode(value: unknown): number | undefined {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}

		if (typeof value === "string") {
			const parsed = Number.parseInt(value, 10);
			if (!Number.isNaN(parsed)) {
				return parsed;
			}
		}

		return undefined;
	}

	private pickErrorMessage(payload: CsdnApiResponse<unknown>, fallbackText: string): string {
		if (typeof payload.message === "string" && payload.message.length > 0) {
			return payload.message;
		}
		if (typeof payload.msg === "string" && payload.msg.length > 0) {
			return payload.msg;
		}
		return fallbackText || "未知错误";
	}

	private maskHeaders(headers: Record<string, string>): Record<string, string> {
		const masked = { ...headers };
		if (masked.Cookie) {
			masked.Cookie = "***";
		}
		if (masked.cookie) {
			masked.cookie = "***";
		}
		return masked;
	}

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null;
	}
}
