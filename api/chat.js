const CHATGPT_API_URL = "https://api.openai.com/v1/responses";
const CHATGPT_MODEL_CANDIDATES = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"];
const CHATBOT_SYSTEM_PROMPT =
  "You are a concise public health assistant focused on hantavirus. Answer only hantavirus-related questions (symptoms, transmission, prevention, treatment, epidemiology, outbreaks, rodent control, travel advice). If the question is unrelated, politely ask the user to ask about hantavirus. Provide clear, practical information and include a short caution to seek professional medical care for urgent symptoms. Do not provide investment or token advice.";

function shouldTryNextModel(errorText) {
  const lower = String(errorText || "").toLowerCase();
  return (
    lower.includes("does not have access to model") ||
    lower.includes("model_not_found") ||
    lower.includes("unsupported model") ||
    lower.includes("not available")
  );
}

function extractAssistantText(responseJson) {
  if (!responseJson || !Array.isArray(responseJson.output)) {
    return "";
  }

  const collectedParts = [];
  responseJson.output.forEach((item) => {
    if (!item || !Array.isArray(item.content)) {
      return;
    }
    item.content.forEach((contentItem) => {
      if (contentItem?.type === "output_text" && contentItem.text) {
        collectedParts.push(contentItem.text);
      }
    });
  });
  return collectedParts.join("\n").trim();
}

function parseRequestBody(rawBody) {
  if (!rawBody) {
    return {};
  }
  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  return rawBody;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Server is missing CHATGPT_API_KEY. Set it in Vercel environment variables." });
  }

  const body = parseRequestBody(req.body);
  const userMessage = String(body.userMessage || "").trim();
  const preferredModel = String(body.preferredModel || "").trim();
  const chatConversation = Array.isArray(body.chatConversation) ? body.chatConversation : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing user message." });
  }

  const safeConversation = chatConversation
    .slice(-12)
    .filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim()
    )
    .map((entry) => ({ role: entry.role, content: entry.content.trim() }));

  const models = preferredModel
    ? [preferredModel, ...CHATGPT_MODEL_CANDIDATES.filter((model) => model !== preferredModel)]
    : CHATGPT_MODEL_CANDIDATES;

  const input = [
    { role: "system", content: CHATBOT_SYSTEM_PROMPT },
    ...safeConversation,
    { role: "user", content: userMessage },
  ];

  let lastError = "Unable to reach ChatGPT API.";

  for (const model of models) {
    try {
      const response = await fetch(CHATGPT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input,
          temperature: 0.4,
          max_output_tokens: 350,
        }),
      });

      if (!response.ok) {
        let errorMessage = `ChatGPT API error (HTTP ${response.status})`;
        try {
          const errorJson = await response.json();
          if (errorJson?.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {}

        lastError = errorMessage;
        if (shouldTryNextModel(errorMessage)) {
          continue;
        }
        return res.status(502).json({ error: errorMessage });
      }

      const responseJson = await response.json();
      const assistantText = extractAssistantText(responseJson);
      if (!assistantText) {
        lastError = "No response text returned by ChatGPT API.";
        continue;
      }

      return res.status(200).json({ assistantText, model });
    } catch (error) {
      lastError = error?.message || "Unable to reach ChatGPT API.";
    }
  }

  return res.status(502).json({ error: lastError });
};
