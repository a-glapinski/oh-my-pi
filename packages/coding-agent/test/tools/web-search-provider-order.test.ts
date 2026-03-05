import { describe, expect, it } from "bun:test";
import { formatSearchProviderPriority, SEARCH_PROVIDER_ORDER } from "../../src/web/search/provider-order";

describe("web search provider order", () => {
	it("keeps Exa after Gemini in auto priority", () => {
		expect(SEARCH_PROVIDER_ORDER).toContain("gemini");
		expect(SEARCH_PROVIDER_ORDER).toContain("exa");
		expect(SEARCH_PROVIDER_ORDER.indexOf("gemini")).toBeLessThan(SEARCH_PROVIDER_ORDER.indexOf("exa"));
	});

	it("formats auto-priority description from shared provider order", () => {
		expect(formatSearchProviderPriority()).toBe(
			"Priority: Tavily > Perplexity > Brave > Jina > Kimi > Anthropic > Gemini > Codex > Z.AI > Exa > Kagi > Synthetic",
		);
	});
});
