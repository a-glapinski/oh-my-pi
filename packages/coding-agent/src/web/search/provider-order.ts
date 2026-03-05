import type { SearchProviderId } from "./types";

export const SEARCH_PROVIDER_ORDER: SearchProviderId[] = [
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
	exa: "Exa",
	brave: "Brave",
	jina: "Jina",
	kimi: "Kimi",
	zai: "Z.AI",
	anthropic: "Anthropic",
	perplexity: "Perplexity",
	gemini: "Gemini",
	codex: "Codex",
	kagi: "Kagi",
	synthetic: "Synthetic",
};

export function formatSearchProviderPriority(): string {
	const labels = SEARCH_PROVIDER_ORDER.map(provider => SEARCH_PROVIDER_LABELS[provider]);
	return `Priority: ${labels.join(" > ")}`;
}
