import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { name, knowledge } = JSON.parse(event.body || "{}");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `You are Wan Shi Tong, the ancient owl spirit who guards all knowledge.
Respond in-character. Be stern, wise, and slightly judgmental. Keep it to 1–3 short paragraphs.

Visitor name: ${name}
Knowledge offered: ${knowledge}`
    });

    const reply = response.output_text;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    console.error("Wan Shi Tong error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: "The Librarian cannot speak—an error stirs in the stacks."
      })
    };
  }
}
