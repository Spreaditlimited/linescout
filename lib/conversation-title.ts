type TitleInput = {
  userText: string;
  aiText?: string | null;
  routeType?: string | null;
};

function cleanTitle(value: string) {
  let t = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["“”]/g, "")
    .trim();
  if (!t) return "";
  if (t.length > 80) t = t.slice(0, 80).trim();
  return t;
}

export async function suggestConversationTitle(input: TitleInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;

  const userText = String(input.userText || "").trim();
  const aiText = String(input.aiText || "").trim();
  if (!userText && !aiText) return null;

  const prompt = [
    "Create a concise, specific chat title based on the conversation.",
    "Rules:",
    "- 3 to 6 words, max 60 characters.",
    "- No quotes, no punctuation at the end.",
    "- Make it about the topic, not the platform.",
    "- Return JSON: {\"title\": \"...\"}",
    "",
    `User: ${userText}`,
    aiText ? `Assistant: ${aiText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      input: prompt,
      temperature: 0.4,
      max_output_tokens: 200,
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const text = typeof data?.output_text === "string" ? data.output_text : null;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const title = cleanTitle(String(parsed?.title || ""));
    return title || null;
  } catch {
    return null;
  }
}

