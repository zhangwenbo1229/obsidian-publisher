import { Notice } from "obsidian";
import type ObsidianPublisherPlugin from "../main";

export function registerPublisherCommands(plugin: ObsidianPublisherPlugin): void {
	plugin.addCommand({
		id: "csdn-toggle-current-note-publish-switch",
		name: "切换当前笔记的 CSDN 发布开关",
		callback: () => void withErrorNotice(async () => {
			const result = await plugin.getCsdnPublishService().toggleCurrentNotePublishSwitch();
			const statusText = result.enabled ? "开启" : "关闭";
			new Notice(
				`已${statusText} CSDN 发布：${result.file.basename}（${result.field}=${String(result.enabled)}）`,
			);
		}),
	});

	plugin.addCommand({
		id: "csdn-publish-current-note",
		name: "发布/更新当前笔记到 CSDN",
		callback: () => void withErrorNotice(async () => {
			const result = await plugin.getCsdnPublishService().publishCurrentNote();
			const actionText = result.isNew ? "发布" : "更新";
			new Notice(`CSDN ${actionText}成功：${result.file.basename}（${result.postId}）`);
		}),
	});

	plugin.addCommand({
		id: "csdn-delete-current-note-post",
		name: "删除当前笔记对应的 CSDN 文章",
		callback: () => void withErrorNotice(async () => {
			const result = await plugin.getCsdnPublishService().deleteCurrentNotePost();
			new Notice(`CSDN 删除成功：${result.file.basename}（${result.postId}）`);
		}),
	});

	plugin.addCommand({
		id: "csdn-open-current-note-preview",
		name: "打开当前笔记的 CSDN 预览链接",
		callback: () => void withErrorNotice(async () => {
			const result = await plugin.getCsdnPublishService().getCurrentNotePreviewUrl();
			window.open(result.url, "_blank");
			new Notice(`已打开 CSDN 预览：${result.file.basename}`);
		}),
	});

	plugin.addCommand({
		id: "csdn-verify-auth",
		name: "验证 CSDN 授权",
		callback: () => void withErrorNotice(async () => {
			const result = await plugin.getCsdnPublishService().validateAuth();
			new Notice(`CSDN 授权有效：${result.uid}`);
		}),
	});
}

async function withErrorNotice(task: () => Promise<void>): Promise<void> {
	try {
		await task();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`CSDN 操作失败：${message}`, 8000);
	}
}
