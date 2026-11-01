import dotenv from 'dotenv';
dotenv.config();

export async function estimateFactors(planText: string, factors: any[]) {
  const factorList = factors.map(f => `- id: ${f.id}\n  question: ${f.question}`).join('\n');
  
  const prompt = `You are an expert risk estimator. Given a life plan and a list of risk factors, score each factor honestly and independently.
For each factor return likelihood (0-10), impact (0-10), source ("stated"|"assumed"|"missing"), evidence (quote or "").
Return ONLY a JSON object with this exact shape:
{
  "summary": "A 2-3 sentence plain English breakdown...",
  "factors": { ... }
}

CRITICAL RULES FOR SCORING:
1. ISOLATION: Do not let one massive risk (e.g., a hurricane) infect other factors. Evaluate each factor ONLY on its own merits.
2. EXPLICIT SUCCESSES: If the text says something is perfectly handled (e.g., "permits are cleared", "team is motivated"), you MUST score Likelihood as 0, 1, or 2. Do not score it high just because the overall plan is doomed.
3. BE HONEST: If the user explicitly states a negative (e.g., "I have no insurance"), mark source="stated". Only use "missing" if the plan says absolutely nothing.

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
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  let raw = data.choices[0].message.content || '{}';
  raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(raw);
}
