import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, currentTopicId, recentAnswers } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get session details
    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('*, topics(*)')
      .eq('id', sessionId)
      .single();

    if (!session) {
      throw new Error('Session not found');
    }

    // Analyze recent performance
    const totalAnswers = recentAnswers.length;
    const correctAnswers = recentAnswers.filter((answer: any) => answer.is_correct).length;
    const accuracy = totalAnswers > 0 ? correctAnswers / totalAnswers : 0;

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }

    // Create context for AI analysis
    const answersContext = recentAnswers.map((answer: any) => 
      `Q: ${answer.question_text}\nUser Answer: ${answer.user_answer}\nCorrect: ${answer.is_correct ? 'Yes' : 'No'}`
    ).join('\n\n');

    const prompt = `Analyze this user's quiz performance and decide how to evolve the learning experience:

Topic: ${session.topics.title}
Topic Description: ${session.topics.description || ''}
Current Difficulty: ${session.current_difficulty}
Recent Performance: ${correctAnswers}/${totalAnswers} correct (${Math.round(accuracy * 100)}% accuracy)

Recent Answers:
${answersContext}

Based on this performance, make a decision:

1. If user shows mastery (high accuracy, good understanding): suggest topic evolution or advanced concepts
2. If user is struggling: adjust difficulty or suggest foundational concepts
3. If user is progressing well: continue with current approach but vary question types

Respond with JSON in this format:
{
  "action": "continue" | "increase_difficulty" | "decrease_difficulty" | "evolve_topic" | "suggest_subtopic",
  "reasoning": "Brief explanation of why this action was chosen",
  "new_difficulty": "easy" | "medium" | "hard" | null,
  "suggested_topic": "New topic suggestion if evolving" | null,
  "focus_area": "Specific area to focus on within current topic" | null,
  "message_to_user": "Encouraging message about their progress"
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 512,
        }
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${data.error?.message || 'Unknown error'}`);
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error('No content generated');
    }

    // Parse the JSON response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON format in response');
    }

    const evolutionDecision = JSON.parse(jsonMatch[0]);

    // Update session based on AI decision
    const updates: any = {};
    
    if (evolutionDecision.new_difficulty) {
      updates.current_difficulty = evolutionDecision.new_difficulty;
    }

    if (evolutionDecision.focus_area) {
      updates.focus_area = evolutionDecision.focus_area;
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('quiz_sessions')
        .update(updates)
        .eq('id', sessionId);
    }

    return new Response(
      JSON.stringify(evolutionDecision),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in evolve-quiz function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});