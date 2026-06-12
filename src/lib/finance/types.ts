export interface FinancialProfile {
  expenseReportingEnabled: boolean;
  rewardsOptimizationEnabled: boolean;
  connectedCards: CreditCard[];
}

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  last4: string;
}

export interface Expense {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  timestamp: string;
  tripId: string;
}
