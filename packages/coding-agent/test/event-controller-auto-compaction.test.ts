import { describe, expect, it, vi } from "bun:test";
import { EventController } from "@oh-my-pi/pi-coding-agent/modes/controllers/event-controller";
import type { CompactionQueuedMessage, InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";

describe("EventController auto_compaction_end", () => {
	it("shows a warning and flushes queue when compaction succeeds but non-critical tasks fail", async () => {
		const ctx = {
			isInitialized: true,
			autoCompactionEscapeHandler: undefined,
			autoCompactionLoader: undefined,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
			rebuildChatFromMessages: vi.fn(),
			showWarning: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			ui: { requestRender: vi.fn() },
		} as unknown as InteractiveModeContext;
		const controller = new EventController(ctx);

		await controller.handleEvent({
			type: "auto_compaction_end",
			action: "context-full",
			result: {
				summary: "compacted",
				shortSummary: undefined,
				firstKeptEntryId: "message-1",
				tokensBefore: 42,
				details: {},
				preserveData: undefined,
			},
			aborted: false,
			willRetry: false,
			warningMessage: "Auto-compaction completed, but post-compaction tasks failed: todo sync failed",
		});

		expect(ctx.rebuildChatFromMessages).toHaveBeenCalledTimes(1);
		expect(ctx.showWarning).toHaveBeenCalledWith(
			"Auto-compaction completed, but post-compaction tasks failed: todo sync failed",
		);
		// Non-critical warning: session state is refreshed, so queue is flushed normally.
		expect(ctx.flushCompactionQueue).toHaveBeenCalledWith({ willRetry: false });
		expect(ctx.ui.requestRender).toHaveBeenCalledTimes(1);
	});

	it("shows an error without rebuilding when auto-compaction reports errorMessage", async () => {
		const ctx = {
			isInitialized: true,
			autoCompactionEscapeHandler: undefined,
			autoCompactionLoader: undefined,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
			rebuildChatFromMessages: vi.fn(),
			showWarning: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			ui: { requestRender: vi.fn() },
		} as unknown as InteractiveModeContext;
		const controller = new EventController(ctx);

		await controller.handleEvent({
			type: "auto_compaction_end",
			action: "context-full",
			result: undefined,
			aborted: false,
			willRetry: false,
			errorMessage: "Auto-compaction completed, but session could not be refreshed: build context failed",
		});

		expect(ctx.showWarning).toHaveBeenCalledWith(
			"Auto-compaction completed, but session could not be refreshed: build context failed",
		);
		expect(ctx.rebuildChatFromMessages).not.toHaveBeenCalled();
		expect(ctx.flushCompactionQueue).toHaveBeenCalledWith({ willRetry: false });
		expect(ctx.ui.requestRender).toHaveBeenCalledTimes(1);
	});

	it("skips queue flush when liveStateStale is set", async () => {
		const ctx = {
			isInitialized: true,
			autoCompactionEscapeHandler: undefined,
			autoCompactionLoader: undefined,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
			rebuildChatFromMessages: vi.fn(),
			showWarning: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			ui: { requestRender: vi.fn() },
		} as unknown as InteractiveModeContext;
		const controller = new EventController(ctx);

		await controller.handleEvent({
			type: "auto_compaction_end",
			action: "context-full",
			result: undefined,
			aborted: false,
			willRetry: false,
			errorMessage: "Auto-compaction completed, but session could not be refreshed: build context failed",
			liveStateStale: true,
		});

		expect(ctx.showWarning).toHaveBeenCalledWith(
			"Auto-compaction completed, but session could not be refreshed: build context failed",
		);
		expect(ctx.flushCompactionQueue).not.toHaveBeenCalled();
		expect(ctx.ui.requestRender).toHaveBeenCalledTimes(1);
	});

	it("does not show a warning when compaction is skipped (no preparation)", async () => {
		const ctx = {
			isInitialized: true,
			autoCompactionEscapeHandler: undefined,
			autoCompactionLoader: undefined,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
			rebuildChatFromMessages: vi.fn(),
			showWarning: vi.fn(),
			showStatus: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			ui: { requestRender: vi.fn() },
		} as unknown as InteractiveModeContext;
		const controller = new EventController(ctx);

		await controller.handleEvent({
			type: "auto_compaction_end",
			action: "context-full",
			result: undefined,
			aborted: false,
			willRetry: false,
			skipped: true,
		});

		expect(ctx.showWarning).not.toHaveBeenCalled();
		expect(ctx.rebuildChatFromMessages).not.toHaveBeenCalled();
		expect(ctx.flushCompactionQueue).toHaveBeenCalledWith({ willRetry: false });
		expect(ctx.ui.requestRender).toHaveBeenCalledTimes(1);
	});

	it("preserves queued messages when liveStateStale suppresses flush", async () => {
		const queuedMessages: CompactionQueuedMessage[] = [
			{ text: "fix the bug", mode: "steer" },
			{ text: "then run tests", mode: "followUp" },
		];
		const ctx = {
			isInitialized: true,
			autoCompactionEscapeHandler: undefined,
			autoCompactionLoader: undefined,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
			rebuildChatFromMessages: vi.fn(),
			showWarning: vi.fn(),
			compactionQueuedMessages: queuedMessages,
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			ui: { requestRender: vi.fn() },
		} as unknown as InteractiveModeContext;
		const controller = new EventController(ctx);

		await controller.handleEvent({
			type: "auto_compaction_end",
			action: "context-full",
			result: undefined,
			aborted: false,
			willRetry: false,
			errorMessage: "Auto-compaction completed, but session could not be refreshed: build context failed",
			liveStateStale: true,
		});

		// Flush was skipped, so queued messages must still be intact.
		// If they were silently dropped, the user loses input with no way to recover.
		expect(ctx.flushCompactionQueue).not.toHaveBeenCalled();
		expect(ctx.compactionQueuedMessages).toEqual(queuedMessages);
		expect(ctx.compactionQueuedMessages).toHaveLength(2);
	});

	it("forwards willRetry to flushCompactionQueue", async () => {
		const ctx = {
			isInitialized: true,
			autoCompactionEscapeHandler: undefined,
			autoCompactionLoader: undefined,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
			rebuildChatFromMessages: vi.fn(),
			showWarning: vi.fn(),
			flushCompactionQueue: vi.fn().mockResolvedValue(undefined),
			ui: { requestRender: vi.fn() },
		} as unknown as InteractiveModeContext;
		const controller = new EventController(ctx);

		await controller.handleEvent({
			type: "auto_compaction_end",
			action: "context-full",
			result: {
				summary: "compacted",
				shortSummary: undefined,
				firstKeptEntryId: "message-1",
				tokensBefore: 42,
				details: {},
				preserveData: undefined,
			},
			aborted: false,
			willRetry: true,
		});

		expect(ctx.flushCompactionQueue).toHaveBeenCalledWith({ willRetry: true });
	});
});
