import type { Config, Context } from "@netlify/functions";

// Version 3 - fresh deploy
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const { message, businessInfo, history } = body;

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");

  const systemPrompt = `You are a friendly, helpful customer service chatbot for a business. 
Business info: ${businessInfo || "A helpful business ready to assist customers."}
Keep responses short (2-3 sentences max), friendly, and helpful.
If you don't know something specific, say you'll connect them with a team member.
Never make up prices, hours, or specific details not provided.`;

  const messages = [
    ...(history || []),
    { role: "user", content: message }
  ];

  if (!apiKey) {
    return new Response(JSON.stringify({ reply: "API key not configured. Please check Netlify environment variables." }), {
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
        max_tokens: 200,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await res.json();
    console.log("Anthropic response status:", res.status);
    console.log("Anthropic data:", JSON.stringify(data).substring(0, 200));

    if (!res.ok) {
      return new Response(JSON.stringify({ reply: `API error: ${data?.error?.message || res.status}` }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const reply = data?.content?.[0]?.text?.trim() || "I'm sorry, I couldn't process that.";
    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Chatbot error:", err.message);
    return new Response(JSON.stringify({ reply: "Error: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/chatbot",
};
