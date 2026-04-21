import { App, PluginSettingTab, Setting } from "obsidian";
import type ObsidianPublisherPlugin from "./main";

export class PublisherSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: ObsidianPublisherPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Obsidian Publisher 设置" });
		containerEl.createEl("h3", { text: "CSDN" });

		new Setting(containerEl)
			.setName("启用 CSDN")
			.setDesc("启用后可使用 CSDN 发布相关命令。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.csdn.enabled).onChange(async (value) => {
					this.plugin.settings.csdn.enabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("CSDN 首页")
			.setDesc("例如：https://blog.csdn.net")
			.addText((text) =>
				text
					.setPlaceholder("https://blog.csdn.net")
					.setValue(this.plugin.settings.csdn.home)
					.onChange(async (value) => {
						this.plugin.settings.csdn.home = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("CSDN API 地址")
			.setDesc("通常保持默认：https://bizapi.csdn.net")
			.addText((text) =>
				text
					.setPlaceholder("https://bizapi.csdn.net")
					.setValue(this.plugin.settings.csdn.apiUrl)
					.onChange(async (value) => {
						this.plugin.settings.csdn.apiUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("CSDN Cookie")
			.setDesc("用于接口鉴权，建议仅在本机使用并注意失效时间。")
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.csdn.cookie).onChange(async (value) => {
					this.plugin.settings.csdn.cookie = value.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("预览 URL 模板")
			.setDesc("支持占位符：[userid] [postid]，例如 /[userid]/article/details/[postid]")
			.addText((text) =>
				text
					.setPlaceholder("/[userid]/article/details/[postid]")
					.setValue(this.plugin.settings.csdn.previewUrl)
					.onChange(async (value) => {
						this.plugin.settings.csdn.previewUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("发布控制元数据字段")
			.setDesc("通过 frontmatter 该字段判断是否发布到 CSDN，字段值为 true 才会发布。")
			.addText((text) =>
				text
					.setPlaceholder("csdnPublish")
					.setValue(this.plugin.settings.csdn.publishFlagField)
					.onChange(async (value) => {
						this.plugin.settings.csdn.publishFlagField = value.trim() || "csdnPublish";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("postId 字段名")
			.setDesc("发布后写入 frontmatter 的字段名，例如 csdnPostId。")
			.addText((text) =>
				text
					.setPlaceholder("csdnPostId")
					.setValue(this.plugin.settings.csdn.postIdField)
					.onChange(async (value) => {
						this.plugin.settings.csdn.postIdField = value.trim() || "csdnPostId";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("默认标签")
			.setDesc("多个标签用逗号分隔。")
			.addText((text) =>
				text.setValue(this.plugin.settings.csdn.defaultTags).onChange(async (value) => {
					this.plugin.settings.csdn.defaultTags = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("默认分类")
			.setDesc("多个分类用逗号分隔。")
			.addText((text) =>
				text.setValue(this.plugin.settings.csdn.defaultCategories).onChange(async (value) => {
					this.plugin.settings.csdn.defaultCategories = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("读取 frontmatter 标签")
			.setDesc("启用后会读取当前笔记 frontmatter 的 tags/tag。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.csdn.useFrontMatterTags).onChange(async (value) => {
					this.plugin.settings.csdn.useFrontMatterTags = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("读取 frontmatter 分类")
			.setDesc("启用后会读取当前笔记 frontmatter 的 categories/category。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.csdn.useFrontMatterCategories).onChange(async (value) => {
					this.plugin.settings.csdn.useFrontMatterCategories = value;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl("h3", { text: "调试" });

		new Setting(containerEl)
			.setName("启用调试日志")
			.setDesc("仅在开发排障时建议开启。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debug).onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
