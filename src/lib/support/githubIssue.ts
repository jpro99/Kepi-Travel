import { logger } from "@/lib/logger";

const REPO = "jpro99/Kepi-Travel";
const GITHUB_API = "https://api.github.com";

export interface GitHubIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubIssueResult {
  number: number;
  url: string;
}

export async function createGitHubIssue(input: GitHubIssueInput): Promise<GitHubIssueResult | null> {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.BUG_REPORT_GITHUB_TOKEN?.trim();
  if (!token) {
    logger.warn("GITHUB_TOKEN not set — skipping GitHub issue creation.");
    return null;
  }

  try {
    const response = await fetch(`${GITHUB_API}/repos/${REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels ?? ["user-bug"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "(unreadable)");
      logger.warn("GitHub issue creation failed.", { status: response.status, body: errorText.slice(0, 200) });
      return null;
    }

    const data = (await response.json()) as { number: number; html_url: string };
    return { number: data.number, url: data.html_url };
  } catch (error) {
    logger.warn("GitHub issue creation threw.", { error: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}
