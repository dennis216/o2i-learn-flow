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
    const closestEntry = fullTranscript.reduce((closest: TranscriptEntry | null, entry: TranscriptEntry) => {
      if (!closest) return entry;
      return Math.abs(entry.s - currentTime) < Math.abs(closest.s - currentTime) ? entry : closest;
    }, null);

    // Build system prompt with enhanced transcript awareness
    const systemPrompt = `You are an expert AP Calculus tutor helping a student understand a video lesson titled "${videoTitle || 'AP Calculus'}".

## YOUR ROLE
You now have access to the video's transcript data. Please use this information combined with your AP Calculus expertise to provide detailed, step-by-step explanations. Be like a caring private tutor who breaks down every concept.

## FULL VIDEO TRANSCRIPT (Student is currently at [${formatTime(currentTime)}]):
${contextText}

## RESPONSE GUIDELINES
1. **Focus on current moment**: Prioritize explaining the section near [${formatTime(currentTime)}] but use the full transcript for context
2. **Reference timestamps**: When mentioning video moments, use [MM:SS] format so students can click to seek
3. **Explain the WHY**: Don't just repeat what the transcript says - explain WHY it works mathematically
4. **Step-by-step reasoning**: Break down formulas and techniques into clear logical steps with proper LaTeX formatting
5. **Connect concepts**: Relate current material to foundational calculus principles
6. **Be encouraging**: Use a supportive, tutoring tone in English only

## CALCULUS KNOWLEDGE TO DRAW FROM
- Limits: Direct substitution, indeterminate forms (0/0, ∞/∞), L'Hôpital's Rule
- Trigonometric limits, Squeeze Theorem
- Derivatives: Power rule, product rule, quotient rule, chain rule
- Implicit differentiation, Continuity, IVT, MVT, EVT theorems
- Related rates and optimization

## CRITICAL LATEX FORMATTING RULES
You MUST follow these rules EXACTLY for proper math rendering:

1. **SINGLE BACKSLASH ONLY**: Write \\frac{1}{2} NOT \\\\frac{1}{2}. Never double-escape!
2. **DISPLAY MATH ON OWN LINES**: Put $$ on separate lines with blank lines before and after:

   The limit equals:

   $$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$

   This shows that...

3. **INLINE MATH SPACING**: Always have spaces around inline math: "the value $x^2$ is positive" NOT "the value$x^2$is positive"
4. **NO TEXT CLUMPING**: NEVER write "Sincewehave$$\\frac{0}{0}$$" - instead write:

   Since we have:

   $$\\frac{0}{0}$$

5. **GFM TABLES**: Use proper table syntax with |---| separators. Escape $ as \\$ inside tables if needed.
6. **ALWAYS USE $$** for any formula with backslash commands (\\frac, \\sqrt, \\lim, \\int, etc.)

EXAMPLE OF CORRECT FORMAT:
When evaluating limits at infinity, we compare the degrees of the polynomials.

If the degree in the numerator equals the degree in the denominator:

$$\\lim_{x \\to \\infty} \\frac{ax^n + ...}{bx^n + ...} = \\frac{a}{b}$$

The limit is simply the ratio of leading coefficients.

Always respond in English only.`;

    // Build user message
    let userMessage = message;
    if (isExplainScene) {
      if (closestEntry) {
        userMessage = `Please explain what's happening at [${formatTime(currentTime)}] in the video. The instructor is saying: "${closestEntry.t}"

Explain WHY this mathematical step or concept is correct. Break it down so I can understand the reasoning behind it. Use the full transcript context to give me a complete picture.`;
      } else {
        userMessage = `Please explain what's happening at [${formatTime(currentTime)}] in the video. I don't have specific transcript data for this moment, but help me understand the calculus concepts that might be discussed.`;
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
