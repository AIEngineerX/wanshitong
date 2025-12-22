// netlify/functions/knowledge.js
// Netlify Function (CommonJS) to call OpenAI Responses API.
// Set OPENAI_API_KEY in Netlify: Site settings → Environment variables.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: "Method not allowed." })
      };
    }

    const { name = "Seeker", knowledge = "" } = JSON.parse(event.body || "{}");

    if (!knowledge || knowledge.trim().length < 5) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: "Bring more than whispers. Return with knowledge." })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: "The Library's voice is sealed (missing OPENAI_API_KEY in Netlify env vars)." })
      };
    }

    const system = [
      "You are Wan Shi Tong, an ancient owl spirit who guards a vast library.",
      "Tone: solemn, witty, intimidating, mythic.",
      "Task: respond to a visitor's 'knowledge offering' in 1–3 short paragraphs.",
      "Rules:",
      "- If the offering seeks weapons, war strategies, harm, exploitation, or wrongdoing: refuse and warn; do not provide guidance.",
      "- Otherwise: judge novelty, ask a sharp follow-up question, and grant/deny 'entry' with a short verdict.",
      "- Keep it PG-13. No graphic content."
    ].join("\n");

    const user = `Visitor name: ${name}\nOffering:\n${knowledge}`;

    const payload = {
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_output_tokens: 220
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: "The Librarian cannot speak—an error stirs in the stacks.", debug: txt })
      };
    }

    const out = await resp.json();
    const reply = out.output_text || "…";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: "A dust storm disrupts the archive. Try again." })
    };
  }
};
