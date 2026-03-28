import type { Config, Context } from "@netlify/functions";

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Netlify.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Netlify.env.get("GOOGLE_CLIENT_SECRET") || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function isScam(subject: string, from: string, snippet: string): Promise<boolean> {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{
        role: "user",
        content: `Is this email a scam, phishing, or spam? Answer only YES or NO.\n\nFrom: ${from}\nSubject: ${subject}\nPreview: ${snippet}`,
      }],
    }),
  });
  const data = await res.json();
  const answer = data?.content?.[0]?.text?.trim().toUpperCase();
  return answer === "YES";
}

async function shouldReply(subject: string, from: string, snippet: string): Promise<boolean> {
  // Skip no-reply addresses, newsletters, notifications
  const skipPatterns = ["noreply", "no-reply", "donotreply", "newsletter", "notification", "automated", "mailer", "bounce"];
  const fromLower = from.toLowerCase();
  if (skipPatterns.some(p => fromLower.includes(p))) return false;
  return true;
}

async function getEmailBody(msgId: string, accessToken: string): Promise<string> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();

  // Try to get plain text body
  const parts = data.payload?.parts || [];
  let body = "";

  // Check for plain text part
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      body = Buffer.from(part.body.data, "base64").toString("utf-8");
      break;
    }
  }

  // If no parts, check payload body directly
  if (!body && data.payload?.body?.data) {
    body = Buffer.from(data.payload.body.data, "base64").toString("utf-8");
  }

  // Fall back to snippet if no body found
  return body || data.snippet || "";
}

async function generateReply(subject: string, from: string, body: string): Promise<string> {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are a professional email assistant. Write a personalized, helpful reply to this email.

Rules:
- Read the email carefully and respond specifically to what they asked or said
- Keep it 2-4 sentences, friendly and professional
- Do NOT use generic phrases like "Thank you for reaching out"
- Match the tone of the original email (casual if casual, formal if formal)
- Do NOT include subject line, just the reply body
- Sign off naturally

From: ${from}
Subject: ${subject}
Email content: ${body.substring(0, 1000)}

Write the reply now:`,
      }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text?.trim() || "";
}

export default async (req: Request, context: Context) => {
  // Get token from cookie
  const cookies = req.headers.get("cookie") || "";
  const match = cookies.match(/ap_gmail=([^;]+)/);
  if (!match) return new Response(JSON.stringify({ error: "Not connected" }), { status: 401 });

  let tokenData: any;
  try {
    tokenData = JSON.parse(Buffer.from(match[1], "base64").toString());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const accessToken = tokenData.refresh_token
    ? await getAccessToken(tokenData.refresh_token)
    : tokenData.access_token;

  // Fetch last 20 emails
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=is:unread",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  const messages = listData.messages || [];

  const results = { scanned: 0, deleted: 0, replied: 0, log: [] as any[] };

  for (const msg of messages) {
    // Get email details
    const emailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const email = await emailRes.json();
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const snippet = email.snippet || "";

    results.scanned++;

    // Check if scam
    const scam = await isScam(subject, from, snippet);

    if (scam) {
      // Move to trash
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/trash`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      results.deleted++;
      results.log.push({ subject, from, action: "🗑️ Deleted (scam)" });
    } else {
      results.log.push({ subject, from, action: "✅ Safe" });

      // Check if should auto-reply
      if (await shouldReply(subject, from, snippet)) {
        const fullBody = await getEmailBody(msg.id, accessToken);
        const replyText = await generateReply(subject, from, fullBody);
        if (replyText) {
          try {
            // Get the Message-ID header for proper threading
            const fullEmailRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=From`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const fullEmail = await fullEmailRes.json();
            const allHeaders = fullEmail.payload?.headers || [];
            const messageId = allHeaders.find((h: any) => h.name === "Message-ID")?.value || "";

            // Build proper RFC 2822 email
            const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
            const emailLines = [
              `To: ${from}`,
              `Subject: ${replySubject}`,
              `Content-Type: text/plain; charset=utf-8`,
              messageId ? `In-Reply-To: ${messageId}` : "",
              messageId ? `References: ${messageId}` : "",
              "",
              replyText,
            ].filter(Boolean).join("\r\n");

            const encoded = Buffer.from(emailLines)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ raw: encoded, threadId: email.threadId }),
            });

            if (sendRes.ok) {
              results.replied++;
              results.log[results.log.length - 1].action = "↩️ Auto-replied";
              results.log[results.log.length - 1].reply = replyText;
            }
          } catch (replyErr) {
            // Reply failed silently — don't break the whole scan
          }
        }
      }
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/scan-emails",
};
