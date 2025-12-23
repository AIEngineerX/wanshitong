export async function handler(event) {
  // CORS / preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY in environment variables." }),
      };
    }

    const { name, knowledge } = JSON.parse(event.body || "{}");

    const userName = (name || "").toString().slice(0, 80);
    const offering = (knowledge || "").toString().slice(0, 1200);

    const system = [
      "You are Wan Shi Tong, the Knowledge Spirit.",
      "Respond in-character: concise, wise, slightly stern, never vulgar.",
      "If the user asks for war/violence tactics, refuse and warn them.",
      "Keep replies under 70 words.",
    ].join(" ");

    const prompt = `Visitor: ${userName || "Anonymous"}\nOffering: ${offering || "(no offering)"}\n\nRespond as Wan Shi Tong.`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!r.ok) {
      return {
        statusCode: r.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "OpenAI request failed",
          status: r.status,
          details: data || raw,
        }),
      };
    }

    const reply =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      "The Library is silent.";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || "Unknown error" }),
    };
  }
}
