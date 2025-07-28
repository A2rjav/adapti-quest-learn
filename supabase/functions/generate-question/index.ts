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
    const { topicId, difficulty, questionType } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get topic details
    const { data: topic } = await supabase
      .from('topics')
      .select('title, description')
      .eq('id', topicId)
      .single();

    if (!topic) {
      throw new Error('Topic not found');
    }

    // Get existing questions for context
    const { data: existingQuestions } = await supabase
      .from('questions')
      .select('question_text, correct_answer')
      .eq('topic_id', topicId)
      .limit(5);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }

    const existingQuestionsText = existingQuestions
      ? existingQuestions.map(q => `Q: ${q.question_text}\nA: ${q.correct_answer}`).join('\n\n')
      : '';

    const prompt = `Generate a ${difficulty} difficulty ${questionType} question for the topic: "${topic.title}".

Topic Description: ${topic.description || ''}

${existingQuestionsText ? `Here are some existing questions for context:\n${existingQuestionsText}\n\n` : ''}

Create a NEW question that:
1. Is ${difficulty} difficulty level
2. Is a ${questionType} type question
3. Is different from the existing questions above
4. Tests understanding of ${topic.title}

For MCQ questions, provide 4 options.
For true/false questions, make it a clear true or false statement.
For fill-in-the-blank, use _____ to indicate the blank.

Response format (JSON):
{
  "question_text": "The question text here",
  "correct_answer": "The correct answer",
  "options": ["option1", "option2", "option3", "option4"], // Only for MCQ
  "rationale": "Explanation of why this is correct",
  "difficulty": "${difficulty}",
  "question_type": "${questionType}"
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
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
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

    const questionData = JSON.parse(jsonMatch[0]);

    // Save the generated question to database
    const { data: savedQuestion, error: saveError } = await supabase
      .from('questions')
      .insert({
        topic_id: topicId,
        question_text: questionData.question_text,
        question_type: questionData.question_type,
        difficulty: questionData.difficulty,
        correct_answer: questionData.correct_answer,
        options: questionData.options ? JSON.stringify(questionData.options) : null,
        rationale: questionData.rationale,
        created_by: null // AI generated
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving question:', saveError);
    }

    return new Response(
      JSON.stringify({
        question: {
          id: savedQuestion?.id || Math.random().toString(36).substr(2, 9),
          question_text: questionData.question_text,
          question_type: questionData.question_type,
          difficulty: questionData.difficulty,
          correct_answer: questionData.correct_answer,
          options: questionData.options,
          rationale: questionData.rationale
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-question function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});