import test from "node:test";
import assert from "node:assert/strict";
import { buildSupportChatApiMessages } from "@/lib/support/buildSupportChatApiMessages";

test("buildSupportChatApiMessages drops welcome assistant and starts with user", () => {
  const apiMessages = buildSupportChatApiMessages(
    [
      {
        id: "assistant-welcome",
        role: "assistant",
        content: "Hi! I'm Kepi Support.",
      },
    ],
    { role: "user", content: "How do I forward a hotel confirmation?" },
  );

  assert.deepEqual(apiMessages, [
    { role: "user", content: "How do I forward a hotel confirmation?" },
  ]);
});

test("buildSupportChatApiMessages merges consecutive same-role turns", () => {
  const apiMessages = buildSupportChatApiMessages(
    [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Follow-up" },
    ],
    { role: "user", content: "Extra detail" },
  );

  assert.deepEqual(apiMessages, [
    { role: "user", content: "First question" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Follow-up\nExtra detail" },
  ]);
});
