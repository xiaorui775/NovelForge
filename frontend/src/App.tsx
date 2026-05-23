import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { requestNotificationPermission } from './utils/notify';
import Layout from './components/Layout';
import PageSkeleton from './components/PageSkeleton';
import ErrorBoundary from './components/ui/ErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ModelManager = lazy(() => import('./pages/ModelManager'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const OutlineManager = lazy(() => import('./pages/OutlineManager'));
const ChapterEditor = lazy(() => import('./pages/ChapterEditor'));
const ProjectCreate = lazy(() => import('./pages/ProjectCreate'));
const CharacterLibrary = lazy(() => import('./pages/CharacterLibrary'));
const WorldviewManager = lazy(() => import('./pages/WorldviewManager'));
const TerminologyManager = lazy(() => import('./pages/TerminologyManager'));
const PromptTemplateManager = lazy(() => import('./pages/PromptTemplateManager'));
const CostBudgetSettings = lazy(() => import('./pages/CostBudgetSettings'));
const Analytics = lazy(() => import('./pages/Analytics'));
const ReadingMode = lazy(() => import('./pages/ReadingMode'));
const ChapterKanban = lazy(() => import('./pages/ChapterKanban'));
const ProjectTimeline = lazy(() => import('./pages/ProjectTimeline'));
const PacingAnalysis = lazy(() => import('./pages/PacingAnalysis'));
const ForeshadowingTracker = lazy(() => import('./pages/ForeshadowingTracker'));
const ChatAssistant = lazy(() => import('./pages/ChatAssistant'));
const StoryTemplates = lazy(() => import('./pages/StoryTemplates'));
const StoryHealth = lazy(() => import('./pages/StoryHealth'));
const ProjectList = lazy(() => import('./pages/ProjectList'));
const StoryBible = lazy(() => import('./pages/StoryBible'));
const SeriesManager = lazy(() => import('./pages/SeriesManager'));
const NotFound = lazy(() => import('./pages/NotFound'));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LazyRoute><Dashboard /></LazyRoute>} />
        <Route path="models" element={<LazyRoute><ModelManager /></LazyRoute>} />
        <Route path="characters" element={<LazyRoute><CharacterLibrary /></LazyRoute>} />
        <Route path="worldviews" element={<LazyRoute><WorldviewManager /></LazyRoute>} />
        <Route path="projects" element={<LazyRoute><ProjectList /></LazyRoute>} />
        <Route path="projects/new" element={<LazyRoute><ProjectCreate /></LazyRoute>} />
        <Route path="projects/:id/edit" element={<LazyRoute><ProjectCreate /></LazyRoute>} />
        <Route path="projects/:id" element={<LazyRoute><ProjectDetail /></LazyRoute>} />
        <Route path="projects/:id/outline" element={<LazyRoute><OutlineManager /></LazyRoute>} />
        <Route path="projects/:id/kanban" element={<LazyRoute><ChapterKanban /></LazyRoute>} />
        <Route path="projects/:id/timeline" element={<LazyRoute><ProjectTimeline /></LazyRoute>} />
        <Route path="projects/:id/pacing" element={<LazyRoute><PacingAnalysis /></LazyRoute>} />
        <Route path="projects/:id/foreshadowing" element={<LazyRoute><ForeshadowingTracker /></LazyRoute>} />
        <Route path="projects/:id/health" element={<LazyRoute><StoryHealth /></LazyRoute>} />
        <Route path="projects/:id/story-templates" element={<LazyRoute><StoryTemplates /></LazyRoute>} />
        <Route path="projects/:id/chat" element={<LazyRoute><ChatAssistant /></LazyRoute>} />
        <Route path="projects/:id/terminology" element={<LazyRoute><TerminologyManager /></LazyRoute>} />
        <Route path="projects/:id/story-bible" element={<LazyRoute><StoryBible /></LazyRoute>} />
        <Route path="projects/:id/chapters/:chapterOutlineId" element={<LazyRoute><ChapterEditor /></LazyRoute>} />
        <Route path="prompts" element={<LazyRoute><PromptTemplateManager /></LazyRoute>} />
        <Route path="cost-budget" element={<LazyRoute><CostBudgetSettings /></LazyRoute>} />
        <Route path="analytics" element={<LazyRoute><Analytics /></LazyRoute>} />
        <Route path="series" element={<LazyRoute><SeriesManager /></LazyRoute>} />
        <Route path="projects/:id/read" element={<LazyRoute><ReadingMode /></LazyRoute>} />
        <Route path="projects/:id/read/:chapterIndex" element={<LazyRoute><ReadingMode /></LazyRoute>} />
        <Route path="*" element={<LazyRoute><NotFound /></LazyRoute>} />
      </Route>
    </Routes>
  );
}

export default App;
