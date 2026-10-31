import dotenv from 'dotenv';
dotenv.config();

export async function estimateFactors(planText: string, factors: any[]) {
  const factorList = factors.map(f => `- id: ${f.id}\n  question: ${f.question}`).join('\n');
  const prompt = `You are a risk estimator. Given a life plan and a list of risk factors, score each factor honestly.
For each factor return likelihood (0-10), impact (0-10), source ("stated"|"assumed"|"missing"), evidence (quote or "").
Return ONLY a JSON object keyed by factor id. Be honest about source. If plan says nothing, use source="missing", likelihood=5, impact=5.

PLAN:
${planText}

FACTORS:
${factorList}`;

  const res = await fetch(`${process.env.LLM_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LLM_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  let raw = data.choices[0].message.content || '{}';
  raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(raw);
}