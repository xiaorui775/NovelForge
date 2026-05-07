import client from './client';

export interface AnalyticsOverview {
  total_generations: number;
  total_tokens: number;
  total_cost: number;
  avg_score: number;
  total_chapters: number;
  total_words: number;
  total_projects: number;
  avg_duration_ms: number;
}

export interface MonthlyStats {
  month: string;
  generations: number;
  tokens: number;
  cost: number;
  avg_score: number | null;
}

export interface ModelStats {
  model_id: string;
  model_name: string;
  generations: number;
  tokens: number;
  cost: number;
  avg_score: number | null;
}

export interface ProjectStats {
  project_id: string;
  project_name: string;
  generations: number;
  tokens: number;
  cost: number;
}

export interface RecentActivity {
  id: string;
  status: string;
  token_input: number;
  token_output: number;
  cost: number;
  duration_ms: number;
  quality_score: number | null;
  model_name: string | null;
  chapter: {
    chapter_id: string;
    chapter_number: number;
    title: string | null;
  } | null;
  created_at: string;
}

export interface DailyWords {
  date: string;
  words: number;
  versions: number;
}

export interface StoryHealth {
  project_name: string;
  total_chapters: number;
  completed: number;
  in_progress: number;
  empty: number;
  total_words: number;
  chapter_words: Array<{
    chapter_number: number;
    title: string;
    word_count: number;
  }>;
  foreshadowing: {
    open: number;
    resolved: number;
    abandoned: number;
  };
  character_frequency: Record<string, number>;
}

export const analyticsApi = {
  getOverview: () => client.get<AnalyticsOverview>('/analytics/overview'),

  getMonthly: (months = 6) => client.get<MonthlyStats[]>(`/analytics/monthly?months=${months}`),

  getByModel: () => client.get<ModelStats[]>('/analytics/by-model'),

  getByProject: () => client.get<ProjectStats[]>('/analytics/by-project'),

  getRecent: (limit = 20) => client.get<RecentActivity[]>(`/analytics/recent?limit=${limit}`),

  getDailyWords: (days = 365) => client.get<DailyWords[]>(`/analytics/daily-words?days=${days}`),

  getStoryHealth: (projectId: string) => client.get<StoryHealth>(`/projects/${projectId}/health`),
};
