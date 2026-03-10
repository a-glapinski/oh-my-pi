import { describe, expect, it } from "bun:test";
import { getSettingDef } from "../src/modes/components/settings-defs";

describe("settings definitions", () => {
	it("describes Exa web search as usable without a direct API key", () => {
		const webSearchSetting = getSettingDef("providers.webSearch");
		expect(webSearchSetting?.type).toBe("submenu");

		const exaOption =
			webSearchSetting?.type === "submenu"
				? webSearchSetting.options.find(option => option.value === "exa")
				: undefined;

		expect(exaOption?.description).toBe("Uses Exa API when EXA_API_KEY is set; falls back to Exa MCP");
	});
});
