export interface IncomingEmail {
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

const SAMPLE_EMAILS: IncomingEmail[] = [
  {
    from: "john.doe@example.com",
    subject: "RegCreate application is down — cannot access login page",
    body: "Hi team,\n\nThe RegCreate application is completely unavailable. Users are getting a 503 error when trying to access the login page. This is impacting the entire PROD environment.\n\nPlease treat this as urgent.\n\nThanks,\nJohn",
    receivedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    from: "jane.smith@example.com",
    subject: "Request access to RegCreate for new team member",
    body: "Hello,\n\nWe have a new team member, Sarah Johnson, who needs access to the RegCreate application in the QA environment. Her employee ID is EMP-45678.\n\nCould you please provision her account?\n\nBest regards,\nJane Smith",
    receivedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
  {
    from: "mike.wilson@example.com",
    subject: "Error when submitting registration form",
    body: "Hi,\n\nI'm getting a validation error when trying to submit a new registration in RegCreate. The error message says 'Failed to process request' and the form data is lost.\n\nThis has happened 3 times today. Can someone look into this?\n\nMike",
    receivedAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
  },
  {
    from: "alice.brown@example.com",
    subject: "Request to add new field to registration template",
    body: "Hello RegCreate team,\n\nWe need to add a new 'Country of Origin' field to the SYMPHONY registration template. This is a regulatory requirement that needs to be in place by end of month.\n\nCan you create a change request for this?\n\nThanks,\nAlice",
    receivedAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
  },
  {
    from: "bob.jones@example.com",
    subject: "Question about data retention policy",
    body: "Hi team,\n\nI have a question about how long registration data is retained in the system. Our compliance team is asking about the data lifecycle for audit purposes.\n\nCould someone point me to the right documentation?\n\nThanks,\nBob",
    receivedAt: new Date(Date.now() - 8 * 60 * 60_000).toISOString(),
  },
];

export class MockMailbox {
  name = "mock";
  private fetched = false;

  async fetchNewEmails(): Promise<IncomingEmail[]> {
    if (this.fetched) return [];
    this.fetched = true;
    return [...SAMPLE_EMAILS];
  }

  reset(): void {
    this.fetched = false;
  }
}
