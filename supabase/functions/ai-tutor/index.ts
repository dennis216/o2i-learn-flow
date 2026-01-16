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
    
    // Use DeepSeek API
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    if (!DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY is not configured");
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

    // Build system prompt optimized for DeepSeek's reasoning capabilities
    const systemPrompt = `You are an expert Pre-Calculus 12 and Transformations tutor powered by DeepSeek, helping a student understand a video lesson titled "${videoTitle || 'Pre-Calculus 12'}".

## YOUR ROLE
You have access to the video's transcript data. Use this information combined with your deep mathematical reasoning expertise to provide detailed, step-by-step explanations. Think through problems carefully and show your reasoning process.

## FULL VIDEO TRANSCRIPT (Student is currently at [${formatTime(currentTime)}]):
${contextText}

## RESPONSE GUIDELINES
1. **Focus on current moment**: Prioritize explaining the section near [${formatTime(currentTime)}] but use the full transcript for context
2. **Reference timestamps**: When mentioning video moments, use [MM:SS] format so students can click to seek
3. **Think step-by-step**: Break down your reasoning process explicitly - show HOW you arrive at each step
4. **Explain the WHY**: Don't just repeat what the transcript says - explain WHY it works mathematically
5. **Be encouraging**: Use a supportive, tutoring tone in English only

## PRE-CALCULUS 12 & TRANSFORMATIONS KNOWLEDGE
- Function transformations: translations, reflections, stretches, compressions
- Transformation notation: y = af(b(x-h)) + k
- Order of transformations and their effects
- Parent functions: linear, quadratic, cubic, square root, absolute value, reciprocal
- Inverse functions and their graphical relationship
- Composite functions
- Polynomial and rational functions
- Exponential and logarithmic functions
- Trigonometric functions and their transformations
- Sinusoidal functions: amplitude, period, phase shift, vertical shift

## CRITICAL LATEX FORMATTING RULES
You MUST follow these rules EXACTLY for proper math rendering:

1. **SINGLE BACKSLASH ONLY**: Write \\frac{1}{2} NOT \\\\frac{1}{2}. Never double-escape!
2. **DISPLAY MATH ON OWN LINES**: Put $$ on separate lines with blank lines before and after:

   The transformation is:

   $$y = 2f(x - 3) + 1$$

   This means...

3. **INLINE MATH SPACING**: Always have spaces around inline math: "the value $x^2$ is positive" NOT "the value$x^2$is positive"
4. **NO TEXT CLUMPING**: NEVER write "Sincewehave$$\\frac{0}{0}$$" - instead write properly spaced text
5. **ALWAYS USE $$** for any formula with backslash commands (\\frac, \\sqrt, \\sin, \\cos, etc.)

Always respond in English only.`;

    // Build user message
    let userMessage = message;
    if (isExplainScene) {
      if (closestEntry) {
        userMessage = `Please explain what's happening at [${formatTime(currentTime)}] in the video. The instructor is saying: "${closestEntry.t}"

Explain WHY this mathematical step or concept is correct. Break it down so I can understand the reasoning behind it. Use the full transcript context to give me a complete picture.`;
      } else {
        userMessage = `Please explain what's happening at [${formatTime(currentTime)}] in the video. I don't have specific transcript data for this moment, but help me understand the math concepts that might be discussed.`;
      }
    }

    // Call DeepSeek API
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402 || response.status === 401) {
        return new Response(JSON.stringify({ error: "API authentication error. Please check API key." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("DeepSeek API error:", response.status, errorText);
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
