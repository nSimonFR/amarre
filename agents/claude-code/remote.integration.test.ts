// Integration test for the Remote Claude façade — runs against the real
// `api.anthropic.com` bridge. Gated by AMARRE_REMOTE_CLAUDE_TEST_TOKEN_PATH so
// CI stays offline; mirrors `server/push.integration.test.ts` gating idiom.
//
// Usage on the rpi5:
//   AMARRE_REMOTE_CLAUDE_TEST_TOKEN_PATH=/run/claude-oauth/token \
//     bun test agents/claude-code/remote.integration.test.ts

import { describe, expect, test } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";

import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import {
  createRemoteController,
  type RemoteControllerCallbacks,
} from "./remote";

const TOKEN_PATH = process.env.AMARRE_REMOTE_CLAUDE_TEST_TOKEN_PATH ?? "";
const BASE_URL = process.env.AMARRE_REMOTE_CLAUDE_TEST_BASE_URL ?? "https://api.anthropic.com";

const itLive = TOKEN_PATH ? test : test.skip;

function emptyCallbacks(): RemoteControllerCallbacks {
  return {
    onInboundUserMessage: () => {},
    onPermissionResponse: () => {},
    onInterrupt: () => {},
    onSetModel: () => {},
    onSetPermissionMode: () => ({ ok: true }) as const,
    onClose: () => {},
  };
}

describe("remote integration", () => {
  itLive(
    "create + attach + write a synthetic SDKMessage + close",
    async () => {
      const cb = emptyCallbacks();
      const inbound: SDKUserMessage[] = [];
      cb.onInboundUserMessage = (m) => inbound.push(m);

      const handle = await createRemoteController({
        mode: "dual",
        tokenPath: TOKEN_PATH,
        baseUrl: BASE_URL,
        title: `amarre-int-${Date.now().toString(36)}`,
        tags: ["amarre", "integration"],
        callbacks: cb,
      });
      expect(handle).not.toBeNull();
      if (!handle) return;

      try {
        // Synthetic system+assistant pair so claude.ai gets a real-looking
        // turn. The SDK's wire schema requires session_id to be injected by
        // the bridge handle (it does so internally on write).
        const init: SDKMessage = {
          type: "system",
          subtype: "init",
          session_id: handle.ccrSessionId,
        } as unknown as SDKMessage;
        const assistant: SDKMessage = {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "hello from amarre integration test" }],
          },
        } as unknown as SDKMessage;

        handle.write(init);
        handle.write(assistant);
        handle.sendResult();
        handle.reportState("idle");

        // Give the SSE channel a moment to flush. We don't assert the inbound
        // list (no claude.ai client is typing into this throwaway session);
        // we only care that no throws happen and the close path is clean.
        await sleep(500);
      } finally {
        await handle.close();
      }

      // No claude.ai user, so inbound must be empty.
      expect(inbound).toHaveLength(0);
    },
    20_000,
  );
});
