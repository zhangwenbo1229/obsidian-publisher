import { App, Component, MarkdownRenderer } from "obsidian";

export async function buildCsdnHtmlFromMarkdown(app: App, markdown: string, sourcePath: string): Promise<string> {
	const container = document.createElement("div");
	const rendererComponent = new Component();
	rendererComponent.load();

	try {
		await MarkdownRenderer.render(app, markdown, container, sourcePath, rendererComponent);

		let html = container.innerHTML;
		html = processCsdnMath(html);
		html = processCsdnCodeHighlight(html);
		return html;
	} finally {
		rendererComponent.unload();
		container.remove();
	}
}

export function processCsdnMath(html: string): string {
	const root = parseHtmlRoot(html);
	if (!root) {
		return html;
	}

	const blockMathSelectors = [".math.math-block", ".katex-display", "mjx-container[display='true']"];
	const inlineMathSelectors = [".math.math-inline", ".katex", "mjx-container:not([display='true'])"];

	for (const selector of blockMathSelectors) {
		root.querySelectorAll(selector).forEach((node) => {
			if (node instanceof HTMLElement) {
				node.classList.add("katex--display");
			}
		});
	}

	for (const selector of inlineMathSelectors) {
		root.querySelectorAll(selector).forEach((node) => {
			if (node instanceof HTMLElement && !node.classList.contains("katex-display")) {
				node.classList.add("katex--inline");
			}
		});
	}

	return root.innerHTML;
}

export function processCsdnCodeHighlight(html: string): string {
	const root = parseHtmlRoot(html);
	if (!root) {
		return html;
	}

	root.querySelectorAll("pre code").forEach((node) => {
		if (!(node instanceof HTMLElement)) {
			return;
		}

		const language = detectCodeLanguage(node.className);
		const codeClass = language ? `language-${language}` : "language-plaintext";
		node.classList.add("hljs");
		node.classList.add(codeClass);

		const parent = node.parentElement;
		if (parent instanceof HTMLElement && parent.tagName.toLowerCase() === "pre") {
			parent.classList.add("hljs");
			parent.classList.add(codeClass);
		}
	});

	return root.innerHTML;
}

function parseHtmlRoot(html: string): HTMLElement | null {
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div id="csdn-html-root">${html}</div>`, "text/html");
	return doc.querySelector("#csdn-html-root");
}

function detectCodeLanguage(className: string): string | null {
	const match = className.match(/(?:^|\s)(?:language|lang)-([a-zA-Z0-9_-]+)/);
	return match?.[1]?.toLowerCase() ?? null;
}
