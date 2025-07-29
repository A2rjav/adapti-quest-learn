-- Add focus_area column to quiz_sessions for topic evolution
ALTER TABLE public.quiz_sessions 
ADD COLUMN focus_area TEXT;

-- Add mastery tracking columns
ALTER TABLE public.quiz_sessions 
ADD COLUMN mastery_score DECIMAL(3,2) DEFAULT 0.0;

-- Add topic evolution tracking
ALTER TABLE public.quiz_sessions 
ADD COLUMN evolution_suggestions JSONB DEFAULT '[]'::jsonb;