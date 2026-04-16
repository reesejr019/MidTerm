// ── AI ASSISTANT — Groq API ──
const GROQ_MODEL = 'llama-3.1-8b-instant';

const FORUM_CATEGORIES = [
  'General', 'Technology', 'Photography', 'Discussion', 'Creative',
  'Science', 'Gaming', 'Music', 'Sports', 'Travel', 'Food & Drink',
  'Art', 'Movies & TV', 'Books', 'Health', 'News', 'Humor'
];

function getGroqKey() {
  return localStorage.getItem('groq_api_key') || '';
}

function saveGroqKey(key) {
  localStorage.setItem('groq_api_key', key.trim());
}

/**
 * Ask Groq to pick the best forum category for a post.
 * @param {string} title
 * @param {string} body
 * @returns {Promise<{category: string, rationale: string}>}
 */
async function suggestPostCategory(title, body) {
  const key = getGroqKey();
  if (!key) throw new Error('NO_KEY');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 120,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            `You are a forum post categorizer for Echo, a community forum. ` +
            `Given a post title and optional body, pick the single best category from this list: ${FORUM_CATEGORIES.join(', ')}. ` +
            `Reply with ONLY a JSON object in this exact format (no markdown, no extra text): ` +
            `{"category":"<category>","rationale":"<one short sentence explaining why>"}`
        },
        {
          role: 'user',
          content: `Post title: "${title}"` + (body ? `\nPost body: "${body}"` : '')
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const raw  = data.choices?.[0]?.message?.content?.trim() ?? '';

  // Strip markdown code fences just in case
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned an unexpected response. Please try again.');
  }

  if (!FORUM_CATEGORIES.includes(parsed.category)) {
    throw new Error('Unexpected category returned by AI');
  }
  return parsed;
}
