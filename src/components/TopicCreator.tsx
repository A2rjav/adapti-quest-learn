import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface Question {
  id: string;
  questionText: string;
  questionType: 'mcq' | 'fill_blank' | 'short_answer' | 'long_answer' | 'true_false';
  difficulty: 'easy' | 'medium' | 'hard';
  correctAnswer: string;
  options?: string[];
  rationale?: string;
}

interface TopicCreatorProps {
  onTopicCreated: () => void;
}

const TopicCreator = ({ onTopicCreated }: TopicCreatorProps) => {
  const { user, getUserProfile } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Partial<Question>>({
    questionType: 'mcq',
    difficulty: 'medium',
    options: ['', '', '', '']
  });

  const addQuestion = () => {
    if (!currentQuestion.questionText || !currentQuestion.correctAnswer) {
      toast({
        title: "Missing Information",
        description: "Please fill in question text and correct answer",
        variant: "destructive"
      });
      return;
    }

    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      questionText: currentQuestion.questionText || '',
      questionType: currentQuestion.questionType as Question['questionType'],
      difficulty: currentQuestion.difficulty as Question['difficulty'],
      correctAnswer: currentQuestion.correctAnswer || '',
      options: currentQuestion.questionType === 'mcq' ? currentQuestion.options?.filter(opt => opt.trim()) : undefined,
      rationale: currentQuestion.rationale
    };

    setQuestions([...questions, newQuestion]);
    setCurrentQuestion({
      questionType: 'mcq',
      difficulty: 'medium',
      options: ['', '', '', '']
    });
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const createTopic = async () => {
    if (!topicTitle || questions.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please provide a topic title and at least one question",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);

    try {
      const profile = await getUserProfile();
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Create topic
      const { data: topic, error: topicError } = await supabase
        .from('topics')
        .insert({
          title: topicTitle,
          description: topicDescription,
          created_by: profile.id
        })
        .select()
        .single();

      if (topicError) throw topicError;

      // Create questions
      const questionsToInsert = questions.map(q => ({
        topic_id: topic.id,
        question_text: q.questionText,
        question_type: q.questionType,
        difficulty: q.difficulty,
        correct_answer: q.correctAnswer,
        options: q.options ? JSON.stringify(q.options) : null,
        rationale: q.rationale,
        created_by: profile.id
      }));

      const { error: questionsError } = await supabase
        .from('questions')
        .insert(questionsToInsert);

      if (questionsError) throw questionsError;

      toast({
        title: "Success",
        description: "Topic created successfully!"
      });

      // Reset form
      setTopicTitle('');
      setTopicDescription('');
      setQuestions([]);
      onTopicCreated();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Topic</CardTitle>
          <CardDescription>
            Define a new learning topic with initial questions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic-title">Topic Title</Label>
            <Input
              id="topic-title"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="e.g., SQL Fundamentals, World History: WWII"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="topic-description">Description</Label>
            <Textarea
              id="topic-description"
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              placeholder="Brief description of the topic"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Questions</CardTitle>
          <CardDescription>
            Create initial questions for this topic
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select
                value={currentQuestion.questionType}
                onValueChange={(value) => setCurrentQuestion({
                  ...currentQuestion,
                  questionType: value as Question['questionType'],
                  options: value === 'mcq' ? ['', '', '', ''] : undefined
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple Choice</SelectItem>
                  <SelectItem value="true_false">True/False</SelectItem>
                  <SelectItem value="fill_blank">Fill in the Blank</SelectItem>
                  <SelectItem value="short_answer">Short Answer</SelectItem>
                  <SelectItem value="long_answer">Long Answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select
                value={currentQuestion.difficulty}
                onValueChange={(value) => setCurrentQuestion({
                  ...currentQuestion,
                  difficulty: value as Question['difficulty']
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Question Text</Label>
            <Textarea
              value={currentQuestion.questionText || ''}
              onChange={(e) => setCurrentQuestion({
                ...currentQuestion,
                questionText: e.target.value
              })}
              placeholder="Enter your question here"
              rows={3}
            />
          </div>

          {currentQuestion.questionType === 'mcq' && (
            <div className="space-y-2">
              <Label>Answer Options</Label>
              <div className="space-y-2">
                {currentQuestion.options?.map((option, index) => (
                  <Input
                    key={index}
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...(currentQuestion.options || [])];
                      newOptions[index] = e.target.value;
                      setCurrentQuestion({
                        ...currentQuestion,
                        options: newOptions
                      });
                    }}
                    placeholder={`Option ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Correct Answer</Label>
            <Input
              value={currentQuestion.correctAnswer || ''}
              onChange={(e) => setCurrentQuestion({
                ...currentQuestion,
                correctAnswer: e.target.value
              })}
              placeholder="Enter the correct answer"
            />
          </div>

          <div className="space-y-2">
            <Label>Rationale (Optional)</Label>
            <Textarea
              value={currentQuestion.rationale || ''}
              onChange={(e) => setCurrentQuestion({
                ...currentQuestion,
                rationale: e.target.value
              })}
              placeholder="Explain why this is the correct answer"
              rows={2}
            />
          </div>

          <Button onClick={addQuestion} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </CardContent>
      </Card>

      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Questions Added ({questions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questions.map((question) => (
                <div key={question.id} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{question.questionType}</Badge>
                      <Badge variant="secondary">{question.difficulty}</Badge>
                    </div>
                    <p className="text-sm font-medium">{question.questionText}</p>
                    <p className="text-sm text-muted-foreground">
                      Answer: {question.correctAnswer}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuestion(question.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button 
        onClick={createTopic} 
        disabled={isCreating || !topicTitle || questions.length === 0}
        className="w-full"
        size="lg"
      >
        {isCreating ? 'Creating Topic...' : 'Create Topic'}
      </Button>
    </div>
  );
};

export default TopicCreator;