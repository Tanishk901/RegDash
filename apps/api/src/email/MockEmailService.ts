import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailResult, EmailService } from "./EmailService";

export class MockEmailService implements EmailService {
  name = "mock";
  sent: { message: EmailMessage; result: EmailResult }[] = [];

  async send(message: EmailMessage): Promise<EmailResult> {
    const result: EmailResult = {
      messageId: randomUUID(),
      sentAt: new Date().toISOString(),
      status: "sent",
    };
    this.sent.push({ message, result });
    console.log(`[email:mock] To: ${message.to} | Subject: ${message.subject}`);
    return result;
  }
}
