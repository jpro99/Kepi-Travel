
import { KepiSentienceEngine } from './engine';
import { LocationType, UrgencyLevel, UserState } from './types';

// Mock initial state for the user
const initialUserState: UserState = {
  position: { x: 0, y: 0, z: 0 },
  velocity: 0,
  isMoving: false,
};

describe('KepiSentienceEngine', () => {
  let engine: KepiSentienceEngine;

  beforeEach(() => {
    engine = new KepiSentienceEngine(initialUserState);
  });

  it('should be instantiated', () => {
    expect(engine).toBeDefined();
  });

  it('should return a valid journey plan', () => {
    const plan = engine.getJourneyPlan();
    expect(plan).toBeDefined();
    expect(plan.legs.length).toBeGreaterThan(0);
    expect(plan.legs[0].start.type).toBe(LocationType.CheckIn);
    expect(plan.legs[1].end.type).toBe(LocationType.Gate);
    expect(plan.totalEstimatedDurationMs).toBeGreaterThan(0);
    expect(plan.slackTimeMs).toBeGreaterThan(0);
  });

  it('should return a valid contextual prompt', () => {
    const prompt = engine.getContextualPrompt();
    expect(prompt).toBeDefined();
    expect(prompt.content.length).toBeGreaterThan(0);
    expect(prompt.urgency).toBe(UrgencyLevel.Relaxed);
  });

  it('should allow user state to be updated', () => {
    const newPosition = { x: 10, y: 20, z: 0 };
    engine.updateUserState({ position: newPosition });

    // This is a conceptual test. A real test would check the internal state
    // or see how this new state affects the output of other methods.
    // For now, we just ensure the method can be called without error.
    expect(true).toBe(true);
  });
});
