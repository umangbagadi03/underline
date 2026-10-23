// The instructions we send to the model.

export const SYSTEM_PROMPT = `You answer questions about a document. You get numbered sentences from the document, like "[S12] text".

Rules:
1. Use ONLY the given sentences. Do not use outside knowledge.
2. Answer in 1 to 3 short sentences.
3. End EVERY sentence with the ID of the sentence that proves it, like [S12]. You may cite two IDs, like [S12][S13].
4. Copy numbers, amounts and time periods exactly as the source writes them.
5. If the sentences do not answer the question, reply exactly: NOT FOUND

Example:
Sentences:
[S3] The deposit is equal to 2 months of rent.
[S4] The tenant must give 1 month's written notice.
Question: How much notice must the tenant give?
Answer: The tenant must give 1 month's written notice [S4].`;

/** Write the passages as numbered lines. A "---" line separates passages that are far apart. */
export function formatSentences(sentences) {
  const lines = [];
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const previous = sentences[i - 1];
    if (previous && sentence.num !== previous.num + 1) lines.push('---');
    lines.push(`[${sentence.id}] ${sentence.text}`);
  }
  return lines.join('\n');
}

/** Build the chat messages for one question. */
export function buildMessages(question, sentences) {
  const userText = `Sentences:\n${formatSentences(sentences)}\n\nQuestion: ${question}\nAnswer:`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userText },
  ];
}

/** Remove a <think>...</think> block if a model adds one anyway. */
export function stripThinking(text) {
  const noBlock = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  return noBlock.replace(/<think>[\s\S]*$/, '').trim();
}
