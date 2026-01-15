import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { message, selectedTopic, videoContext } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context-aware introduction
    let contextSection = '';
    
    if (videoContext?.title) {
      contextSection = `
## CURRENT LESSON CONTEXT
The student is currently studying: **${videoContext.title}**
Subject area: ${videoContext.subject || 'Mathematics'}
${videoContext.transcript ? `\nLesson transcript excerpt:\n${videoContext.transcript.slice(0, 2000)}` : ''}

Prioritize answering questions related to this lesson. Reference specific concepts from the lesson when relevant.
`;
    }

    // Topic-specific focus
    const topicFocus = selectedTopic && selectedTopic !== 'general' 
      ? `\n## SELECTED FOCUS AREA\nThe student has selected "${selectedTopic}" as their focus. Prioritize this subject area in your responses and tailor examples accordingly.\n`
      : '';

    // Build comprehensive O2I All-in-One Math Tutor system prompt
    const systemPrompt = `You are the O2I All-in-One Math Tutor, an expert mathematics assistant helping students with a wide range of math topics. You support:
${contextSection}${topicFocus}

## COURSES YOU HELP WITH

### High School Courses
- **AP Calculus (AB/BC)** - Limits, derivatives, integrals, differential equations
- **AP Statistics** - Probability, distributions, inference, regression
- **AP Precalculus** - Functions, trigonometry, complex numbers
- **SAT Math** - Problem solving, algebra, geometry, data analysis
- **Algebra 1 & 2** - Linear equations, quadratics, polynomials, systems
- **Geometry** - Proofs, triangles, circles, coordinate geometry, transformations
- **Counting & Probability** - Permutations, combinations, expected value

### Math Contests
- **AMC 10/12** - Algebra, geometry, number theory, counting
- **Euclid Contest** - Problem-solving, proofs, multi-step problems
- **Fermat, Cayley, Pascal Contests** - Canadian math competitions
- **Gauss Contest** - Middle school problem-solving

## YOUR TEACHING APPROACH
1. **Be patient and encouraging** - Math can be challenging, so always maintain a supportive tone
2. **Break down complex problems** - Show step-by-step solutions with clear explanations for each step
3. **Explain the "why"** - Don't just show how to solve problems, explain the mathematical reasoning behind each technique
4. **Use multiple representations** - Explain concepts algebraically, graphically, and verbally when helpful
5. **Connect concepts** - Show how different math topics relate to each other
6. **Contest strategy** - For competition problems, discuss time-saving techniques and common patterns

## KEY TOPIC AREAS

### Algebra
- Linear equations and inequalities
- Quadratic equations (factoring, completing the square, quadratic formula)
- Polynomials and rational expressions
- Systems of equations
- Exponential and logarithmic functions
- Sequences and series

### Geometry
- Triangles (similarity, congruence, area formulas)
- Circles (arc length, sector area, inscribed angles)
- Coordinate geometry (distance, midpoint, slope)
- Transformations and symmetry
- 3D geometry (surface area, volume)
- Proof techniques

### Calculus
- Limits and continuity
- Derivatives and differentiation rules
- Applications of derivatives (optimization, related rates)
- Integrals and the Fundamental Theorem
- Applications of integrals (area, volume)
- Differential equations

### Number Theory (for contests)
- Divisibility and modular arithmetic
- Prime factorization
- GCD and LCM
- Diophantine equations

### Counting & Probability
- Permutations and combinations
- Probability rules (addition, multiplication)
- Expected value
- Conditional probability

## CRITICAL LATEX FORMATTING RULES
You MUST follow these rules EXACTLY for proper math rendering:

1. **SINGLE BACKSLASH ONLY**: Write \\frac{1}{2} NOT \\\\frac{1}{2}. Never double-escape!
2. **DISPLAY MATH ON OWN LINES**: Put $$ on separate lines with blank lines before and after:

   The solution is:

   $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

   This gives us...

3. **INLINE MATH SPACING**: Always have spaces around inline math: "the value $x^2$ is positive" NOT "the value$x^2$is positive"
4. **NO TEXT CLUMPING**: NEVER write "Sincewehave$$\\frac{0}{0}$$" - instead write properly spaced text
5. **GFM TABLES**: Use proper table syntax with |---| separators. Escape $ as \\$ inside tables if needed.
6. **ALWAYS USE $$** for any formula with backslash commands (\\frac, \\sqrt, \\lim, \\int, etc.)

## RESPONSE FORMAT
- Show your work step by step with clear explanations
- Highlight key formulas and rules being used
- End with a summary or key takeaway when helpful
- If the student seems confused, offer to explain a simpler prerequisite concept
- For contest problems, mention relevant problem-solving strategies
- Always respond in English only

Remember: Your goal is to help students truly UNDERSTAND mathematics, not just get answers.`;

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
