export interface TripCanvas {
  title: string;
  narrative: string;
  steps: TripStep[];
  valueStream: ValueStream;
}

export interface TripStep {
  type: 'travel' | 'lodging' | 'activity';
  description: string;
  details: string;
  cost: number;
  valueProposition: string;
}

export interface ValueStream {
  totalCost: number;
  totalValue: number;
  savings: number;
  valueInsights: ValueInsight[];
}

export interface ValueInsight {
  description: string;
  type: 'cost-saving' | 'experience-upgrade' | 'time-saver';
}
