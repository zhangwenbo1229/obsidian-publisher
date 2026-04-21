import { App, MarkdownView, TFile } from "obsidian";
import type { CsdnSettings } from "../../types";
import { CsdnClient, type CsdnPostPayload } from "./client";
import { buildCsdnHtmlFromMarkdown } from "./contentProcessor";
import { replaceLocalImagesForCsdn } from "./imageProcessor";

export interface PublishResult {
	file: TFile;
	postId: string;
	isNew: boolean;
}

export interface DeleteResult {
	file: TFile;
	postId: string;
}

export interface PublishSwitchResult {
	file: TFile;
	enabled: boolean;
	field: string;
}

type PublishMode = "auto" | "create" | "update";

type DebugLogger = (message: string, payload?: unknown) => void;

export class CsdnPublishService {
	constructor(
		private readonly app: App,
		private readonly getSettings: () => CsdnSettings,
		private readonly client: CsdnClient,
		private readonly debug?: DebugLogger,
	) {}

	async validateAuth(): Promise<{ uid: string; title: string }> {
		const meta = await this.client.getMetaData();
		if (!meta.flag || !meta.uid) {
			throw new Error("CSDN 鉴权失败，请检查 Cookie 是否有效。");
		}
		return { uid: meta.uid, title: meta.title };
	}

	async publishCurrentNote(): Promise<PublishResult> {
		const file = this.getActiveMarkdownFile();
		return this.publishFile(file);
	}

	async publishFile(file: TFile): Promise<PublishResult> {
		return this.publishFileByMode(file, "auto");
	}

	async publishFileAsCreate(file: TFile): Promise<PublishResult> {
		return this.publishFileByMode(file, "create");
	}

	async updateFilePost(file: TFile): Promise<PublishResult> {
		return this.publishFileByMode(file, "update");
	}

	private async publishFileByMode(file: TFile, mode: PublishMode): Promise<PublishResult> {
		const settings = this.getSettings();
		this.ensureMarkdownFile(file);
		const frontmatter = this.getFrontmatter(file);
		this.ensurePublishEnabled(frontmatter, settings);
		const existingPostId = this.readPostId(frontmatter, settings.postIdField);
		if (mode === "create" && existingPostId) {
			throw new Error(
				`当前笔记已存在 postId（${existingPostId}），请使用“更新文章”或先清空 frontmatter 字段 "${settings.postIdField}"。`,
			);
		}
		if (mode === "update" && !existingPostId) {
			throw new Error(`当前笔记缺少 postId（${settings.postIdField}），无法更新，请先执行“发布文章”。`);
		}

		const post = await this.buildPostPayload(file, frontmatter, settings);

		let postId = existingPostId;
		let isNew = false;
		if (!postId) {
			postId = await this.client.addPost(post);
			isNew = true;
		} else {
			postId = await this.client.editPost(postId, post);
		}

		await this.writePostId(file, settings.postIdField, postId);
		this.debug?.("CSDN 发布完成", {
			file: file.path,
			postId,
			isNew,
		});

		return {
			file,
			postId,
			isNew,
		};
	}

	async toggleCurrentNotePublishSwitch(): Promise<PublishSwitchResult> {
		const settings = this.getSettings();
		const file = this.getActiveMarkdownFile();
		const frontmatter = this.getFrontmatter(file);
		const nextEnabled = !this.readPublishEnabled(frontmatter, settings.publishFlagField);
		await this.writePublishEnabled(file, settings.publishFlagField, nextEnabled);

		this.debug?.("CSDN 发布开关已切换", {
			file: file.path,
			field: settings.publishFlagField,
			enabled: nextEnabled,
		});

		return {
			file,
			enabled: nextEnabled,
			field: settings.publishFlagField,
		};
	}

	getCurrentNotePublishSwitch(): PublishSwitchResult {
		const settings = this.getSettings();
		const file = this.getActiveMarkdownFile();
		const frontmatter = this.getFrontmatter(file);
		const enabled = this.readPublishEnabled(frontmatter, settings.publishFlagField);

		return {
			file,
			enabled,
			field: settings.publishFlagField,
		};
	}

	async deleteCurrentNotePost(): Promise<DeleteResult> {
		const file = this.getActiveMarkdownFile();
		return this.deleteFilePost(file);
	}

	async deleteFilePost(file: TFile): Promise<DeleteResult> {
		const settings = this.getSettings();
		this.ensureMarkdownFile(file);
		const frontmatter = this.getFrontmatter(file);
		const postId = this.readPostId(frontmatter, settings.postIdField);
		if (!postId) {
			throw new Error(`当前笔记未找到 frontmatter 字段 "${settings.postIdField}"，无法删除远端文章。`);
		}

		await this.client.deletePost(postId);
		await this.writePostId(file, settings.postIdField, "");
		this.debug?.("CSDN 删除完成", {
			file: file.path,
			postId,
		});

		return {
			file,
			postId,
		};
	}

	async getCurrentNotePreviewUrl(): Promise<{ file: TFile; postId: string; url: string }> {
		const settings = this.getSettings();
		const file = this.getActiveMarkdownFile();
		const frontmatter = this.getFrontmatter(file);
		const postId = this.readPostId(frontmatter, settings.postIdField);
		if (!postId) {
			throw new Error(`当前笔记未找到 frontmatter 字段 "${settings.postIdField}"，无法生成预览链接。`);
		}

		const url = this.client.getPreviewUrl(postId);
		return {
			file,
			postId,
			url,
		};
	}

	private getActiveMarkdownFile(): TFile {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file && view.file.extension === "md") {
			return view.file;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile instanceof TFile && activeFile.extension === "md") {
			return activeFile;
		}

