"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  description: string;
  amountEth: string;
  sellerAddress: string;
  onApplySummary: (summary: string) => void;
  onApplyMilestones?: (milestones: string[]) => void;
};

type DealAnalysis = {
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
  amountAssessment: string;
  suggestedMilestones: string[];
  dealSummary: string;
};

// Scam keywords and patterns
const RED_FLAGS = [
  "urgent", "asap", "urgently", "immediate", "act now", "limited time",
  "guaranteed", "100% guaranteed", "no risk", "risk free",
  "send money first", "pay upfront", "advance fee",
  "double your", "triple your", "10x", "100x",
  "crypto mining", "investment opportunity", "get rich quick",
  "lottery", "winner", "won", "prize", "congratulations you've won",
  "inheritance", "prince", "nigerian",
  "remote access", "screen share", "teamviewer", "anydesk",
  "private key", "seed phrase", "recovery phrase", "secret key",
  "verify your wallet", "validate your account", "suspicious activity"
];

// Service keywords for milestone suggestions
const SERVICE_TYPES: Record<string, string[]> = {
  design: ["design", "logo", "branding", "ui/ux", "illustration", "graphic"],
  dev: ["website", "app", "development", "smart contract", "coding", "programming", "software"],
  writing: ["content", "article", "blog", "copywriting", "technical writing"],
  marketing: ["marketing", "seo", "social media", "ads", "campaign"],
  consulting: ["consulting", "advisory", "strategy", "audit", "review"]
};

function analyzeDealClientSide(
  description: string,
  amountEth: string,
  _sellerAddress: string
): DealAnalysis {
  const amount = parseFloat(amountEth) || 0;
  const lowerDesc = description.toLowerCase();
  
  // Risk analysis
  const riskReasons: string[] = [];
  let riskScore = 0;

  // Check for red flags
  RED_FLAGS.forEach(flag => {
    if (lowerDesc.includes(flag)) {
      riskScore += 2;
      riskReasons.push(`Contains suspicious phrase: "${flag}"`);
    }
  });

  // Check amount reasonableness
  if (amount > 10 && !description.includes("month") && !description.includes("ongoing")) {
    riskScore += 2;
    riskReasons.push("High amount for a single transaction without clear ongoing work");
  }
  if (amount > 50) {
    riskScore += 3;
    riskReasons.push("Very high amount - consider splitting into milestones");
  }

  // Check description quality
  if (description.length < 30) {
    riskScore += 1;
    riskReasons.push("Very brief description - unclear deliverables");
  }
  if (!description.includes("deliver") && !description.includes("provide") && !description.includes("create")) {
    riskScore += 1;
    riskReasons.push("No clear deliverables specified");
  }

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" = "low";
  if (riskScore >= 4) riskLevel = "high";
  else if (riskScore >= 2) riskLevel = "medium";

  // Amount assessment
  let amountAssessment = "";
  if (amount < 0.1) {
    amountAssessment = `Amount of ${amountEth} ETH is quite small. Good for quick tasks or testing a new seller relationship.`;
  } else if (amount < 1) {
    amountAssessment = `Amount of ${amountEth} ETH is moderate. Ensure clear deliverables and consider splitting into milestones.`;
  } else if (amount < 5) {
    amountAssessment = `Amount of ${amountEth} ETH is substantial. Strongly recommend milestone-based payments and detailed contract terms.`;
  } else {
    amountAssessment = `Amount of ${amountEth} ETH is significant. Essential to use milestone payments, verify seller reputation, and document all terms.`;
  }

  // Generate milestones based on service type and amount
  const milestones: string[] = [];
  
  // Detect service type
  let serviceType = "general";
  for (const [type, keywords] of Object.entries(SERVICE_TYPES)) {
    if (keywords.some(k => lowerDesc.includes(k))) {
      serviceType = type;
      break;
    }
  }

  // Create appropriate milestones
  if (serviceType === "design") {
    milestones.push("Initial concept sketches delivered");
    milestones.push("First draft completed and shared for feedback");
    milestones.push("Revisions based on feedback completed");
    milestones.push("Final files delivered in all requested formats");
  } else if (serviceType === "dev") {
    milestones.push("Project requirements finalized and architecture approved");
    milestones.push("Initial prototype or MVP delivered");
    milestones.push("Core features implemented and tested");
    milestones.push("Final delivery with documentation and deployment");
  } else if (serviceType === "writing") {
    milestones.push("Outline or content plan approved");
    milestones.push("First draft submitted for review");
    milestones.push("Revisions completed based on feedback");
    milestones.push("Final polished content delivered");
  } else {
    milestones.push("Initial planning and requirements agreed");
    milestones.push("First milestone deliverable completed");
    milestones.push("Quality review and feedback addressed");
    milestones.push("Final delivery and acceptance");
  }

  // Add payment split recommendations based on amount
  if (amount > 0.5) {
    const deposit = (amount * 0.25).toFixed(4);
    const milestone1 = (amount * 0.25).toFixed(4);
    const milestone2 = (amount * 0.25).toFixed(4);
    const final = (amount * 0.25).toFixed(4);
    
    milestones.push(`Payment Schedule: ${deposit} ETH deposit, ${milestone1} ETH at 33%, ${milestone2} ETH at 66%, ${final} ETH final`);
  }

  // Generate summary
  const serviceName = serviceType === "general" ? "service" : serviceType;
  const riskText = riskLevel === "low" ? "appears straightforward" : 
                   riskLevel === "medium" ? "requires careful review" : "contains multiple concerns";
  
  const dealSummary = `This ${serviceName} engagement ${riskText}. The scope involves ${description.slice(0, 80)}${description.length > 80 ? "..." : ""}. Total budget: ${amountEth} ETH. ${riskLevel === "high" ? "Recommend additional verification steps before proceeding." : "Proceed with standard escrow protections."}`;

  return {
    riskLevel,
    riskReasons: riskReasons.slice(0, 4),
    amountAssessment,
    suggestedMilestones: milestones,
    dealSummary
  };
}

