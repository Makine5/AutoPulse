import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Netlify.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Netlify.env.get("REDIRECT_URI") || "https://autopulse-ai.netlify.app/gmail-auth";

  // Step 1: No code yet — redirect to Google
  if (!code && !error) {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId || "");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.modify");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    return Response.redirect(authUrl.toString(), 302);
  }

  // Step 2: Error from Google
  if (error) {
    return Response.redirect("/?error=access_denied", 302);
  }

  // Step 3: Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code!,
      client_id: clientId || "",
      client_secret: clientSecret || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.access_token) {
    return Response.redirect("/?error=token_failed", 302);
  }

  // Store tokens in a cookie (simple approach)
  const tokenData = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    connected: true,
    connected_at: new Date().toISOString(),
  });

  const encoded = Buffer.from(tokenData).toString("base64");

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/?connected=true",
      "Set-Cookie": `ap_gmail=${encoded}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
};

export const config: Config = {
  path: "/gmail-auth",
};
