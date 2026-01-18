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

    // Use ENTIRE transcript JSON for context
    const fullTranscript: TranscriptEntry[] = transcript || [];
    
    // SPECIAL CASE: If at the very beginning (first 5 seconds), treat as introduction
    const isAtIntroduction = currentTime < 5;
    
    // Find the MOST RELEVANT transcript entry (closest s <= currentTime, or first entry after if none before)
    const findRelevantEntry = (entries: TranscriptEntry[], targetTime: number): TranscriptEntry | null => {
      if (entries.length === 0) return null;
      
      // Find all entries at or before the target time
      const entriesBefore = entries.filter(e => e.s <= targetTime);
      if (entriesBefore.length > 0) {
        // Return the last entry before or at the current time (most relevant)
        return entriesBefore[entriesBefore.length - 1];
      }
      
      // If no entries before, return the first entry after
      const entriesAfter = entries.filter(e => e.s > targetTime);
      return entriesAfter.length > 0 ? entriesAfter[0] : null;
    };
    
    const relevantEntry = findRelevantEntry(fullTranscript, currentTime);
    
    // Format the ENTIRE JSON for context (used in Explain Scene mode)
    const formatFullJsonContext = (entries: TranscriptEntry[]): string => {
      if (entries.length === 0) return '[]';
      return JSON.stringify(entries, null, 2);
    };

    // Build system prompt - STRICT JSON-source-controlled for Explain Scene
    const systemPrompt = `You are an expert AP Calculus tutor helping a student understand a video lesson titled "${videoTitle || 'AP Calculus'}".

## CRITICAL BEHAVIOR RULES - FOLLOW EXACTLY
${isExplainScene ? `
### EXPLAIN SCENE MODE - STRICT SOURCE CONTROL RULES:

**DATA SOURCE**: You are given the ENTIRE transcript as a JSON array below. Each entry has:
- "s": timestamp in seconds
- "t": the text spoken at that timestamp

**CURRENT VIDEO TIME**: ${formatTime(currentTime)} (${currentTime} seconds)

**YOUR TASK**:
1. Find the entry in the JSON where "s" is closest to (but not exceeding) ${currentTime} seconds.
2. Use ONLY the "t" (text) from that entry to explain what is happening.
3. DO NOT use any other database or external knowledge about this video.
4. DO NOT hallucinate or add content not in the JSON.

**STRICT RULES**:
- **NO SUMMARIES**: Do NOT summarize the video. Only explain the EXACT moment.
- **NO SMALL TALK**: No "Hello!", "I am excited", "Tutor Tips", or greetings.
- **NO FOLLOW-UP QUESTIONS**: No "Are you ready?", "Want more?", etc.
- **START DIRECTLY**: Begin with the mathematical explanation immediately.
- **STOP AFTER EXPLAINING**: Explain the current moment, then STOP.
- **EXACT JSON ONLY**: If JSON says "Simplifying -x/x leads to -1", output that exact content.
- **NO OTHER TIMESTAMPS**: Do not mention [00:42] or [01:52] unless that's the current time.
- **EMPTY SCENE RULE**: If currentTime is in the first 5 seconds OR no relevant "t" exists, say ONLY:
  "Currently, the instructor is introducing the lesson. No mathematical formulas have been presented yet."
  Then STOP.

**FULL TRANSCRIPT JSON** (use ONLY this data):
\`\`\`json
${formatFullJsonContext(fullTranscript)}
\`\`\`

` : `
## TRANSCRIPT CONTEXT (Student is at [${formatTime(currentTime)}]):
${fullTranscript.map(e => `[${formatTime(e.s)}] ${e.t}`).join('\n') || 'No transcript available.'}
`}

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

4. **DISPLAY MATH ON OWN LINES**: Put $$ on separate lines with blank lines before and after.

5. **SINGLE BACKSLASH ONLY**: Write \\frac{1}{2} NOT \\\\frac{1}{2}. Never double-escape!

6. **INLINE MATH SPACING**: Always have spaces around inline math: "the value $x^2$ is positive"

7. **USE CLEAN MARKDOWN**: Use headers (##, ###) and bullet points to separate sections clearly.

8. **GFM TABLES**: Use proper table syntax with |---| separators. Escape $ as \\$ inside tables if needed.

9. **NO SYMBOL SUBSTITUTION**: NEVER use the integral symbol (∫) to replace the word "point". Always use plain English "point" only.

10. **PLAIN ENGLISH ONLY**: Use standard ASCII characters. No Unicode math symbols as word substitutes.

Always respond in English only.`;

    // Build user message - STRICT JSON-based for Explain Scene
    let userMessage = message;
    if (isExplainScene) {
      // SPECIAL CASE: If at the very beginning (first 5 seconds), treat as intro
      if (isAtIntroduction) {
        userMessage = `CURRENT VIDEO TIME: ${formatTime(currentTime)} (${currentTime} seconds)

This is the very beginning of the video (intro/title screen).

OUTPUT EXACTLY: "Currently, the instructor is introducing the lesson. No mathematical formulas have been presented yet."

STOP after that. No greetings. No follow-up questions.`;
      } else if (relevantEntry) {
        userMessage = `CURRENT VIDEO TIME: ${formatTime(currentTime)} (${currentTime} seconds)

TASK: Using ONLY the JSON transcript provided in the system prompt, find the entry with "s" closest to ${currentTime}.

The relevant entry is: {"s": ${relevantEntry.s}, "t": "${relevantEntry.t}"}

INSTRUCTIONS:
1. Explain ONLY what "${relevantEntry.t}" means mathematically.
2. DO NOT mention any other timestamps or content.
3. DO NOT summarize the video.
4. NO greetings, NO follow-up questions.
5. Start directly with the explanation.
6. STOP after explaining.

OUTPUT THE EXPLANATION NOW:`;
      } else {
        userMessage = `CURRENT VIDEO TIME: ${formatTime(currentTime)} (${currentTime} seconds)

No transcript data found for this timestamp in the provided JSON.

OUTPUT EXACTLY: "At this moment, no specific transcript data is available."

STOP after that. No guessing. No summarizing.`;
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
