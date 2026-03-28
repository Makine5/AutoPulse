import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const message = body?.message;
  if (!message) return new Response("OK");

  const chatId = message?.chat?.id;
  const text = message?.text || "";
  const botToken = Netlify.env.get("TELEGRAM_BOT_TOKEN");
  const businessInfo = Netlify.env.get("TELEGRAM_BUSINESS_INFO") || "A helpful business assistant.";
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");

  if (!botToken || !chatId) return new Response("OK");

  // Handle /start command
  if (text === "/start") {
    await sendTelegramMessage(botToken, chatId, "👋 Hi! I'm your AI assistant. How can I help you today?");
    return new Response("OK");
  }

  // Generate AI reply
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: `You are a friendly customer service assistant. Business info: ${businessInfo}. Keep replies short, friendly, and helpful. 2-3 sentences max.`,
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = await res.json();
    const reply = data?.content?.[0]?.text?.trim() || "Sorry, I couldn't process that. Please try again!";
    await sendTelegramMessage(botToken, chatId, reply);
  } catch (err) {
    await sendTelegramMessage(botToken, chatId, "Sorry, something went wrong. Please try again!");
  }

  return new Response("OK");
};

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export const config: Config = {
  path: "/telegram-webhook",
};
