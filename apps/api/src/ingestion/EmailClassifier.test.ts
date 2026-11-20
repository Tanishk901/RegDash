import { describe, expect, it } from "vitest";
import { classifyEmail } from "./EmailClassifier";

describe("EmailClassifier", () => {
  it("classifies an outage email as incident with high priority", () => {
    const result = classifyEmail(
      "RegCreate is down — production outage",
      "The system is completely unavailable. This is critical.",
    );
    expect(result.classification).toBe("incident");
    expect(result.draftType).toBe("INCIDENT");
    expect(result.priority).toBe("P1");
  });

  it("classifies an error report as incident", () => {
    const result = classifyEmail(
      "Error when submitting form",
      "I keep getting an error message. The form is not working properly.",
    );
    expect(result.classification).toBe("incident");
    expect(result.draftType).toBe("INCIDENT");
  });

  it("classifies an access request", () => {
    const result = classifyEmail(
      "Request access for new team member",
      "Please provision access and add the new user to RegCreate.",
    );
    expect(result.classification).toBe("access_request");
    expect(result.draftType).toBe("SR");
    expect(result.priority).toBe("P3");
  });

  it("classifies a change request as service request", () => {
    const result = classifyEmail(
      "Request to add new field",
      "We need to configure a new field in the registration template. Please create a change request.",
    );
    expect(result.classification).toBe("service_request");
    expect(result.draftType).toBe("SR");
  });

  it("classifies a vague email as general inquiry", () => {
    const result = classifyEmail(
      "Question about data",
      "Hi, I had a question about the lifecycle of some information.",
    );
    expect(result.classification).toBe("general_inquiry");
    expect(result.priority).toBe("P4");
  });
});
