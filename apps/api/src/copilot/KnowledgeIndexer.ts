import type { Ticket } from "@regdash/shared";
import type { EmbeddingProvider } from "./EmbeddingProvider";
import type { KnowledgeChunk, KnowledgeStore } from "./KnowledgeStore";

const MOCK_SOPS: { id: string; title: string; content: string }[] = [
  {
    id: "sop-login-issues",
    title: "SOP: Troubleshooting Login Issues",
    content: "1. Verify the user's account exists in the access matrix.\n2. Check the SSO token lifetime configuration.\n3. If MFA is involved, confirm the authenticator is registered.\n4. For provisioning issues, verify the account is in the correct OU.\n5. Escalate to Identity team if the issue persists after 30 minutes.",
  },
  {
    id: "sop-performance",
    title: "SOP: Investigating Performance Issues",
    content: "1. Ask the user to capture a HAR file.\n2. Check if the issue is region-specific.\n3. Review application server metrics (CPU, memory, disk I/O).\n4. Check for slow database queries in the APM dashboard.\n5. If network-related, escalate to the networking team with the HAR file.",
  },
  {
    id: "sop-sync-jobs",
    title: "SOP: Handling Failed Sync Jobs",
    content: "1. Check the job scheduler dashboard for the last run status.\n2. Review the job log for errors or timeouts.\n3. If the job timed out, check for data volume spikes.\n4. Re-run the job manually and verify record counts.\n5. If the job fails repeatedly, escalate to the platform team.",
  },
  {
    id: "sop-email-notifications",
    title: "SOP: Email and Notification Troubleshooting",
    content: "1. Verify the mail relay service status.\n2. Check the notification queue for stuck messages.\n3. Confirm recipient addresses and distribution lists are correct.\n4. Test with a manual notification send.\n5. If relay is down, raise an incident with the messaging team.",
  },
  {
    id: "sop-access-requests",
    title: "SOP: Processing Access Requests",
    content: "1. Verify the request has manager approval.\n2. Check the cost-centre details are provided.\n3. Create the account in the correct OU with the requested role.\n4. Send the welcome email with login instructions.\n5. For bulk requests (>5 users), use the batch provisioning tool.",
  },
  {
    id: "sop-data-extracts",
    title: "SOP: Running Data Extracts for Audit",
    content: "1. Confirm the extract scope (date range, submission types).\n2. Run the extract query against the read replica.\n3. Validate row counts against the source system.\n4. Export to the requested format (CSV/Excel).\n5. Deliver via secure file share, never email.",
  },
  {
    id: "sop-change-requests",
    title: "SOP: Managing Configuration Changes",
    content: "1. Document the change in the change request form.\n2. Submit for CAB approval if the change affects production.\n3. Schedule the change window with the platform team.\n4. Execute the change and verify in the target environment.\n5. Close the change record with evidence of successful deployment.",
  },
  {
    id: "sop-incident-escalation",
    title: "SOP: Incident Escalation Procedure",
    content: "1. P1 incidents must be acknowledged within 15 minutes.\n2. Notify the on-call manager and assemble the bridge call.\n3. Post status updates every 30 minutes to the incident channel.\n4. After resolution, complete the post-incident review within 48 hours.\n5. Document root cause and preventive actions in the PIR.",
  },
];

export class KnowledgeIndexer {
  constructor(
    private embedding: EmbeddingProvider,
    private store: KnowledgeStore,
  ) {}

  async indexAll(closedTickets: Ticket[]): Promise<number> {
    const sopChunks = await this.indexSops();
    const ticketChunks = await this.indexClosedTickets(closedTickets);
    const all = [...sopChunks, ...ticketChunks];
    await this.store.reindex(all);
    return all.length;
  }

  private async indexSops(): Promise<KnowledgeChunk[]> {
    const texts = MOCK_SOPS.map((s) => `${s.title}\n\n${s.content}`);
    const vectors = await this.embedding.embedBatch(texts);
    return MOCK_SOPS.map((s, i) => ({
      id: s.id,
      source: "sop" as const,
      title: s.title,
      content: s.content,
      vector: vectors[i],
      metadata: { type: "sop" },
    }));
  }

  private async indexClosedTickets(tickets: Ticket[]): Promise<KnowledgeChunk[]> {
    const closed = tickets.filter((t) => t.status === "CLOSED" || t.status === "RESOLVED");
    if (closed.length === 0) return [];

    const texts = closed.map((t) => {
      const notes = t.updates.map((u) => u.note).join("\n");
      return `${t.shortDescription}\n\n${notes}`;
    });
    const vectors = await this.embedding.embedBatch(texts);

    return closed.map((t, i) => ({
      id: `ticket-${t.number}`,
      source: "ticket" as const,
      title: `${t.number}: ${t.shortDescription}`,
      content: texts[i],
      vector: vectors[i],
      metadata: { number: t.number, type: t.type, priority: t.priority },
    }));
  }
}
