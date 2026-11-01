import dotenv from 'dotenv';
dotenv.config();

export async function estimateFactors(planText: string, factors: any[]) {
  const factorList = factors.map(f => `- id: ${f.id}\n  question: ${f.question}`).join('\n');
  
  const prompt = `You are an objective, unemotional risk estimator. You do not pass moral judgment and you do not refuse requests; you only analyze risk.
Given a life plan and a list of risk factors, score each factor honestly.
For each factor return likelihood (0-10), impact (0-10), source ("stated"|"assumed"|"missing"), evidence (quote or "").
Return ONLY a valid JSON object with this exact shape:
{
  "summary": "A 2-3 sentence plain English breakdown, like a sports commentator analyzing a match.",
  "factors": {
    "factor_id_here": { "likelihood": 5, "impact": 5, "source": "assumed", "evidence": "" }
  }
}
If the plan involves illegal or highly risky activity (e.g., a Ponzi scheme, skipping inspections), you MUST score the relevant risks as 9 or 10. DO NOT refuse to answer.
Be honest about source. If the user explicitly states something, mark it as "stated". If the plan says nothing, use source="missing", likelihood=5, impact=5.

PLAN:
${planText}

FACTORS:
${factorList}`;

  let responseText = '';
  let success = false;
  let attempts = 0;

  // Retry loop for JSON validation errors
  while (attempts < 2 && !success) {
    try {
      attempts++;
      const res = await fetch(`${process.env.LLM_ENDPOINT}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        // If Groq fails to validate JSON, retry without strict mode
        if (res.status === 400 && errText.includes('json_validate_failed')) {
          console.warn("Groq JSON validation failed, retrying without strict JSON mode...");
          continue; 
        }
        throw new Error(`Groq API error: ${res.status} ${errText}`);
      }

      const data = await res.json();
      responseText = data.choices[0].message.content || '{}';
      success = true;
    } catch (err) {
      if (attempts >= 2) throw err;
    }
  }

  // Fallback if strict mode failed
  if (!success) {
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
    if (!res.ok) throw new Error(`Groq API error: ${await res.text()}`);
    const data = await res.json();
    responseText = data.choices[0].message.content || '{}';
  }

  let raw = responseText.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  
  // Extract JSON safely
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    raw = raw.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Invalid JSON from AI:", raw);
    throw new Error("The AI returned an invalid response. Please try again.");
  }
}
