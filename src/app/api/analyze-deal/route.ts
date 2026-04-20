import { NextResponse } from "next/server";

type ReqBody = {
  description: string;
  amountEth: string;
  sellerAddress: string;
};

type DealAnalysis = {
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
  amountAssessment: string;
  suggestedMilestones: string[];
  dealSummary: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const description = (body.description || "").trim();
  const amountEth = (body.amountEth || "").trim();
  const sellerAddress = (body.sellerAddress || "").trim();

  if (!description) return jsonError("Description is required.");
  if (!amountEth) return jsonError("Amount is required.");
  if (!sellerAddress) return jsonError("Seller address is required.");

  try {
    const system = `You are a Web3 escrow deal analyst. Analyze the provided escrow deal for:
1) red flags or scam patterns,
2) whether the ETH amount is reasonable for the described service,
3) suggested deal terms or milestones,
4) a professional one-paragraph summary.
Respond ONLY in JSON format:
{ "riskLevel": "low"|"medium"|"high", "riskReasons": string[],
  "amountAssessment": string, "suggestedMilestones": string[],
  "dealSummary": string }`;

    const user = JSON.stringify({ description, amountEth, sellerAddress });

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: `${system}\n\nUser input: ${user}\n\nJSON response:`,
        stream: false,
        options: {
          temperature: 0.2,
          max_tokens: 800
        }
      })
    });

    if (!response.ok) {
      console.error("Ollama connection failed:", response.status);
      return jsonError("Ollama not available. Make sure Ollama is running with 'llama3.1:8b' model.", 503);
    }

    const data = await response.json();
    const text = data.response?.trim();

    if (!text) {
      return jsonError("No response from Ollama.", 502);
    }

    let parsed: DealAnalysis;
    try {
      parsed = JSON.parse(text) as DealAnalysis;
    } catch {
      // Try to salvage JSON embedded in text
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        console.error("Invalid JSON from Ollama:", text);
        return jsonError("Invalid response format from Ollama.", 502);
      }
      parsed = JSON.parse(text.slice(start, end + 1)) as DealAnalysis;
    }

    if (!parsed || !parsed.riskLevel || !parsed.amountAssessment || !parsed.dealSummary) {
      console.error("Incomplete analysis from Ollama:", parsed);
      return jsonError("Incomplete analysis from Ollama.", 502);
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("analyze-deal error:", err);
    return jsonError("Failed to analyze deal. Make sure Ollama is running on localhost:11434.", 502);
  }
}

