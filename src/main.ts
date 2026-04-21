import { Notice, Plugin, TFile } from "obsidian";
import { registerPublisherCommands } from "./commands/registerCommands";
import { PublisherSettingTab } from "./settings";
import { CsdnClient } from "./services/csdn/client";
import { CsdnPublishService } from "./services/csdn/publishService";
import { type PublisherPluginSettings, mergePublisherSettings } from "./types";
import { PluginCommandPickerModal, type PluginCommandItem } from "./ui/pluginCommandPickerModal";

export default class ObsidianPublisherPlugin extends Plugin {
	settings: PublisherPluginSettings;

	private csdnClient?: CsdnClient;
	private csdnPublishService?: CsdnPublishService;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new PublisherSettingTab(this.app, this));
		registerPublisherCommands(this);
		this.addRibbonIcon("rocket", "显示并执行插件命令", () => {
			this.openPluginCommandPicker();
		});
		this.registerFileContextMenus();
	}

	onunload(): void {
		this.csdnClient = undefined;
		this.csdnPublishService = undefined;
	}

	getCsdnPublishService(): CsdnPublishService {
		if (!this.csdnPublishService) {
			this.csdnPublishService = new CsdnPublishService(
				this.app,
				() => this.settings.csdn,
				this.getCsdnClient(),
				(message, payload) => this.logDebug(message, payload),
			);
		}
		return this.csdnPublishService;
	}

	getCsdnClient(): CsdnClient {
		if (!this.csdnClient) {
			this.csdnClient = new CsdnClient(
				() => this.settings.csdn,
				(message, payload) => this.logDebug(message, payload),
			);
		}
		return this.csdnClient;
	}

	async loadSettings(): Promise<void> {
		this.settings = mergePublisherSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private logDebug(message: string, payload?: unknown): void {
		if (!this.settings.debug) {
			return;
		}
		console.debug(`[obsidian-publisher] ${message}`, payload);
	}

	private openPluginCommandPicker(): void {
		const commandManager = this.getCommandManager();
		if (!commandManager) {
			new Notice("当前环境不支持读取命令列表。", 8000);
			return;
		}

		const pluginCommands = this.getAllPluginCommands(commandManager);
		if (pluginCommands.length === 0) {
			new Notice("未找到插件命令。", 5000);
			return;
		}

		new PluginCommandPickerModal(this.app, pluginCommands, (command) => {
			const executed = commandManager.executeCommandById(command.id);
			if (!executed) {
				new Notice(`命令执行失败：${command.name}`, 6000);
			}
		}).open();
	}

	private registerFileContextMenus(): void {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") {
					return;
				}

				menu.addItem((item) =>
					item.setTitle("CSDN Publisher: 发布文章").setIcon("upload").onClick(() => {
						void this.handleFileMenuAction(file, "create");
					}),
				);
				menu.addItem((item) =>
					item.setTitle("CSDN Publisher: 更新文章").setIcon("refresh-cw").onClick(() => {
						void this.handleFileMenuAction(file, "update");
					}),
				);
				menu.addItem((item) =>
					item.setTitle("CSDN Publisher: 删除文章").setIcon("trash-2").onClick(() => {
						void this.handleFileMenuAction(file, "delete");
					}),
				);
			}),
		);
	}

	private async handleFileMenuAction(file: TFile, mode: "create" | "update" | "delete"): Promise<void> {
		try {
			const service = this.getCsdnPublishService();
			if (mode === "delete") {
				const result = await service.deleteFilePost(file);
				new Notice(`CSDN 删除成功：${result.file.basename}（${result.postId}）`);
				return;
			}

			const result =
				mode === "create" ? await service.publishFileAsCreate(file) : await service.updateFilePost(file);
			const actionText = mode === "create" ? "发布" : "更新";
			new Notice(`CSDN ${actionText}成功：${result.file.basename}（${result.postId}）`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`CSDN 操作失败：${message}`, 8000);
		}
	}

	private getCommandManager():
		| {
				listCommands: () => PluginCommandItem[];
				executeCommandById: (commandId: string) => boolean;
		  }
		| undefined {
		const appWithCommands = this.app as Plugin["app"] & {
			commands?: {
				listCommands?: () => PluginCommandItem[];
				executeCommandById?: (commandId: string) => boolean;
			};
		};

		const manager = appWithCommands.commands;
		if (!manager?.listCommands || !manager?.executeCommandById) {
			return undefined;
		}

		return {
			listCommands: manager.listCommands.bind(manager),
			executeCommandById: manager.executeCommandById.bind(manager),
		};
	}

	private getAllPluginCommands(commandManager: { listCommands: () => PluginCommandItem[] }): PluginCommandItem[] {
		const appWithPlugins = this.app as Plugin["app"] & {
			plugins?: {
				plugins?: Record<string, unknown>;
			};
		};
		const pluginIds = new Set(Object.keys(appWithPlugins.plugins?.plugins ?? {}));

		return commandManager
			.listCommands()
			.filter((command) => {
				if (!command?.id || !command?.name) {
					return false;
				}
				const prefix = command.id.split(":")[0] ?? "";
				return pluginIds.has(prefix);
			})
			.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
	}
}
