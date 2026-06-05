// OpenRouter adapter (kept under the `gemini.ts` filename / `callGemini` export
// so the 9 existing edge functions don't need to change their imports).
//
// OpenRouter is OpenAI-compatible, so the request body is passed through
// nearly as-is. When a caller forces a tool/function call for JSON output we
// fall back to `response_format: json_object` + a prompt instruction and
// synthesize a `tool_calls` response shape, mirroring the old adapter so
// downstream parsing code keeps working.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";
const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

function parseJsonFromText(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* try substrings */ }
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* ignore */ } }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch { /* ignore */ } }
  return null;
}

function buildJsonInstruction(body: Record<string, unknown>): string {
  const tools = body.tools as any[] | undefined;
  const fn = tools?.[0]?.function;
  if (!fn) return "";
  return `\n\nReturn ONLY valid JSON matching this schema for "${fn.name}": ${JSON.stringify(fn.parameters || {})}. No prose, no markdown.`;
}

export async function callGemini(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), { status: 500 });
  }

  const forcedFunctionName = (body.tool_choice as any)?.function?.name;
  const messages = Array.isArray(body.messages) ? [...(body.messages as any[])] : [];

  if (forcedFunctionName && messages.length > 0) {
    const last = messages[messages.length - 1];
    const extra = buildJsonInstruction(body);
    if (last && typeof last.content === "string") {
      messages[messages.length - 1] = { ...last, content: last.content + extra };
    } else {
      messages.push({ role: "user", content: extra });
    }
  }

  const outBody: Record<string, unknown> = {
    model: (body.model as string) || DEFAULT_MODEL,
    messages,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
    max_tokens: Number(body.max_tokens || 4000),
  };

  if (forcedFunctionName) {
    outBody.response_format = { type: "json_object" };
  } else if (Array.isArray(body.tools) && body.tools.length > 0) {
    outBody.tools = body.tools;
    if (body.tool_choice) outBody.tool_choice = body.tool_choice;
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": "https://resume.visuosofts.com",
    "X-Title": "Resume Rhapsody Bot",
  };

  let response: Response | null = null;
  let lastErr = "";
  for (const model of [outBody.model as string, ...FALLBACK_MODELS.filter(m => m !== outBody.model)]) {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...outBody, model }),
    });
    if (response.ok) break;
    lastErr = await response.text().catch(() => "");
    // Fall through on model-not-found (404/400) AND upstream rate-limits (429),
    // since free OpenRouter models are frequently saturated.
    if (response.status !== 404 && response.status !== 400 && response.status !== 429) break;
    console.warn(`OpenRouter model ${model} failed (${response.status}): ${lastErr.slice(0, 200)}`);
  }

  if (!response || !response.ok) {
    return new Response(lastErr || JSON.stringify({ error: `OpenRouter error: ${response?.status}` }), {
      status: response?.status || 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message;
  const text = (typeof choice?.content === "string" ? choice.content : "") || "";

  let message: Record<string, unknown> = choice || { role: "assistant", content: text };

  // Synthesize tool_calls shape when caller forced a function call.
  if (forcedFunctionName && !choice?.tool_calls?.length) {
    const parsed = parseJsonFromText(text) || {};
    message = {
      role: "assistant",
      content: text,
      tool_calls: [{
        id: `or_${Date.now()}`,
        type: "function",
        function: { name: forcedFunctionName, arguments: JSON.stringify(parsed) },
      }],
    };
  }

  return new Response(JSON.stringify({ choices: [{ message }] }), {
    headers: { "Content-Type": "application/json" },
  });
}
