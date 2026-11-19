export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
}

export interface EmailResult {
  messageId: string;
  sentAt: string;
  status: "sent" | "failed";
  error?: string;
}

export interface EmailService {
  name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}
