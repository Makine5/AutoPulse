import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const { business, customers, competitors, difference, goal } = body;

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");

  const prompt = `You are an expert brand strategist. Analyze this business and create a comprehensive brand strategy.

Business: ${business}
Target Customers: ${customers}
Main Competitors: ${competitors}
What makes them different: ${difference}
Main Goal: ${goal}

Respond with a JSON object (no markdown, no backticks) with exactly this structure:
{
  "brandVoice": "2-3 sentences describing how they should sound and communicate",
  "taglines": ["tagline 1", "tagline 2", "tagline 3"],
  "targetAudience": "Specific description of ideal customer",
  "keyMessages": ["message 1", "message 2", "message 3"],
  "marketingChannels": ["channel 1", "channel 2", "channel 3"],
  "competitiveAdvantage": "What makes them stand out vs competitors",
  "contentIdeas": ["idea 1", "idea 2", "idea 3"],
  "thirtyDayPlan": ["week 1 action", "week 2 action", "week 3 action", "week 4 action"]
}`;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    console.log("Brand strategy status:", res.status);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `API error: ${data?.error?.message || res.status}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = data?.content?.[0]?.text?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();

    try {
      const strategy = JSON.parse(clean);
      return new Response(JSON.stringify(strategy), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse strategy: " + clean.substring(0, 100) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("Brand strategy error:", err.message);
    return new Response(JSON.stringify({ error: "Error: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/brand-strategy",
};
