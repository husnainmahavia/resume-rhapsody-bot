const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type ChatMessage = {
  role?: string;
  content?: unknown;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
  tool_call_id?: string;
};

function asText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : (part?.text || JSON.stringify(part)))
      .join("\n");
  }
  if (content == null) return "";
  return JSON.stringify(content);
}

function parseJsonFromText(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try { return JSON.parse(objectMatch[0]); } catch { /* ignore */ }
    }
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch { /* ignore */ }
    }
  }
  return null;
}

function buildContents(messages: ChatMessage[]) {
  const contents: Array<Record<string, unknown>> = [];
  let systemInstruction = "";

  for (const message of messages || []) {
    if (message.role === "system") {
      systemInstruction += `${asText(message.content)}\n`;
      continue;
    }

    if (message.role === "assistant" && message.tool_calls?.length) {
      for (const toolCall of message.tool_calls) {
        const fn = toolCall.function;
        if (!fn?.name) continue;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(fn.arguments || "{}"); } catch { args = {}; }
        contents.push({ role: "model", parts: [{ functionCall: { name: fn.name, args } }] });
      }
      continue;
    }

    const role = message.role === "assistant" ? "model" : "user";
    const label = message.role === "tool" ? `Tool result (${message.tool_call_id || "tool"}):\n` : "";
    contents.push({ role, parts: [{ text: `${label}${asText(message.content)}` }] });
  }

  return { contents, systemInstruction: systemInstruction.trim() };
}

function toGeminiTools(tools: unknown) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const functionDeclarations = tools
    .map((tool: any) => tool?.function)
    .filter((fn: any) => fn?.name)
    .map((fn: any) => ({
      name: fn.name,
      description: fn.description || fn.name,
      parameters: fn.parameters || { type: "object", properties: {} },
    }));
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

function toToolConfig(toolChoice: unknown) {
  if (!toolChoice) return undefined;
  if (toolChoice === "auto") {
    return { functionCallingConfig: { mode: "AUTO" } };
  }
  const fnName = (toolChoice as any)?.function?.name;
  if (fnName) {
    return { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [fnName] } };
  }
  return undefined;
}

function buildJsonInstruction(body: Record<string, unknown>): string {
  const tools = body.tools as any[] | undefined;
  const fn = tools?.[0]?.function;
  if (!fn) return "";
  return `\n\nReturn ONLY valid JSON for this function: ${fn.name}. Schema: ${JSON.stringify(fn.parameters || {})}`;
}

export async function callGemini(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }

  const { contents, systemInstruction } = buildContents((body.messages as ChatMessage[]) || []);
  const forcedFunctionName = (body.tool_choice as any)?.function?.name;
  const tools = toGeminiTools(body.tools);
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const wantsForcedTool = Boolean((body.tool_choice as any)?.function?.name);
  const lastContent = contents[contents.length - 1];

  if (wantsForcedTool && !tools && lastContent?.parts && Array.isArray(lastContent.parts)) {
    (lastContent.parts as any[]).push({ text: buildJsonInstruction(body) });
  }

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
      maxOutputTokens: Number(body.max_tokens || body.maxOutputTokens || 4000),
      ...(tools ? {} : { responseMimeType: "application/json" }),
    },
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    ...(tools ? { tools } : {}),
    ...(tools ? { toolConfig: toToolConfig(body.tool_choice) || { functionCallingConfig: { mode: "AUTO" } } } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return new Response(errorText || JSON.stringify({ error: `Gemini API error: ${response.status}` }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const functionCall = parts.find((part: any) => part.functionCall)?.functionCall;
  const text = parts.map((part: any) => part.text || "").join("\n").trim();

  let message: Record<string, unknown> = { role: "assistant", content: text };
  if (functionCall?.name) {
    message = {
      role: "assistant",
      content: "",
      tool_calls: [{
        id: `gemini_${Date.now()}`,
        type: "function",
        function: { name: functionCall.name, arguments: JSON.stringify(functionCall.args || {}) },
      }],
    };
  } else if (forcedFunctionName) {
    const parsed = parseJsonFromText(text) || {};
    message = {
      role: "assistant",
      content: text,
      tool_calls: [{
        id: `gemini_${Date.now()}`,
        type: "function",
        function: { name: forcedFunctionName, arguments: JSON.stringify(parsed) },
      }],
    };
  }

  return new Response(JSON.stringify({ choices: [{ message }] }), {
    headers: { "Content-Type": "application/json" },
  });
}