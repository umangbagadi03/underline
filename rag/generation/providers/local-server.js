// Local engine provider: any server on this computer that speaks the
// OpenAI-style chat API (/v1/chat/completions).
// Works with Ollama (port 11434) today and llama.cpp's llama-server (port 8080) later,
// so switching engines is just a different URL.

export const LOCAL_SERVERS = [
  { name: 'Ollama', url: 'http://localhost:11434' },
  { name: 'llama.cpp', url: 'http://localhost:8080' },
];

/** Ask a server which models it has. Returns a list of names, or null if it is not running. */
export async function listLocalModels(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/v1/models`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data.map((m) => m.id);
  } catch {
    return null;
  }
}

/** Read a streamed reply. The server sends lines like "data: {...}" and ends with "data: [DONE]". */
async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '').trim();
      if (!line.startsWith('data:') || !data || data === '[DONE]') continue;
      yield JSON.parse(data);
    }
  }
}

/** The request body. Thinking is turned off: it is slow and our answers must be short. */
function requestBody(model, messages) {
  return {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0,
    max_tokens: 300,
    reasoning_effort: 'none', // Ollama: turns thinking off ("think": false is ignored here)
    chat_template_kwargs: { enable_thinking: false }, // llama.cpp: turns thinking off
  };
}

/**
 * Send messages and stream the answer.
 * Returns { text, stats: { firstTokenMs, totalMs, tokens, tokensPerSec, promptTokens } }
 */
export async function askLocalServer(baseUrl, model, messages, onToken) {
  const started = performance.now();
  const body = JSON.stringify(requestBody(model, messages));
  const headers = { 'Content-Type': 'application/json' };
  const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers, body });
  if (!response.ok) throw new Error(`Local engine error ${response.status}: ${await response.text()}`);

  let text = '';
  let firstTokenMs = null;
  let usage = null;
  for await (const event of readEvents(response)) {
    const choice = event.choices && event.choices[0];
    const piece = choice && choice.delta ? choice.delta.content || '' : '';
    if (piece && firstTokenMs === null) firstTokenMs = performance.now() - started;
    text += piece;
    if (piece && onToken) onToken(piece);
    if (event.usage) usage = event.usage;
  }

  // Speed = tokens written / time spent writing (after the first word).
  const totalMs = performance.now() - started;
  const tokens = usage ? usage.completion_tokens : null;
  const writingSeconds = firstTokenMs === null ? null : (totalMs - firstTokenMs) / 1000;
  const stats = {
    firstTokenMs,
    totalMs,
    tokens,
    tokensPerSec: tokens && writingSeconds ? tokens / writingSeconds : null,
    promptTokens: usage ? usage.prompt_tokens : null,
  };
  return { text, stats };
}
