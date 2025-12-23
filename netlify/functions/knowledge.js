/**
 * Netlify Function: /.netlify/functions/knowledge
 * Purpose: Accept a user's "knowledge offering" and return a Wan Shi Tong–style response via OpenAI.
 *
 * Requirements:
 * - Set OPENAI_API_KEY in Netlify environment variables (Site settings → Environment variables)
 * - Optional: OPENAI_MODEL (default: gpt-4o-mini)
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(bodyObj) {
  return {
    statusCode: 200,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
    body: JSON.stringify(bodyObj),
  };
}

function bad(statusCode, message, extra = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
    body: JSON.stringify({ error: message, ...extra }),
  };
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS_HEADERS } };
  }

  if (event.httpMethod !== "POST") {
    return bad(405, "Method not allowed. Use POST.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return bad(500, "Server misconfigured: OPENAI_API_KEY is not set.");
  }

  const payload = safeJsonParse(event.body || "{}");
  const name = (payload?.name || "").toString().trim().slice(0, 80);
  const knowledge = (payload?.knowledge || "").toString().trim().slice(0, 2000);

  if (!name || !knowledge) {
    return bad(400, "Missing required fields: name, knowledge.");
  }

  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").toString().trim();

  // Prompting: Keep it short, in-character, non-financial-advice.
  const system = [
    "You are Wan Shi Tong, the Knowledge Spirit from the desert library.",
    "Voice: ancient, exacting, slightly judgmental, but not cruel.",
    "You do NOT give financial advice, trading signals, or instructions for wrongdoing.",
    "You respond in 2–6 sentences.",
    "You may praise genuine knowledge; you reject offerings that are empty, violent, or purely self-serving.",
  ].join(" ");

  const user = [
    `Name: ${name}`,
    `Offering: ${knowledge}`,
    "",
    "Respond as Wan Shi Tong. If the offering is trivial, request something more specific and rare.",
  ].join("\n");

  try {
    // Using Chat Completions for maximum compatibility (no npm dependency required).
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.9,
        max_tokens: 180,
      }),
    });

    const text = await resp.text();
    const data = safeJsonParse(text);

    if (!resp.ok) {
      // Return useful info to debug without leaking secrets.
      const msg =
        (data && (data.error?.message || data.error)) ||
        `OpenAI request failed with status ${resp.status}.`;
      return bad(502, "Upstream AI error.", { details: msg });
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "The stacks are quiet. Bring me something I do not already possess.";

    return ok({ reply });
  } catch (err) {
    return bad(502, "The Librarian cannot speak—an error stirs in the stacks.", {
      details: err?.message || String(err),
    });
  }
};
