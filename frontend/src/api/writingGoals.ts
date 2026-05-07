import client from './client';

export interface WritingGoal {
  id: string;
  project_id: string;
  type: string;
  target: number;
  start_date: string;
  end_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WritingGoalCreate {
  type: string;
  target: number;
  start_date: string;
  end_date: string;
  notes?: string;
}

export interface WritingGoalUpdate {
  type?: string;
  target?: number;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

export interface WritingGoalProgress {
  goal: WritingGoal;
  current: number;
  target: number;
  progress_percent: number;
  consecutive_days: number;
  total_days: number;
  days_remaining: number;
}

export interface ProjectGoalsProgress {
  project_id: string;
  today: string;
  today_goal: {
    goal_id: string;
    goal_type: string;
    target: number;
    current: number;
    achieved: boolean;
  } | null;
  streak_days: number;
  calendar_marks: Array<{
    date: string;
    words: number;
    target: number;
    achieved: boolean;
    missed: boolean;
  }>;
}

export const GOAL_TYPES = [
  { value: 'daily_words', label: '每日字数' },
  { value: 'weekly_chapters', label: '每周章节' },
  { value: 'deadline', label: '截止日期' },
];

export const writingGoalsApi = {
  list: (projectId: string) =>
    client.get<WritingGoal[]>(`/projects/${projectId}/goals`),

  create: (projectId: string, data: WritingGoalCreate) =>
    client.post<WritingGoal>(`/projects/${projectId}/goals`, data),

  projectProgress: (projectId: string) =>
    client.get<ProjectGoalsProgress>(`/projects/${projectId}/goals/progress`),

  get: (goalId: string) =>
    client.get<WritingGoal>(`/goals/${goalId}`),

  update: (goalId: string, data: WritingGoalUpdate) =>
    client.put<WritingGoal>(`/goals/${goalId}`, data),

  delete: (goalId: string) =>
    client.delete(`/goals/${goalId}`),

  progress: (goalId: string) =>
    client.get<WritingGoalProgress>(`/goals/${goalId}/progress`),
};
