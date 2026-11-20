import { toView, type Ticket } from "@regdash/shared";
import type { EmailService } from "./EmailService";
import type { EmailLogStore } from "./EmailLogStore";
import type { TemplateStore } from "./TemplateStore";
import { mergeTemplate } from "./merge";

export interface AutomationConfig {
  staleReminderDays: number;
  enabled: boolean;
}

export interface AutomationResult {
  trigger: string;
  sent: number;
  skipped: number;
  errors: string[];
}

export class EmailAutomation {
  private config: AutomationConfig = {
    staleReminderDays: 2,
    enabled: true,
  };

  constructor(
    private emailService: EmailService,
    private emailLog: EmailLogStore,
    private templateStore: TemplateStore,
  ) {}

  getConfig(): AutomationConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<AutomationConfig>): AutomationConfig {
    this.config = { ...this.config, ...partial };
    return this.getConfig();
  }

  async sendStaleReminders(tickets: Ticket[], now = new Date()): Promise<AutomationResult> {
    const result: AutomationResult = { trigger: "stale_reminder", sent: 0, skipped: 0, errors: [] };
    if (!this.config.enabled) return result;

    const template = this.templateStore.all().find((t) => t.kind === "reminder");
    if (!template) {
      result.errors.push("No reminder template configured");
      return result;
    }

    const staleHours = this.config.staleReminderDays * 24;
    for (const raw of tickets) {
      const ticket = toView(raw, now);
      if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") { result.skipped++; continue; }
      if (ticket.hoursSinceUpdate < staleHours) { result.skipped++; continue; }

      const alreadySent = this.emailLog.byTicket(ticket.number)
        .some((e) => e.trigger === "auto_reminder" && withinHours(e.sentAt, 24, now));
      if (alreadySent) { result.skipped++; continue; }

      const to = ticket.assignedTo ?? ticket.requestedBy;
      if (!to) { result.skipped++; continue; }

      try {
        const subject = mergeTemplate(template.subject, ticket);
        const body = mergeTemplate(template.body, ticket);
        const emailResult = await this.emailService.send({ to, subject, body, templateId: template.id });
        await this.emailLog.add({
          to,
          subject,
          body,
          templateId: template.id,
          ticketNumber: ticket.number,
          trigger: "auto_reminder",
          status: emailResult.status,
          error: emailResult.error ?? null,
          messageId: emailResult.messageId,
          sentAt: emailResult.sentAt,
          sentBy: null,
        });
        result.sent++;
      } catch (err) {
        result.errors.push(`${ticket.number}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return result;
  }

  async sendWelcomeEmail(to: string, extraFields: Record<string, string> = {}): Promise<AutomationResult> {
    const result: AutomationResult = { trigger: "welcome", sent: 0, skipped: 0, errors: [] };
    if (!this.config.enabled) return result;

    const template = this.templateStore.all().find((t) => t.kind === "welcome");
    if (!template) {
      result.errors.push("No welcome template configured");
      return result;
    }

    try {
      let subject = template.subject;
      let body = template.body;
      for (const [k, v] of Object.entries(extraFields)) {
        subject = subject.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
        body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      }

      const emailResult = await this.emailService.send({ to, subject, body, templateId: template.id });
      await this.emailLog.add({
        to,
        subject,
        body,
        templateId: template.id,
        ticketNumber: null,
        trigger: "auto_welcome",
        status: emailResult.status,
        error: emailResult.error ?? null,
        messageId: emailResult.messageId,
        sentAt: emailResult.sentAt,
        sentBy: null,
      });
      result.sent++;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
    return result;
  }

  async sendAcknowledgement(ticketRaw: Ticket, to: string, now = new Date()): Promise<AutomationResult> {
    const result: AutomationResult = { trigger: "acknowledgement", sent: 0, skipped: 0, errors: [] };
    if (!this.config.enabled) return result;

    const template = this.templateStore.all().find((t) => t.kind === "acknowledgement");
    if (!template) {
      result.errors.push("No acknowledgement template configured");
      return result;
    }

    const ticket = toView(ticketRaw, now);
    try {
      const subject = mergeTemplate(template.subject, ticket);
      const body = mergeTemplate(template.body, ticket);
      const emailResult = await this.emailService.send({ to, subject, body, templateId: template.id });
      await this.emailLog.add({
        to,
        subject,
        body,
        templateId: template.id,
        ticketNumber: ticket.number,
        trigger: "auto_ack",
        status: emailResult.status,
        error: emailResult.error ?? null,
        messageId: emailResult.messageId,
        sentAt: emailResult.sentAt,
        sentBy: null,
      });
      result.sent++;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
    return result;
  }
}

function withinHours(isoDate: string, hours: number, now: Date): boolean {
  const sent = new Date(isoDate).getTime();
  return now.getTime() - sent < hours * 60 * 60 * 1000;
}
