import { App, SuggestModal } from "obsidian";

export interface PluginCommandItem {
	id: string;
	name: string;
}

export class PluginCommandPickerModal extends SuggestModal<PluginCommandItem> {
	constructor(
		app: App,
		private readonly commands: PluginCommandItem[],
		private readonly onSelectCommand: (command: PluginCommandItem) => void,
	) {
		super(app);
		this.setPlaceholder("搜索并执行插件命令...");
	}

	getSuggestions(query: string): PluginCommandItem[] {
		const normalized = query.trim().toLowerCase();
		if (!normalized) {
			return this.commands.slice(0, 200);
		}

		return this.commands
			.filter((item) => {
				const name = item.name.toLowerCase();
				const id = item.id.toLowerCase();
				return name.includes(normalized) || id.includes(normalized);
			})
			.slice(0, 200);
	}

	renderSuggestion(item: PluginCommandItem, el: HTMLElement): void {
		el.createEl("div", { text: item.name });
		el.createEl("small", { text: item.id });
	}

	onChooseSuggestion(item: PluginCommandItem): void {
		this.onSelectCommand(item);
	}
}
