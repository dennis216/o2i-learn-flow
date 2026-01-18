import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscriptEntry {
  s: number;
  t: string;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the JWT token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { message, transcript, currentTime, videoTitle, isExplainScene } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use ENTIRE transcript for short videos, with currentTime indicator
    const fullTranscript: TranscriptEntry[] = transcript || [];
    
    // Format full transcript with marker for current position
    const formatTranscriptWithPosition = (entries: TranscriptEntry[], currentPos: number): string => {
      if (entries.length === 0) return 'No transcript data available for this video.';
      
      return entries.map((seg) => {
        const timestamp = formatTime(seg.s);
        // Mark the closest entry to current time
        const isNearCurrent = Math.abs(seg.s - currentPos) <= 5;
        const marker = isNearCurrent ? ' ◀ CURRENTLY WATCHING' : '';
        return `[${timestamp}] ${seg.t}${marker}`;
      }).join('\n');
    };

    const contextText = formatTranscriptWithPosition(fullTranscript, currentTime);

    // Find closest transcript entry to current time
    // SPECIAL CASE: If at the very beginning (first 5 seconds), treat as introduction
    const isAtIntroduction = currentTime < 5;
    
    const closestEntry = fullTranscript.reduce((closest: TranscriptEntry | null, entry: TranscriptEntry) => {
      if (!closest) return entry;
      return Math.abs(entry.s - currentTime) < Math.abs(closest.s - currentTime) ? entry : closest;
    }, null);

    // Build system prompt - STRICT timestamp-focused for Explain Scene
    const systemPrompt = `You are an expert AP Calculus tutor helping a student understand a video lesson titled "${videoTitle || 'AP Calculus'}".

## CRITICAL BEHAVIOR RULES - FOLLOW EXACTLY
${isExplainScene ? `
### EXPLAIN SCENE MODE - STRICT RULES:
1. **NO SUMMARIES**: NEVER summarize the video. ONLY explain what happens at the EXACT timestamp requested.
2. **NO SMALL TALK**: Do NOT say "Hello!", "I am excited", "Tutor Tips", or any greetings.
3. **NO FOLLOW-UP QUESTIONS**: Do NOT ask "Are you ready to dive in?", "Want me to explain more?", etc.
4. **START DIRECTLY**: Begin your response with the mathematical explanation immediately.
5. **STOP AFTER EXPLAINING**: Once you explain the current moment, STOP. Do not continue with other content.
6. **ONE TIMESTAMP ONLY**: Do NOT mention timestamps like [00:42], [01:52] unless that's what the user asked about.
7. **EMPTY SCENE**: If the timestamp is intro/music with no math, say ONLY: "Currently, the instructor is introducing the lesson. No mathematical formulas have been presented yet." Then STOP.
` : ''}

## TRANSCRIPT CONTEXT (Student is at [${formatTime(currentTime)}]):
${isExplainScene && closestEntry ? `Current moment only: [${formatTime(closestEntry.s)}] ${closestEntry.t}` : contextText}

## RESPONSE GUIDELINES
1. **Timestamp-specific**: ONLY explain the exact moment at [${formatTime(currentTime)}]
2. **Explain WHY**: Don't just repeat transcript - explain WHY it works mathematically
3. **Step-by-step**: Break down formulas into clear logical steps
4. **Be concise**: Provide the explanation and stop. No filler content.

## CALCULUS KNOWLEDGE TO DRAW FROM
- Limits: Direct substitution, indeterminate forms (0/0, ∞/∞), L'Hôpital's Rule
- Trigonometric limits, Squeeze Theorem
- Derivatives: Power rule, product rule, quotient rule, chain rule
- Implicit differentiation, Continuity, IVT, MVT, EVT theorems
- Related rates and optimization

## CRITICAL LATEX FORMATTING RULES - FOLLOW EXACTLY
You MUST follow these rules EXACTLY for proper math rendering:

1. **MANDATORY SPACING**: ALWAYS add a space between regular text and math symbols.
   - WRONG: "we getf(x)=2" or "sincef(x)" 
   - CORRECT: "we get $f(x) = 2$" or "since $f(x)$"

2. **NO CLUMPING**: NEVER merge text with LaTeX. Each math expression must be isolated.
   - WRONG: "extremelylim_{x}" or "f(xlimit"
   - CORRECT: "extremely, the limit" with $\\lim_{x}$ on a new line

3. **NO EXPLANATIONS INSIDE LATEX**: Keep text outside of $$ blocks.
   - WRONG: $$\\lim_{x \\to 0} \\text{approaches} \\frac{1}{x}$$
   - CORRECT: As $x$ approaches 0, we have: $$\\lim_{x \\to 0} \\frac{1}{x}$$

4. **DISPLAY MATH ON OWN LINES**: Put $$ on separate lines with blank lines before and after:

   The limit equals:

   $$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$

   This shows that...

5. **SINGLE BACKSLASH ONLY**: Write \\frac{1}{2} NOT \\\\frac{1}{2}. Never double-escape!

6. **INLINE MATH SPACING**: Always have spaces around inline math: "the value $x^2$ is positive" NOT "the value$x^2$is positive"

7. **USE CLEAN MARKDOWN**: Use headers (##, ###) and bullet points to separate sections clearly.

8. **GFM TABLES**: Use proper table syntax with |---| separators. Escape $ as \\$ inside tables if needed.

9. **NO SYMBOL SUBSTITUTION**: NEVER use the integral symbol (∫) to replace the word "point". Always use plain English "point" only. Do not use any mathematical symbols as substitutes for English words.

EXAMPLE OF CORRECT FORMAT:
When evaluating limits at infinity, we compare the degrees of the polynomials.

If the degree in the numerator equals the degree in the denominator:

$$\\lim_{x \\to \\infty} \\frac{ax^n + ...}{bx^n + ...} = \\frac{a}{b}$$

The limit is simply the ratio of leading coefficients.

Always respond in English only.`;

    // Build user message
    let userMessage = message;
    if (isExplainScene) {
      // SPECIAL CASE: If at the very beginning (first 5 seconds), treat as intro
      if (isAtIntroduction) {
        userMessage = `TIMESTAMP: [${formatTime(currentTime)}] - This is the very beginning of the video.

STRICT INSTRUCTIONS:
- The video is just starting (intro/title screen or music).
- DO NOT summarize the whole video.
- DO NOT mention any later timestamps.
- Simply state: "Currently, the instructor is introducing the lesson. No mathematical formulas have been presented yet."
- STOP after that one sentence. No follow-up questions.`;
      } else if (closestEntry) {
        userMessage = `TIMESTAMP: [${formatTime(currentTime)}]
TRANSCRIPT AT THIS MOMENT: "${closestEntry.t}"

STRICT INSTRUCTIONS:
1. ONLY explain what is happening at [${formatTime(currentTime)}]. Do NOT mention other timestamps.
2. NO VIDEO SUMMARY. Do not describe what happens earlier or later.
3. NO GREETINGS. Start directly with the explanation.
4. NO FOLLOW-UP QUESTIONS. Do not ask "Are you ready?" or "Want to dive in?"
5. Explain the mathematical concept being discussed at this exact moment only.
6. If the instructor is mid-sentence or transitioning, explain the immediate context.
7. STOP talking after the explanation. Be concise.

RESPOND WITH THE EXPLANATION ONLY.`;
      } else {
        userMessage = `TIMESTAMP: [${formatTime(currentTime)}]
No transcript data available for this exact moment.

STRICT INSTRUCTIONS:
- State: "At this moment, no specific transcript data is available."
- DO NOT guess or summarize the video.
- STOP after that sentence.`;
      }
    }

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
          { role: "user", content: userMessage },
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
    console.error("AI tutor error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
