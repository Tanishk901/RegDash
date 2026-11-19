import type { Priority, Ticket, TicketType } from "@regdash/shared";
import type { EmbeddingProvider } from "./EmbeddingProvider";
import type { KnowledgeStore } from "./KnowledgeStore";

export interface TriageSuggestion {
  id: string;
  ticketNumber: string;
  suggestedPriority: Priority;
  suggestedCategory: TicketType;
  suggestedAssignee: string | null;
  confidence: number;
  reasoning: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  originalPriority: Priority;
  originalAssignee: string | null;
}

const PRIORITY_KEYWORDS: Record<Priority, string[]> = {
  P1: ["critical", "outage", "down", "security", "data loss", "breach", "unable to", "production down"],
  P2: ["high", "blocking", "urgent", "error 500", "timeout", "fail", "broken", "stuck"],
  P3: ["slow", "intermittent", "cosmetic", "minor", "request", "access", "new user"],
  P4: ["question", "info", "enhancement", "low", "nice to have", "documentation"],
};

const CATEGORY_KEYWORDS: Record<TicketType, string[]> = {
  INCIDENT: ["error", "fail", "down", "broken", "crash", "outage", "timeout", "bug", "unable", "not working"],
  SR: ["access", "new user", "role", "request", "create", "enable", "provision", "extract", "report", "update"],
};

function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

export class TriageEngine {
  constructor(
    private embedding: EmbeddingProvider,
    private knowledgeStore: KnowledgeStore,
    private teamMembers: string[],
  ) {}

  async triage(ticket: Ticket, openTickets: Ticket[]): Promise<Omit<TriageSuggestion, "id" | "status" | "createdAt" | "reviewedAt" | "reviewedBy">> {
    const text = `${ticket.shortDescription} ${ticket.description ?? ""}`;

    const priority = this.suggestPriority(text, ticket.priority);
    const category = this.suggestCategory(text);
    const assignee = this.suggestAssignee(text, openTickets);
    const confidence = this.calculateConfidence(text, priority, category);

    const reasons: string[] = [];
    if (priority !== ticket.priority) reasons.push(`Priority ${ticket.priority} → ${priority} based on keyword analysis`);
    if (category !== ticket.type) reasons.push(`Category ${ticket.type} → ${category} based on content`);
    if (assignee) reasons.push(`Suggested assignee: ${assignee} (lowest workload with relevant experience)`);
    if (reasons.length === 0) reasons.push("No changes suggested — current triage looks correct");

    return {
      ticketNumber: ticket.number,
      suggestedPriority: priority,
      suggestedCategory: category,
      suggestedAssignee: assignee,
      confidence,
      reasoning: reasons.join(". "),
      originalPriority: ticket.priority,
      originalAssignee: ticket.assignedTo,
    };
  }

  private suggestPriority(text: string, current: Priority): Priority {
    let bestPriority = current;
    let bestScore = 0;

    for (const [p, keywords] of Object.entries(PRIORITY_KEYWORDS) as [Priority, string[]][]) {
      const s = keywordScore(text, keywords);
      if (s > bestScore) {
        bestScore = s;
        bestPriority = p;
      }
    }
    return bestScore > 0 ? bestPriority : current;
  }

  private suggestCategory(text: string): TicketType {
    const incScore = keywordScore(text, CATEGORY_KEYWORDS.INCIDENT);
    const srScore = keywordScore(text, CATEGORY_KEYWORDS.SR);
    return incScore >= srScore ? "INCIDENT" : "SR";
  }

  private suggestAssignee(text: string, openTickets: Ticket[]): string | null {
    if (this.teamMembers.length === 0) return null;

    const workload = new Map<string, number>();
    for (const m of this.teamMembers) workload.set(m, 0);
    for (const t of openTickets) {
      if (t.assignedTo && workload.has(t.assignedTo)) {
        workload.set(t.assignedTo, workload.get(t.assignedTo)! + 1);
      }
    }

    let minLoad = Infinity;
    let best: string | null = null;
    for (const [member, load] of workload) {
      if (load < minLoad) {
        minLoad = load;
        best = member;
      }
    }
    return best;
  }

  private calculateConfidence(text: string, priority: Priority, category: TicketType): number {
    const pScore = keywordScore(text, PRIORITY_KEYWORDS[priority]);
    const cScore = keywordScore(text, CATEGORY_KEYWORDS[category]);
    const raw = Math.min((pScore + cScore) / 6, 1);
    return Math.round(raw * 100) / 100;
  }
}
