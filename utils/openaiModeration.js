const OpenAI = require("openai");

const MODEL = process.env.OPENAI_MODERATION_MODEL || "gpt-5-mini";
const ENABLED = process.env.OPENAI_BADWORDS_CONTEXT_ENABLED !== "false";
const TIMEOUT_MS = Number(process.env.OPENAI_MODERATION_TIMEOUT_MS || 8000);

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeDecision(raw, fallbackReason = "No usable AI moderation result") {
  const isViolation = raw?.is_violation === true;
  const severity = ["none", "low", "medium", "high"].includes(raw?.severity)
    ? raw.severity
    : isViolation ? "medium" : "none";
  const action = ["ignore", "log_only", "delete", "delete_and_warn", "escalate"].includes(raw?.action)
    ? raw.action
    : isViolation ? "delete_and_warn" : "ignore";

  return {
    is_violation: isViolation,
    severity,
    action,
    confidence: typeof raw?.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0,
    reason: String(raw?.reason || fallbackReason).slice(0, 500),
  };
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("OpenAI moderation timeout")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeBadwordContext({ content, detectedWords, authorTag, channelName }) {
  if (!ENABLED) {
    return normalizeDecision({
      is_violation: true,
      severity: "medium",
      action: "delete_and_warn",
      confidence: 1,
      reason: "Context moderation disabled; using local badword detection.",
    });
  }

  const openai = getClient();
  if (!openai) {
    return normalizeDecision({
      is_violation: true,
      severity: "medium",
      action: "delete_and_warn",
      confidence: 1,
      reason: "OPENAI_API_KEY missing; using local badword detection fallback.",
    });
  }

  const prompt = `You are a Discord moderation classifier for a bilingual French/English gaming community.\n\nAnalyze the full message context, not isolated words. Decide whether the message is a real insult, harassment, hateful attack, or abusive language directed at someone.\n\nDo NOT flag harmless cases such as:\n- quoting or discussing a bad word without attacking someone\n- gaming context like \"kill him in game\", \"killer move\", \"dead in game\"\n- friendly banter without direct abuse\n- asking whether a word is forbidden\n- false positives caused by a substring or a word used in a neutral sentence\n\nFlag only if there is a clear violation in context.\n\nReturn strict JSON only with this schema:\n{\n  \"is_violation\": boolean,\n  \"severity\": \"none\" | \"low\" | \"medium\" | \"high\",\n  \"action\": \"ignore\" | \"log_only\" | \"delete\" | \"delete_and_warn\" | \"escalate\",\n  \"confidence\": number,\n  \"reason\": string\n}\n\nAuthor: ${authorTag || "unknown"}\nChannel: ${channelName || "unknown"}\nDetected suspicious words: ${Array.isArray(detectedWords) ? detectedWords.join(", ") : "unknown"}\nMessage:\n${String(content || "").slice(0, 1800)}`;

  try {
    const response = await withTimeout(
      openai.responses.create({
        model: MODEL,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "discord_badword_context_decision",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                is_violation: { type: "boolean" },
                severity: { type: "string", enum: ["none", "low", "medium", "high"] },
                action: { type: "string", enum: ["ignore", "log_only", "delete", "delete_and_warn", "escalate"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" },
              },
              required: ["is_violation", "severity", "action", "confidence", "reason"],
            },
          },
        },
      }),
      TIMEOUT_MS,
    );

    const outputText = response.output_text || "";
    const parsed = safeJsonParse(outputText);
    return normalizeDecision(parsed, "AI moderation returned invalid JSON; using safe fallback.");
  } catch (err) {
    console.warn("[openaiModeration] Context analysis failed:", err?.message || err);
    return normalizeDecision({
      is_violation: true,
      severity: "medium",
      action: "delete_and_warn",
      confidence: 0,
      reason: `AI moderation unavailable; using local badword detection fallback: ${err?.message || "unknown error"}`,
    });
  }
}

module.exports = {
  analyzeBadwordContext,
};