		throw new Error("未找到可用的 Markdown 笔记，请先选中或打开一个 .md 文件后再执行该命令。");
	}

	private ensureMarkdownFile(file: TFile): void {
		if (file.extension !== "md") {
			throw new Error(`仅支持 Markdown 文件，当前文件扩展名为 "${file.extension}"。`);
		}
	}

	private getFrontmatter(file: TFile): Record<string, unknown> {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (frontmatter && typeof frontmatter === "object") {
			return frontmatter as Record<string, unknown>;
		}
		return {};
	}

	private async buildPostPayload(
		file: TFile,
		frontmatter: Record<string, unknown>,
		settings: CsdnSettings,
	): Promise<CsdnPostPayload> {
		const rawContent = await this.app.vault.cachedRead(file);
		const plainMarkdown = this.stripFrontmatter(rawContent).trim();
		if (!plainMarkdown) {
			throw new Error("当前笔记内容为空，无法发布。");
		}
		const markdown = await replaceLocalImagesForCsdn(
			this.app,
			this.client,
			file,
			plainMarkdown,
			(message, payload) => this.debug?.(message, payload),
		);
		const html = await buildCsdnHtmlFromMarkdown(this.app, markdown, file.path);

		const title = this.pickTitle(file, frontmatter);
		const description = this.pickDescription(frontmatter, markdown, title);
		const tags = this.buildTaxonomy({
			useFrontMatter: settings.useFrontMatterTags,
			frontmatterValue: this.pickFirst(frontmatter, ["tags", "tag"]),
			defaultValue: settings.defaultTags,
			isTag: true,
		});
		const categories = this.buildTaxonomy({
			useFrontMatter: settings.useFrontMatterCategories,
			frontmatterValue: this.pickFirst(frontmatter, ["categories", "category"]),
			defaultValue: settings.defaultCategories,
			isTag: false,
		});

		return {
			title,
			description,
			markdown,
			html,
			tags,
			categories,
		};
	}

	private readPostId(frontmatter: Record<string, unknown>, postIdField: string): string {
		const value = frontmatter[postIdField];
		if (typeof value === "string") {
			return value.trim();
		}
		if (typeof value === "number" && Number.isFinite(value)) {
			return `${value}`;
		}
		return "";
	}

	private readPublishEnabled(frontmatter: Record<string, unknown>, publishFlagField: string): boolean {
		const value = frontmatter[publishFlagField];
		if (typeof value === "boolean") {
			return value;
		}
		if (typeof value === "number") {
			return value !== 0;
		}
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			if (["true", "1", "yes", "y", "on"].includes(normalized)) {
				return true;
			}
			if (["false", "0", "no", "n", "off", ""].includes(normalized)) {
				return false;
			}
		}
		return false;
	}

	private async writePublishEnabled(file: TFile, publishFlagField: string, enabled: boolean): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter[publishFlagField] = enabled;
		});
	}

	private async writePostId(file: TFile, postIdField: string, postId: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (postId) {
				frontmatter[postIdField] = postId;
			} else {
				delete frontmatter[postIdField];
			}
		});
	}

	private ensurePublishEnabled(frontmatter: Record<string, unknown>, settings: CsdnSettings): void {
		if (this.readPublishEnabled(frontmatter, settings.publishFlagField)) {
			return;
		}

		throw new Error(
			`当前笔记未开启 CSDN 发布：frontmatter 字段 "${settings.publishFlagField}" 需为 true。`,
		);
	}

	private pickTitle(file: TFile, frontmatter: Record<string, unknown>): string {
		const candidate = this.pickFirst(frontmatter, ["title", "name"]);
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
		return file.basename;
	}

	private pickDescription(frontmatter: Record<string, unknown>, markdown: string, fallback: string): string {
		const candidate = this.pickFirst(frontmatter, ["description", "desc", "summary", "excerpt"]);
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}

		const plain = markdown
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
			.replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
			.replace(/[#>*_~\-]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		if (plain.length === 0) {
			return fallback;
		}

		return plain.slice(0, 140);
	}

	private buildTaxonomy(options: {
		useFrontMatter: boolean;
		frontmatterValue: unknown;
		defaultValue: string;
		isTag: boolean;
	}): string[] {
		const defaultItems = this.parseList(options.defaultValue, options.isTag);
		if (!options.useFrontMatter) {
			return defaultItems;
		}

		const frontmatterItems = this.parseUnknownList(options.frontmatterValue, options.isTag);
		return this.unique([...frontmatterItems, ...defaultItems]);
	}

	private parseUnknownList(value: unknown, isTag: boolean): string[] {
		if (Array.isArray(value)) {
			const flattened = value.flatMap((item) => this.parseUnknownList(item, isTag));
			return this.unique(flattened);
		}
		if (typeof value === "string") {
			return this.parseList(value, isTag);
		}
		if (typeof value === "number") {
			return [`${value}`];
		}
		return [];
	}

	private parseList(value: string, isTag: boolean): string[] {
		return value
			.split(/[,\n\r;；，]+/g)
			.map((item) => item.trim())
			.filter((item) => item.length > 0)
			.map((item) => (isTag ? item.replace(/^#/, "") : item))
			.filter((item) => item.length > 0);
	}

	private unique(items: string[]): string[] {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const item of items) {
			if (!seen.has(item)) {
				seen.add(item);
				result.push(item);
			}
		}
		return result;
	}

	private pickFirst(frontmatter: Record<string, unknown>, keys: string[]): unknown {
		for (const key of keys) {
			if (key in frontmatter) {
				return frontmatter[key];
			}
		}
		return undefined;
	}

	private stripFrontmatter(markdown: string): string {
		if (!markdown.startsWith("---")) {
			return markdown;
		}

		return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	}
}
