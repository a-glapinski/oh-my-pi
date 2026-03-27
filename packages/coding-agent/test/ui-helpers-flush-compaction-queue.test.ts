import { describe, expect, it, vi } from "bun:test";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import { UiHelpers } from "@oh-my-pi/pi-coding-agent/modes/utils/ui-helpers";

type CompactionQueuedMessage = { text: string; mode: "steer" | "followUp" };

/**
 * Minimal mock of InteractiveModeContext for flushCompactionQueue testing.
 *
 * The real session.prompt() includes #waitForPostPromptRecovery which deadlocks
 * when called from within the compaction event handler (a tracked post-prompt
 * task). The mock resolves immediately, so tests verify dispatch logic and error
 * handling, not real session scheduling.
 */
function createMockContext(opts?: {
	queuedMessages?: CompactionQueuedMessage[];
	slashCommands?: Set<string>;
	promptImpl?: (text: string) => Promise<void>;
}) {
	const slashCommands = opts?.slashCommands ?? new Set<string>();
	const promptImpl = opts?.promptImpl ?? (async () => {});
	const calls: string[] = [];

	const session = {
		waitForIdle: vi.fn(async () => {
			calls.push("waitForIdle");
		}),
		prompt: vi.fn(async (text: string) => {
			calls.push(`prompt:${text}`);
			return await promptImpl(text);
		}),
		followUp: vi.fn(async (text: string) => {
			calls.push(`followUp:${text}`);
		}),
		steer: vi.fn(async (text: string) => {
			calls.push(`steer:${text}`);
		}),
	};

	const ctx = {
		compactionQueuedMessages: [...(opts?.queuedMessages ?? [])] as CompactionQueuedMessage[],
		updatePendingMessagesDisplay: vi.fn(),
		showError: vi.fn(),
		session,
		isKnownSlashCommand: vi.fn((text: string) => {
			const name = text.startsWith("/") ? text.split(/\s/)[0].slice(1) : "";
			return slashCommands.has(name);
		}),
		fileSlashCommands: new Set<string>(),
	} as unknown as InteractiveModeContext;

	return { ctx, session, calls };
}

