
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTransactionalEmail } from "../services/email-transport.service.js";

describe("Brevo transactional email service", () => {
  let fetchMock;

  const emailData = {
    email: "recipient@example.com",
    name: "Test User",
    subject: "Verify your LinkForge account",
    message: "Click the button to verify your email.",
    buttonLabel: "Verify Email",
    actionUrl: "https://linkforge.example/verify?token=test-token",
  };

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        messageId: "<test-message-id>",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should send a transactional email through the Brevo API", async () => {
    const result = await sendTransactionalEmail(emailData);

    expect(result).toEqual({
      delivered: true,
      mode: "brevo",
      messageId: "<test-message-id>",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": expect.any(String),
      })
    );
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("should send the correct sender, recipient and message payload", async () => {
    await sendTransactionalEmail(emailData);

    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(payload.sender).toEqual({
      name: "LinkForge",
      email: expect.stringMatching(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
    });

    expect(payload.to).toEqual([
      {
        email: emailData.email,
        name: emailData.name,
      },
    ]);

    expect(payload.subject).toBe(emailData.subject);
    expect(payload.textContent).toContain(emailData.message);
    expect(payload.textContent).toContain(emailData.actionUrl);
    expect(payload.htmlContent).toContain(emailData.buttonLabel);
    expect(payload.htmlContent).toContain(emailData.actionUrl);
  });

  it("should escape HTML-sensitive content in the email template", async () => {
    await sendTransactionalEmail({
      ...emailData,
      name: '<script>alert("name")</script>',
      message: "<img src=x onerror=alert(1)>",
      buttonLabel: "<b>Verify</b>",
      actionUrl: 'https://example.com/?a=1&b="test"',
      subject: "<script>subject</script>",
    });

    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(payload.htmlContent).not.toContain("<script>");
    expect(payload.htmlContent).toContain("&lt;script&gt;");
    expect(payload.htmlContent).toContain("&lt;img");
    expect(payload.htmlContent).toContain("&lt;b&gt;");
    expect(payload.htmlContent).toContain("&amp;");
    expect(payload.htmlContent).toContain("&quot;");
  });

  it("should use User when the recipient name is omitted", async () => {
    await sendTransactionalEmail({
      ...emailData,
      name: undefined,
    });

    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(payload.to[0].name).toBe("User");
    expect(payload.htmlContent).toContain("Hello User");
    expect(payload.textContent).toContain("Hello User");
  });

  it("should reject invalid transactional email data", async () => {
    await expect(
      sendTransactionalEmail({
        ...emailData,
        email: undefined,
      })
    ).rejects.toThrow("Invalid transactional email data.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should reject the request when Brevo returns an HTTP error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(
      sendTransactionalEmail(emailData)
    ).rejects.toThrow("Brevo email delivery failed with HTTP 401.");

  });

  it("should reject a successful response without a message ID", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({}),
    });

    await expect(
      sendTransactionalEmail(emailData)
    ).rejects.toThrow(
      "Brevo accepted no verifiable message identifier."
    );
  });

  it("should propagate network errors", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("Network unavailable")
    );

    await expect(
      sendTransactionalEmail(emailData)
    ).rejects.toThrow("Network unavailable");
  });
});
