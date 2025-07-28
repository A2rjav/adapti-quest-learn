import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Plus, Play, BookOpen, Trophy, Brain, TrendingUp, User, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import TopicCreator from './TopicCreator';
import QuizInterface from './QuizInterface';

interface Topic {
  id: string;
  title: string;
  description: string;
  created_at: string;
  is_public: boolean;
}

interface QuizSession {
  id: string;
  topic_id: string;
  total_questions: number;
  correct_answers: number;
  started_at: string;
  completed_at: string | null;
  topics: { title: string };
}

const Dashboard = () => {
  const { user, signOut, getUserProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('browse');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [userSessions, setUserSessions] = useState<QuizSession[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load user profile
      const profile = await getUserProfile();
      setUserProfile(profile);

      // Load topics
      const { data: topicsData } = await supabase
        .from('topics')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (topicsData) {
        setTopics(topicsData);
      }

      // Load user quiz sessions
      if (profile) {
        const { data: sessionsData } = await supabase
          .from('quiz_sessions')
          .select(`
            *,
            topics!inner(title)
          `)
          .eq('user_id', profile.id)
          .order('started_at', { ascending: false })
          .limit(10);

        if (sessionsData) {
          setUserSessions(sessionsData);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startQuiz = (topic: Topic) => {
    setSelectedTopic(topic);
    setActiveTab('quiz');
  };

  const onQuizComplete = () => {
    setSelectedTopic(null);
    setActiveTab('browse');
    loadData(); // Refresh data to show new session
  };

  const onTopicCreated = () => {
    setActiveTab('browse');
    loadData(); // Refresh topics list
  };

  const getTotalStats = () => {
    const totalQuestions = userSessions.reduce((sum, session) => sum + session.total_questions, 0);
    const totalCorrect = userSessions.reduce((sum, session) => sum + session.correct_answers, 0);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    return { totalQuestions, totalCorrect, accuracy, totalSessions: userSessions.length };
  };

  const stats = getTotalStats();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-8 h-8 mx-auto mb-4 animate-pulse" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="w-8 h-8" />
              AI Quiz Platform
            </h1>
            <p className="text-muted-foreground">
              Welcome back, {userProfile?.display_name || user?.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {user?.email}
            </Badge>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Sessions</p>
                  <p className="text-2xl font-bold">{stats.totalSessions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Questions</p>
                  <p className="text-2xl font-bold">{stats.totalQuestions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Accuracy</p>
                  <p className="text-2xl font-bold">{stats.accuracy}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Correct</p>
                  <p className="text-2xl font-bold">{stats.totalCorrect}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="browse">Browse Topics</TabsTrigger>
            <TabsTrigger value="create">Create Topic</TabsTrigger>
            <TabsTrigger value="history">Quiz History</TabsTrigger>
            <TabsTrigger value="quiz" disabled={!selectedTopic}>
              {selectedTopic ? 'Take Quiz' : 'Quiz'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Available Topics</h2>
              <Button onClick={() => setActiveTab('create')}>
                <Plus className="w-4 h-4 mr-2" />
                Create New Topic
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topics.map((topic) => (
                <Card key={topic.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="line-clamp-2">{topic.title}</CardTitle>
                    <CardDescription className="line-clamp-3">
                      {topic.description || 'No description available'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Public</Badge>
                      <Button size="sm" onClick={() => startQuiz(topic)}>
                        <Play className="w-4 h-4 mr-2" />
                        Start Quiz
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {topics.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Topics Available</h3>
                  <p className="text-muted-foreground mb-4">
                    Be the first to create a learning topic!
                  </p>
                  <Button onClick={() => setActiveTab('create')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Topic
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="create">
            <TopicCreator onTopicCreated={onTopicCreated} />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <h2 className="text-2xl font-semibold">Quiz History</h2>
            
            <div className="space-y-3">
              {userSessions.map((session) => {
                const accuracy = session.total_questions > 0 
                  ? Math.round((session.correct_answers / session.total_questions) * 100) 
                  : 0;

                return (
                  <Card key={session.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold">{session.topics.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(session.started_at).toLocaleDateString()} • {session.total_questions} questions
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{accuracy}%</div>
                          <div className="text-sm text-muted-foreground">
                            {session.correct_answers}/{session.total_questions}
                          </div>
                        </div>
                      </div>
                      <Progress value={accuracy} className="mt-3" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {userSessions.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Quiz History</h3>
                  <p className="text-muted-foreground mb-4">
                    Start taking quizzes to see your progress here!
                  </p>
                  <Button onClick={() => setActiveTab('browse')}>
                    <Play className="w-4 h-4 mr-2" />
                    Browse Topics
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="quiz">
            {selectedTopic ? (
              <QuizInterface
                topicId={selectedTopic.id}
                topicTitle={selectedTopic.title}
                onQuizComplete={onQuizComplete}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <p>Please select a topic to start a quiz.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;