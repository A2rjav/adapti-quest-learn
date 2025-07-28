import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Brain, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface Question {
  id: string;
  question_text: string;
  question_type: 'mcq' | 'fill_blank' | 'short_answer' | 'long_answer' | 'true_false';
  difficulty: 'easy' | 'medium' | 'hard';
  correct_answer: string;
  options?: string[];
  rationale?: string;
}

interface QuizSession {
  id: string;
  topic_id: string;
  current_difficulty: 'easy' | 'medium' | 'hard';
  total_questions: number;
  correct_answers: number;
}

interface QuizInterfaceProps {
  topicId: string;
  topicTitle: string;
  onQuizComplete: () => void;
}

const QuizInterface = ({ topicId, topicTitle, onQuizComplete }: QuizInterfaceProps) => {
  const { user, getUserProfile } = useAuth();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeQuiz();
  }, [topicId]);

  const initializeQuiz = async () => {
    try {
      const profile = await getUserProfile();
      if (!profile) throw new Error('Profile not found');

      // Create a new quiz session
      const { data: sessionData, error: sessionError } = await supabase
        .from('quiz_sessions')
        .insert({
          user_id: profile.id,
          topic_id: topicId,
          current_difficulty: 'medium'
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      setSession(sessionData);
      await loadNextQuestion(sessionData.current_difficulty);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadNextQuestion = async (difficulty: 'easy' | 'medium' | 'hard') => {
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .eq('topic_id', topicId)
        .eq('difficulty', difficulty)
        .limit(1);

      if (error) throw error;

      if (questions && questions.length > 0) {
        const question = questions[0];
        setCurrentQuestion({
          ...question,
          options: question.options ? JSON.parse(question.options as string) : undefined
        });
      } else {
        // Generate new question using AI
        await generateNewQuestion(difficulty);
      }
    } catch (error: any) {
      console.error('Error loading question:', error);
      // Fallback to generating a new question
      await generateNewQuestion(difficulty);
    }
  };

  const generateNewQuestion = async (difficulty: 'easy' | 'medium' | 'hard') => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-question', {
        body: {
          topicId,
          difficulty,
          questionType: 'mcq' // Default to MCQ for AI generation
        }
      });

      if (error) throw error;

      if (data?.question) {
        setCurrentQuestion(data.question);
      }
    } catch (error: any) {
      console.error('Error generating question:', error);
      toast({
        title: "Error",
        description: "Failed to load question",
        variant: "destructive"
      });
    }
  };

  const submitAnswer = async () => {
    if (!currentQuestion || !session || !userAnswer.trim()) return;

    setIsAnswering(true);

    try {
      // Check if answer is correct
      const isCorrect = userAnswer.toLowerCase().trim() === currentQuestion.correct_answer.toLowerCase().trim();

      // Get AI feedback for non-MCQ questions
      let feedback = '';
      if (currentQuestion.question_type !== 'mcq' && currentQuestion.question_type !== 'true_false') {
        try {
          const { data: feedbackData } = await supabase.functions.invoke('grade-answer', {
            body: {
              question: currentQuestion.question_text,
              userAnswer,
              correctAnswer: currentQuestion.correct_answer,
              questionType: currentQuestion.question_type
            }
          });
          feedback = feedbackData?.feedback || '';
        } catch (error) {
          console.error('Error getting AI feedback:', error);
        }
      }

      // Save answer
      await supabase
        .from('user_answers')
        .insert({
          session_id: session.id,
          question_id: currentQuestion.id,
          user_answer: userAnswer,
          is_correct: isCorrect,
          ai_feedback: feedback
        });

      // Update session
      const newTotalQuestions = session.total_questions + 1;
      const newCorrectAnswers = session.correct_answers + (isCorrect ? 1 : 0);
      
      await supabase
        .from('quiz_sessions')
        .update({
          total_questions: newTotalQuestions,
          correct_answers: newCorrectAnswers
        })
        .eq('id', session.id);

      setSession({
        ...session,
        total_questions: newTotalQuestions,
        correct_answers: newCorrectAnswers
      });

      setLastAnswerCorrect(isCorrect);
      setAiFeedback(feedback);
      setShowFeedback(true);

      // Adapt difficulty based on performance
      if (newTotalQuestions >= 5) {
        const accuracy = newCorrectAnswers / newTotalQuestions;
        let newDifficulty = session.current_difficulty;
        
        if (accuracy > 0.7 && session.current_difficulty !== 'hard') {
          newDifficulty = session.current_difficulty === 'easy' ? 'medium' : 'hard';
        } else if (accuracy < 0.5 && session.current_difficulty !== 'easy') {
          newDifficulty = session.current_difficulty === 'hard' ? 'medium' : 'easy';
        }

        if (newDifficulty !== session.current_difficulty) {
          await supabase
            .from('quiz_sessions')
            .update({ current_difficulty: newDifficulty })
            .eq('id', session.id);
          
          setSession({ ...session, current_difficulty: newDifficulty });
        }
      }

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsAnswering(false);
    }
  };

  const nextQuestion = () => {
    setShowFeedback(false);
    setUserAnswer('');
    setAiFeedback('');
    if (session) {
      loadNextQuestion(session.current_difficulty);
    }
  };

  const endQuiz = async () => {
    if (!session) return;

    await supabase
      .from('quiz_sessions')
      .update({ 
        is_active: false,
        completed_at: new Date().toISOString()
      })
      .eq('id', session.id);

    onQuizComplete();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Brain className="w-8 h-8 mx-auto mb-4 animate-pulse" />
          <p>Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (!currentQuestion || !session) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p>No questions available for this topic.</p>
          <Button onClick={onQuizComplete} className="mt-4">
            Back to Topics
          </Button>
        </CardContent>
      </Card>
    );
  }

  const accuracy = session.total_questions > 0 ? Math.round((session.correct_answers / session.total_questions) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                {topicTitle}
              </CardTitle>
              <CardDescription>
                Question {session.total_questions + 1} • {session.current_difficulty} difficulty
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{accuracy}%</div>
              <div className="text-sm text-muted-foreground">
                {session.correct_answers}/{session.total_questions}
              </div>
            </div>
          </div>
          {session.total_questions > 0 && (
            <Progress value={accuracy} className="w-full" />
          )}
        </CardHeader>
      </Card>

      {!showFeedback ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline">{currentQuestion.question_type}</Badge>
              <Badge variant="secondary">{currentQuestion.difficulty}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {currentQuestion.question_text}
              </h3>
              
              {currentQuestion.question_type === 'mcq' && currentQuestion.options && (
                <RadioGroup value={userAnswer} onValueChange={setUserAnswer}>
                  {currentQuestion.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`}>{option}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {currentQuestion.question_type === 'true_false' && (
                <RadioGroup value={userAnswer} onValueChange={setUserAnswer}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="true" />
                    <Label htmlFor="true">True</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="false" />
                    <Label htmlFor="false">False</Label>
                  </div>
                </RadioGroup>
              )}

              {currentQuestion.question_type === 'fill_blank' && (
                <Input
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Type your answer here"
                />
              )}

              {(currentQuestion.question_type === 'short_answer' || currentQuestion.question_type === 'long_answer') && (
                <Textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Type your answer here"
                  rows={currentQuestion.question_type === 'long_answer' ? 6 : 3}
                />
              )}
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={submitAnswer} 
                disabled={!userAnswer.trim() || isAnswering}
                className="flex-1"
              >
                {isAnswering ? 'Submitting...' : 'Submit Answer'}
              </Button>
              <Button 
                variant="outline" 
                onClick={endQuiz}
              >
                End Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {lastAnswerCorrect ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500" />
              )}
              <div>
                <h3 className="text-lg font-semibold">
                  {lastAnswerCorrect ? 'Correct!' : 'Incorrect'}
                </h3>
                <p className="text-muted-foreground">
                  The correct answer was: <strong>{currentQuestion.correct_answer}</strong>
                </p>
              </div>
            </div>

            {currentQuestion.rationale && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">Explanation:</h4>
                <p>{currentQuestion.rationale}</p>
              </div>
            )}

            {aiFeedback && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <h4 className="font-semibold mb-2">AI Feedback:</h4>
                <p>{aiFeedback}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={nextQuestion} className="flex-1">
                Next Question
              </Button>
              <Button variant="outline" onClick={endQuiz}>
                <Trophy className="w-4 h-4 mr-2" />
                Finish Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default QuizInterface;