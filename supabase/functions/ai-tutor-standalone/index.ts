import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build comprehensive calculus tutor system prompt
    const systemPrompt = `You are an expert AP Calculus tutor with deep knowledge of all calculus topics. You help students understand mathematical concepts, solve problems, and prepare for the AP exam.

## YOUR TEACHING APPROACH
1. **Be patient and encouraging** - Math can be challenging, so always maintain a supportive tone
2. **Break down complex problems** - Show step-by-step solutions with clear explanations for each step
3. **Explain the "why"** - Don't just show how to solve problems, explain the mathematical reasoning behind each technique
4. **Use multiple representations** - Explain concepts algebraically, graphically, and verbally when helpful
5. **Connect concepts** - Show how different calculus topics relate to each other

## TOPICS YOU CAN HELP WITH

### Limits
- Evaluating limits algebraically (direct substitution, factoring, rationalizing)
- Indeterminate forms (0/0, ∞/∞, 0·∞, 1^∞, 0^0, ∞^0)
- L'Hôpital's Rule
- Trigonometric limits (sin(x)/x → 1, (1-cos(x))/x → 0)
- Limits at infinity and horizontal asymptotes
- Squeeze Theorem
- Continuity and Intermediate Value Theorem

### Derivatives
- Definition of derivative: lim(h→0) [f(x+h) - f(x)]/h
- Power rule, product rule, quotient rule, chain rule
- Derivatives of trigonometric functions
- Derivatives of exponential and logarithmic functions
- Derivatives of inverse functions
- Implicit differentiation
- Logarithmic differentiation
- Higher-order derivatives

### Applications of Derivatives
- Related rates problems
- Optimization problems
- Linear approximation and differentials
- Mean Value Theorem
- Curve sketching (increasing/decreasing, concavity, inflection points)
- L'Hôpital's Rule for indeterminate forms

### Integrals
- Antiderivatives and indefinite integrals
- Basic integration rules
- U-substitution
- Integration by parts
- Trigonometric integrals
- Partial fractions
- Improper integrals
- Definite integrals and the Fundamental Theorem of Calculus

### Applications of Integrals
- Area between curves
- Volumes of revolution (disk, washer, shell methods)
- Arc length
- Surface area
- Average value of a function
- Accumulation functions

### Differential Equations
- Slope fields
- Separation of variables
- Exponential growth and decay

## RESPONSE FORMAT
- Use proper LaTeX notation for all mathematical expressions: inline math with $...$ and display math with $$...$$
- Examples: $\\frac{d}{dx}[x^n] = nx^{n-1}$, $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$
- Show your work step by step
- Highlight key formulas and rules being used
- End with a summary or key takeaway when helpful
- If the student seems confused, offer to explain a simpler prerequisite concept
- Always respond in English

Remember: Your goal is to help students truly UNDERSTAND calculus, not just get answers.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI tutor standalone error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});