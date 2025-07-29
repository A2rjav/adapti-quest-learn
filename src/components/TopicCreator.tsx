import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface TopicCreatorProps {
  onTopicCreated: () => void;
}

const TopicCreator = ({ onTopicCreated }: TopicCreatorProps) => {
  const { user, getUserProfile } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');

  const generateAIQuestions = async (topicId: string) => {
    const questionTypes = ['mcq', 'true_false', 'fill_blank'];
    const difficulties = ['easy', 'medium', 'hard'];
    
    // Generate 3 initial questions with different types and difficulties
    for (let i = 0; i < 3; i++) {
      try {
        await supabase.functions.invoke('generate-question', {
          body: {
            topicId,
            difficulty: difficulties[i],
            questionType: questionTypes[i % questionTypes.length]
          }
        });
      } catch (error) {
        console.error('Error generating question:', error);
      }
    }
  };

  const createTopic = async () => {
    if (!topicTitle) {
      toast({
        title: "Missing Information",
        description: "Please provide a topic title",
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

      // Generate AI questions for the topic
      await generateAIQuestions(topic.id);

      toast({
        title: "Success",
        description: "Topic created with AI-generated questions!"
      });

      // Reset form
      setTopicTitle('');
      setTopicDescription('');
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
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Create New Topic
          </CardTitle>
          <CardDescription>
            AI will automatically generate evolving questions for your topic
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
              placeholder="Brief description of the topic (helps AI generate better questions)"
              rows={3}
            />
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h4 className="font-semibold">AI Question Generation</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              The AI will automatically create initial questions for your topic and continue 
              generating new questions during quizzes that adapt to your learning progress.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button 
        onClick={createTopic} 
        disabled={isCreating || !topicTitle}
        className="w-full"
        size="lg"
      >
        {isCreating ? (
          <>
            <Brain className="w-4 h-4 mr-2 animate-pulse" />
            Creating Topic & Generating Questions...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Create Topic with AI Questions
          </>
        )}
      </Button>
    </div>
  );
};

export default TopicCreator;