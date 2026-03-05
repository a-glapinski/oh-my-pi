import type { SearchProviderId } from "./types";

export const SEARCH_PROVIDER_ORDER: SearchProviderId[] = [
	"tavily",
	"perplexity",
	"brave",
	"jina",
	"kimi",
	"anthropic",
	"gemini",
	"codex",
	"zai",
	"exa",
	"kagi",
	"synthetic",
];

const SEARCH_PROVIDER_LABELS: Record<SearchProviderId, string> = {
	tavily: "Tavily",
	perplexity: "Perplexity",
	brave: "Brave",
	jina: "Jina",
	kimi: "Kimi",
	anthropic: "Anthropic",
	gemini: "Gemini",
	codex: "Codex",
	zai: "Z.AI",
	exa: "Exa",
	kagi: "Kagi",
	synthetic: "Synthetic",
};

export function formatSearchProviderPriority(): string {
	const labels = SEARCH_PROVIDER_ORDER.map(provider => SEARCH_PROVIDER_LABELS[provider]);
	return `Priority: ${labels.join(" > ")}`;
}
