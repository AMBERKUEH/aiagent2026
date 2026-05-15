type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Backend request failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function apiUrl(path: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

export async function callGroqServer(
  messages: ChatMessage[],
  options: { model?: string; temperature?: number } = {}
): Promise<string> {
  const response = await fetch(apiUrl("/api/llm/groq"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? "llama-3.3-70b-versatile",
      temperature: options.temperature ?? 0.4,
      messages,
    }),
  });
  const data = await readJson<{ text?: string }>(response);
  return data.text ?? "";
}

export async function callGeminiServer(prompt: string, model = "gemini-flash-latest"): Promise<string> {
  const response = await fetch(apiUrl("/api/llm/gemini"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model }),
  });
  const data = await readJson<{ text?: string }>(response);
  return data.text ?? "";
}
