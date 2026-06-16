"use strict";

const { randomBytes } = require("node:crypto");

async function main() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const context = process.env.DEPLOY_FAILURE_CONTEXT || "kepi-travel deploy/CI";

  if (!dsn) {
    console.log("notify-deploy-failure: no SENTRY_DSN — skip");
    return;
  }

  const match = dsn.match(/^https?:\/\/([^@]+)@([^/]+)\/(\d+)/u);
  if (!match) {
    console.warn("notify-deploy-failure: invalid DSN format — skip");
    return;
  }

  const [, key, host, projectId] = match;
  const url = `https://${host}/api/${projectId}/store/`;

  const body = JSON.stringify({
    event_id: randomBytes(16).toString("hex"),
    message: `${context} failed`,
    level: "error",
    platform: "node",
    tags: { source: "github-actions", repo: "kepi-travel" },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=kepi-notify/1.0`,
    },
    body,
  });

  if (!res.ok) {
    console.warn(`notify-deploy-failure: Sentry HTTP ${res.status}`);
  } else {
    console.log("notify-deploy-failure: sent to Sentry");
  }
}

main().catch((err) => {
  console.warn("notify-deploy-failure:", err instanceof Error ? err.message : err);
});
