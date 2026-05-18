import assert from "node:assert/strict";
import test from "node:test";
import {
  generateDisruptionRecoveryPlan,
  generateLayoverSuggestions,
  setAISuggestionClientFactoryForTests,
} from "@/lib/travelAssistant/aiSuggestionService";

type StreamChunkSpec = {
  text: string;
};

function createMockClient(chunks: StreamChunkSpec[], onRequest?: (payload: unknown) => void) {
  return {
    messages: {
      stream(payload: unknown) {
        onRequest?.(payload);
        return {
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield {
                type: "content_block_delta",
                index: 0,
                delta: {
                  type: "text_delta",
                  text: chunk.text,
                },
              } as const;
            }
          },
        };
      },
    },
  };
}

async function collectStream(stream: AsyncGenerator<string>): Promise<string> {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}

test("layover suggestions stream structured guidance", async () => {
  setAISuggestionClientFactoryForTests(() =>
    createMockClient([
      { text: "Quick options now:\n- Hydrate and stretch.\n" },
      { text: "Latest safe return-to-gate timing:\n- T-45 minutes.\n" },
      { text: "Anti-miss checklist:\n- Recheck gate every 15 minutes." },
    ]),
  );

  try {
    const output = await collectStream(generateLayoverSuggestions("test-user", "SFO", 130));
    assert.match(output, /Quick options now:/u);
    assert.match(output, /Latest safe return-to-gate timing:/u);
    assert.match(output, /Anti-miss checklist:/u);
  } finally {
    setAISuggestionClientFactoryForTests(null);
  }
});

test("disruption recovery suggestions include rebooking context", async () => {
  setAISuggestionClientFactoryForTests(() =>
    createMockClient([
      { text: "Rebooking path:\n1) Request earliest protected routing.\n" },
      { text: "Ground transport alternatives:\n- Rail backup from terminal transfer point." },
    ]),
  );

  try {
    const output = await collectStream(
      generateDisruptionRecoveryPlan("test-user", {
        scenario: "missed flight",
        severity: "critical",
        summary: "Primary leg cancelled at gate.",
      }),
    );
    assert.match(output, /Rebooking path:/u);
    assert.match(output, /protected routing/u);
  } finally {
    setAISuggestionClientFactoryForTests(null);
  }
});

test("prompt and output exclude travel insurance phrase", async () => {
  let capturedRequestPayload: unknown = null;
  setAISuggestionClientFactoryForTests(() =>
    createMockClient(
      [{ text: "You should buy travel insurance before departure." }],
      (payload) => {
        capturedRequestPayload = payload;
      },
    ),
  );

  try {
    const output = await collectStream(generateLayoverSuggestions("test-user", "JFK", 180));
    const payloadText = JSON.stringify(capturedRequestPayload ?? {});
    assert.doesNotMatch(payloadText, /travel insurance/iu);
    assert.doesNotMatch(output, /travel insurance/iu);
  } finally {
    setAISuggestionClientFactoryForTests(null);
  }
});
