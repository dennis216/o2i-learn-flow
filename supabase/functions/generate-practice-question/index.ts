import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscriptEntry {
  s: number;
  t: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, videoTitle } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const transcriptEntries: TranscriptEntry[] = transcript || [];
    
    if (transcriptEntries.length === 0) {
      return new Response(
        JSON.stringify({ error: "No transcript data available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Combine all transcript text
    const fullTranscriptText = transcriptEntries.map((e) => e.t).join(' ');

    const systemPrompt = `You are an AP Calculus problem generator. Your job is to create practice problems similar to what's taught in a video lesson.

## LESSON TRANSCRIPT
Title: ${videoTitle || 'AP Calculus Lesson'}
Content: ${fullTranscriptText}

## YOUR TASK
Generate ONE practice problem that:
1. Tests the same concept taught in the lesson
2. Has similar difficulty level
3. Is slightly different from any examples in the transcript (change numbers, functions, or context)
4. Is self-contained and clearly stated
5. Include a detailed step-by-step solution

## RESPONSE FORMAT
Return ONLY a JSON object with this exact structure:
{
  "question": "The full problem statement, clearly written",
  "topic": "Brief topic name (e.g., 'Chain Rule', 'Related Rates', 'Limits')",
  "solution": "Step-by-step solution with clear explanations. Use line breaks between steps. Format: Step 1: [explanation]\\nStep 2: [explanation]\\n... Final Answer: [answer]"
}

Do not include any markdown formatting, code blocks, or extra text. Just the raw JSON object.`;

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
          { role: "user", content: "Generate a practice problem based on this lesson." },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    try {
      // Clean up the response - remove any markdown formatting
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();

      const parsed = JSON.parse(cleanContent);
      
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return a fallback response
      return new Response(JSON.stringify({
        question: content,
        topic: videoTitle || "Calculus",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Generate question error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});