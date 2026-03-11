import { describe, expect, it, vi } from "bun:test";
import { EventController } from "@oh-my-pi/pi-coding-agent/modes/controllers/event-controller";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";

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
		});

		expect(ctx.showWarning).not.toHaveBeenCalled();
		expect(ctx.rebuildChatFromMessages).not.toHaveBeenCalled();
		expect(ctx.flushCompactionQueue).toHaveBeenCalledWith({ willRetry: false });
		expect(ctx.ui.requestRender).toHaveBeenCalledTimes(1);
	});
});
