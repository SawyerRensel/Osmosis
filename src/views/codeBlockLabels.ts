/**
 * Add Obsidian-style language labels to rendered code blocks inside `root`.
 * MarkdownRenderer.render does not auto-add the reading-mode language label,
 * so we inject one matching `.osmosis-code-lang-label` styling.
 */
export function addCodeBlockLanguageLabels(root: HTMLElement): void {
	const codes = root.querySelectorAll("pre > code[class*='language-']");
	for (const code of Array.from(codes)) {
		const pre = code.parentElement as HTMLPreElement | null;
		if (!pre || pre.querySelector(":scope > .osmosis-code-lang-label")) continue;

		let lang: string | null = null;
		for (const cls of Array.from(code.classList)) {
			if (cls.startsWith("language-")) {
				lang = cls.slice("language-".length);
				break;
			}
		}
		if (!lang || lang.startsWith("ad-")) continue;

		pre.classList.add("osmosis-code-block");
		pre.createSpan({ cls: "osmosis-code-lang-label", text: lang });
	}
}