/** Drain the microtask queue so .catch() handlers settle. */
async function flushMicrotasks() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("UiHelpers.flushCompactionQueue", () => {
	it("dispatches preCommands then firstPrompt then rest items in order", async () => {
		const { ctx, calls } = createMockContext({
			queuedMessages: [
				{ text: "/compact", mode: "steer" },
				{ text: "hello", mode: "steer" },
				{ text: "follow up", mode: "followUp" },
			],
			slashCommands: new Set(["compact"]),
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		// /compact is a preCommand (slash command before first non-command).
		// "hello" is the firstPrompt (fire-and-forget).
		// "follow up" is a rest item dispatched via followUp.
		expect(calls).toEqual(["prompt:/compact", "prompt:hello", "followUp:follow up"]);
	});

	it("sends followUp and steer as non-blocking enqueues", async () => {
		const { ctx, calls } = createMockContext({
			queuedMessages: [
				{ text: "main message", mode: "steer" },
				{ text: "follow up", mode: "followUp" },
				{ text: "steer msg", mode: "steer" },
			],
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();

		// "main message" is firstPrompt. "follow up" and "steer msg" are rest.
		expect(calls).toEqual(["prompt:main message", "followUp:follow up", "steer:steer msg"]);
	});

	it("reports firstPrompt failure with accurate unsent list", async () => {
		const { ctx } = createMockContext({
			queuedMessages: [
				{ text: "will fail", mode: "steer" },
				{ text: "/next", mode: "steer" },
				{ text: "also queued", mode: "followUp" },
			],
			slashCommands: new Set(["next"]),
			promptImpl: async (text: string) => {
				if (text === "will fail") throw new Error("AgentBusyError");
			},
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		// firstPrompt ("will fail") rejects via .catch → restoreQueue called.
		// Unsent list includes firstPrompt and all rest items (sentCount was at 0
		// when firstPrompt was dispatched, so slice(0) = all).
		expect(ctx.showError).toHaveBeenCalledTimes(1);
		const errorArg = (ctx.showError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(errorArg).toContain("AgentBusyError");
		expect(errorArg).toContain("will fail");
	});

	it("reports only unsent messages when preCommands succeed but firstPrompt fails", async () => {
		const { ctx } = createMockContext({
			queuedMessages: [
				{ text: "/setup", mode: "steer" },
				{ text: "main prompt", mode: "steer" },
				{ text: "follow up", mode: "followUp" },
			],
			slashCommands: new Set(["setup"]),
			promptImpl: async (text: string) => {
				if (text === "main prompt") throw new Error("rejected");
			},
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		expect(ctx.showError).toHaveBeenCalledTimes(1);
		const errorArg = (ctx.showError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		// /setup succeeded — should NOT appear in unsent list.
		expect(errorArg).not.toContain("/setup");
		// firstPrompt + rest should appear.
		expect(errorArg).toContain("main prompt");
		expect(errorArg).toContain("follow up");
	});

	it("reports correct unsent messages when a preCommand throws", async () => {
		const { ctx } = createMockContext({
			queuedMessages: [
				{ text: "/ok", mode: "steer" },
				{ text: "/fail", mode: "steer" },
				{ text: "user msg", mode: "steer" },
			],
			slashCommands: new Set(["ok", "fail"]),
			promptImpl: async (text: string) => {
				if (text === "/fail") throw new Error("preCommand error");
			},
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();

		expect(ctx.showError).toHaveBeenCalledTimes(1);
		const errorArg = (ctx.showError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		// /ok succeeded — should NOT appear.
		expect(errorArg).not.toContain("/ok");
		// /fail and user msg are unsent.
		expect(errorArg).toContain("/fail");
		expect(errorArg).toContain("user msg");
	});

	it("does not double-report when firstPrompt .catch and outer catch both fire", async () => {
		// Single message that is the firstPrompt and fails. The .catch fires
		// (setting batchFailed), and the outer catch is suppressed by the guard.
		const { ctx } = createMockContext({
			queuedMessages: [{ text: "will fail", mode: "steer" }],
			promptImpl: async () => {
				throw new Error("prompt failed");
			},
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		// Only one error report, not two.
		expect(ctx.showError).toHaveBeenCalledTimes(1);
	});

	it("clears queue and updates display on success", async () => {
		const messages: CompactionQueuedMessage[] = [{ text: "hello", mode: "steer" }];
		const { ctx } = createMockContext({ queuedMessages: messages });
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		expect(ctx.compactionQueuedMessages).toEqual([]);
		// Called once when draining queue, once after successful flush.
		expect(ctx.updatePendingMessagesDisplay).toHaveBeenCalledTimes(2);
		expect(ctx.showError).not.toHaveBeenCalled();
	});

	it("does not update display after drain when batch fails", async () => {
		const { ctx } = createMockContext({
			queuedMessages: [{ text: "msg", mode: "steer" }],
			promptImpl: async () => {
				throw new Error("fail");
			},
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		// showError was called (batch failed).
		expect(ctx.showError).toHaveBeenCalledTimes(1);
		// Only the initial drain call. The post-success updatePendingMessagesDisplay
		// should NOT fire because batchFailed is true.
		expect(ctx.updatePendingMessagesDisplay).toHaveBeenCalledTimes(1);
	});

	it("is a no-op when queue is empty", async () => {
		const { ctx, session } = createMockContext({ queuedMessages: [] });
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();

		expect(session.prompt).not.toHaveBeenCalled();
		expect(ctx.updatePendingMessagesDisplay).not.toHaveBeenCalled();
	});

	it("reports correct unsent messages when a rest slash command throws", async () => {
		// preCommand + firstPrompt + followUp succeed, then /crash throws.
		// Only /crash and anything after it should appear as unsent.
		const { ctx } = createMockContext({
			queuedMessages: [
				{ text: "/setup", mode: "steer" },
				{ text: "main prompt", mode: "steer" },
				{ text: "follow up", mode: "followUp" },
				{ text: "/crash", mode: "steer" },
				{ text: "trailing", mode: "steer" },
			],
			slashCommands: new Set(["setup", "crash"]),
			promptImpl: async (text: string) => {
				if (text === "/crash") throw new Error("crash");
			},
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue();
		await flushMicrotasks();

		expect(ctx.showError).toHaveBeenCalledTimes(1);
		const errorArg = (ctx.showError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		// /setup, main prompt, and follow up were all dispatched.
		expect(errorArg).not.toContain("/setup");
		expect(errorArg).not.toContain("main prompt");
		expect(errorArg).not.toContain("follow up");
		// /crash and trailing are unsent.
		expect(errorArg).toContain("/crash");
		expect(errorArg).toContain("trailing");
	});

	it("willRetry path sends all messages sequentially", async () => {
		const { ctx, calls } = createMockContext({
			queuedMessages: [
				{ text: "/cmd", mode: "steer" },
				{ text: "msg", mode: "followUp" },
			],
			slashCommands: new Set(["cmd"]),
		});
		const helpers = new UiHelpers(ctx);

		await helpers.flushCompactionQueue({ willRetry: true });

		// willRetry sends all messages through the simple path.
		expect(calls).toEqual(["prompt:/cmd", "followUp:msg"]);
		expect(ctx.showError).not.toHaveBeenCalled();
	});
});
