import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { message, transcript, currentTime, videoTitle, isExplainScene } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Filter transcript to ±15 seconds around current time
    const relevantTranscript: TranscriptEntry[] = transcript?.filter(
      (entry: TranscriptEntry) => entry.s >= currentTime - 15 && entry.s <= currentTime + 15
    ) || [];

    // Format context for the AI
    const contextText = relevantTranscript.length > 0
      ? relevantTranscript.map((seg) => `[${formatTime(seg.s)}] ${seg.t}`).join('\n')
      : 'No transcript data available for this moment.';

    // Build system prompt that combines transcript with calculus knowledge
    const systemPrompt = `You are an expert AP Calculus tutor helping a student understand a video lesson titled "${videoTitle || 'AP Calculus'}".

## YOUR ROLE
You are a supportive, knowledgeable calculus tutor. Your job is to:
1. Use the provided transcript context to understand what the instructor is teaching at this moment
2. Combine this with your deep knowledge of AP Calculus to EXPLAIN WHY the mathematical steps are correct
3. Break down complex concepts into understandable pieces
4. Provide the mathematical reasoning behind each technique

## CURRENT VIDEO CONTEXT (±15 seconds around [${formatTime(currentTime)}]):
${contextText}

## RESPONSE GUIDELINES
1. **Reference timestamps**: When mentioning video moments, use [MM:SS] format so students can click to seek
2. **Explain the WHY**: Don't just repeat what the transcript says - explain WHY it works mathematically
3. **Step-by-step reasoning**: Break down formulas and techniques into clear logical steps
4. **Connect concepts**: Relate current material to foundational calculus principles
5. **Be encouraging**: Use a supportive, tutoring tone

## CALCULUS KNOWLEDGE TO DRAW FROM
- Limits: Direct substitution, indeterminate forms (0/0, ∞/∞), L'Hôpital's Rule
- Trigonometric limits: sin(x)/x → 1, (1-cos(x))/x → 0
- Squeeze Theorem: Bounding oscillating functions
- Derivatives: Power rule, product rule, quotient rule, chain rule
- Definition of derivative: lim(h→0) [f(x+h) - f(x)]/h
- Implicit differentiation: Treating y as a function of x
- Continuity: Three conditions (defined, limit exists, limit equals value)
- IVT, MVT, EVT theorems
- Related rates and optimization

When explaining a concept from the transcript, show the student WHY it works by connecting it to these fundamental principles.`;

    // Build user message
    let userMessage = message;
    if (isExplainScene) {
      const closestEntry = relevantTranscript.reduce((closest: TranscriptEntry | null, entry: TranscriptEntry) => {
        if (!closest) return entry;
        return Math.abs(entry.s - currentTime) < Math.abs(closest.s - currentTime) ? entry : closest;
      }, null);
      
      if (closestEntry) {
        userMessage = `Please explain what's happening at [${formatTime(currentTime)}] in the video. The instructor is saying: "${closestEntry.t}"

Explain WHY this mathematical step or concept is correct. Break it down so I can understand the reasoning behind it.`;
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