function riskBadge(level: DealAnalysis["riskLevel"]) {
  if (level === "high") return <Badge className="bg-red-600 text-white">High risk</Badge>;
  if (level === "medium") return <Badge className="bg-yellow-500 text-black">Medium risk</Badge>;
  return <Badge className="bg-green-600 text-white">Low risk</Badge>;
}

export default function DealAnalyzer({ description, amountEth, sellerAddress, onApplySummary, onApplyMilestones }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DealAnalysis | null>(null);
  const [usingAI, setUsingAI] = useState(false);

  const canAnalyze = useMemo(() => {
    return description.trim().length >= 10 && Number(amountEth) > 0 && sellerAddress.trim().length > 0;
  }, [description, amountEth, sellerAddress]);

  const run = async () => {
    if (!canAnalyze) {
      toast.error("Fill description, amount, and seller first.");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      // Try AI analysis first
      const res = await fetch("/api/analyze-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amountEth, sellerAddress }),
      });

      if (res.ok) {
        const json = await res.json() as DealAnalysis;
        setResult(json);
        setUsingAI(true);
      } else {
        // Fallback to client-side analysis
        const clientAnalysis = analyzeDealClientSide(description, amountEth, sellerAddress);
        setResult(clientAnalysis);
        setUsingAI(false);
      }
    } catch {
      // Fallback to client-side analysis on error
      const clientAnalysis = analyzeDealClientSide(description, amountEth, sellerAddress);
      setResult(clientAnalysis);
      setUsingAI(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Deal Analyzer
          </span>
          <Button size="sm" onClick={() => void run()} disabled={isLoading || !canAnalyze}>
            {isLoading ? "Analyzing..." : "Analyze Deal"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Checks for common scam patterns, assesses the amount, suggests milestones, and drafts a professional summary.
          Uses local Ollama Llama3.1-8B model for enhanced analysis.
        </p>

        {!result ? (
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            Fill in description + amount + seller, then click Analyze.
            Requires Ollama running locally with 'llama3.1:8b' model installed.
          </div>
        ) : (
          <div className="space-y-3">
            {!usingAI && (
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                Using offline analysis (Ollama not available). Start Ollama with: ollama run llama3.1:8b
              </div>
            )}
            <div className="flex items-center gap-2">
              {riskBadge(result.riskLevel)}
              <span className="text-xs text-muted-foreground">Based on your description and amount.</span>
            </div>

            {result.riskReasons?.length ? (
              <div className="rounded-md border p-3">
                <div className="mb-1 text-xs font-semibold">Risk reasons</div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {result.riskReasons.slice(0, 6).map((r, i) => (
                    <li key={`${i}-${r}`}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-md border p-3">
              <div className="mb-1 text-xs font-semibold">Amount assessment</div>
              <p className="text-xs text-muted-foreground">{result.amountAssessment}</p>
            </div>

            {result.suggestedMilestones?.length ? (
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                  Suggested milestones
                  {onApplyMilestones ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onApplyMilestones(result.suggestedMilestones)}
                    >
                      Use milestones
                    </Button>
                  ) : null}
                </div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {result.suggestedMilestones.slice(0, 8).map((m, i) => (
                    <li key={`${i}-${m}`}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                Deal summary
                <Button size="sm" variant="secondary" onClick={() => onApplySummary(result.dealSummary)}>
                  Apply to description
                </Button>
              </div>
              <blockquote className="border-l-2 pl-3 text-xs text-muted-foreground">{result.dealSummary}</blockquote>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

