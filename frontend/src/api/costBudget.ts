import client from './client';

export interface CostBudget {
  id: string;
  monthly_limit: number;
  current_usage: number;
  month: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
  usage: number;
}

export interface UsageHistoryItem {
  month: string;
  usage: number;
  limit: number;
}

export interface CostBudgetUpdate {
  monthly_limit: number;
}

export const costBudgetApi = {
  getCurrent: () => client.get<CostBudget>('/cost-budget'),

  update: (data: CostBudgetUpdate) => client.put<CostBudget>('/cost-budget', data),

  check: () => client.get<BudgetCheck>('/cost-budget/check'),

  getHistory: (months?: number) =>
    client.get<UsageHistoryItem[]>('/cost-budget/history', { params: months ? { months } : {} }),
};
