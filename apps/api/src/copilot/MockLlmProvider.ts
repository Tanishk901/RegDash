import type { LlmAnswer, LlmCitation, LlmProvider } from "./LlmProvider";

const KEYWORD_RESPONSES: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["login", "access", "sign in", "authentication", "password", "mfa"],
    answer: "Check the user's role mapping in the access matrix. If MFA is involved, verify the token lifetime in the SSO configuration. For provisioning issues, confirm the account was created in the correct OU and the welcome email was sent.",
  },
  {
    keywords: ["slow", "performance", "timeout", "latency", "load time"],
    answer: "Collect a network trace (HAR file) from the affected user. Check if the issue is region-specific by comparing response times from different locations. Review the application server logs for slow queries or high CPU.",
  },
  {
    keywords: ["error", "500", "fail", "crash", "exception"],
    answer: "Check the API and application server logs for the full stack trace. Identify whether the error is intermittent or consistent. If it's a 500, look for recent deployments or config changes that may have introduced a regression.",
  },
  {
    keywords: ["sync", "job", "batch", "index", "reindex"],
    answer: "Verify the job scheduler is running and check the last execution timestamp. Review the job logs for errors or timeouts. If the job failed, re-run it manually and confirm record counts match expectations.",
  },
  {
    keywords: ["email", "notification", "mail", "relay", "smtp"],
    answer: "Confirm the mail relay service is operational. Check the notification queue for stuck or pending messages. Verify the recipient email addresses are correct and the distribution list is up to date.",
  },
  {
    keywords: ["upload", "attachment", "file", "document", "pdf"],
    answer: "Check the file size against the gateway upload limit. For PDF rendering issues, test with a smaller sample file first. Review the storage service logs for write errors or quota exhaustion.",
  },
  {
    keywords: ["duplicate", "bulk", "import", "data"],
    answer: "Identify the duplicate records using a unique key comparison. Prepare a cleanup script but get approval before executing. For bulk operations, validate the input data for duplicates before processing.",
  },
  {
    keywords: ["permission", "acl", "role", "security", "audit"],
    answer: "Audit the user's group memberships and ACL entries. For cross-region visibility issues, treat as priority and escalate to InfoSec. Document all access changes for the audit trail.",
  },
];

const DEFAULT_ANSWER = "Review the ticket details and check the application logs for more context. If the issue persists, consider escalating to the relevant team with a detailed summary of steps taken so far.";

function score(prompt: string, keywords: string[]): number {
  const lower = prompt.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async generateAnswer(prompt: string, context: string[]): Promise<LlmAnswer> {
    let bestAnswer = DEFAULT_ANSWER;
    let bestScore = 0;

    for (const entry of KEYWORD_RESPONSES) {
      const s = score(prompt, entry.keywords);
      if (s > bestScore) {
        bestScore = s;
        bestAnswer = entry.answer;
      }
    }

    const citations: LlmCitation[] = context.slice(0, 2).map((c, i) => ({
      chunkId: `ctx-${i}`,
      title: c.slice(0, 60).replace(/\n/g, " "),
      snippet: c.slice(0, 200),
    }));

    return { answer: bestAnswer, citations, model: "mock-llm-v1" };
  }
}
