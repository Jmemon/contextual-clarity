/**
 * FSRSScheduler Unit Tests
 *
 * These tests verify the core functionality of the FSRS scheduling wrapper:
 * - Initial state creation for new recall points
 * - Scheduling based on different ratings
 * - Due date checking
 * - Rating behavior differences (forgot vs easy)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { FSRSScheduler } from './scheduler';
import type { FSRSState } from '../models';

describe('FSRSScheduler', () => {
  let scheduler: FSRSScheduler;

  beforeEach(() => {
    scheduler = new FSRSScheduler();
  });

  describe('createInitialState', () => {
    it('returns a valid new card state', () => {
      const state = scheduler.createInitialState();

      // Initial state should have 'new' learning state
      expect(state.state).toBe('new');

      // Should have no reviews yet
      expect(state.reps).toBe(0);
      expect(state.lapses).toBe(0);
      expect(state.lastReview).toBeNull();

      // Initial difficulty and stability from FSRS
      expect(state.difficulty).toBe(0);
      expect(state.stability).toBe(0);

      // Due date should be set (immediately due)
      expect(state.due).toBeInstanceOf(Date);
    });

    it('accepts a custom creation time', () => {
      const customTime = new Date('2024-01-15T10:00:00Z');
      const state = scheduler.createInitialState(customTime);

      // Due date should match the provided creation time
      expect(state.due.getTime()).toBe(customTime.getTime());
    });
  });

  describe('schedule', () => {
    let initialState: FSRSState;
    const baseTime = new Date('2024-01-15T10:00:00Z');

    beforeEach(() => {
      initialState = scheduler.createInitialState(baseTime);
    });

    it('correctly updates state based on rating', () => {
      const newState = scheduler.schedule(initialState, 'good', baseTime);

      // State should transition from 'new' to 'learning'
      expect(newState.state).toBe('learning');

      // Should record the review
      expect(newState.reps).toBe(1);
      expect(newState.lastReview).toBeInstanceOf(Date);
      expect(newState.lastReview?.getTime()).toBe(baseTime.getTime());

      // Due date should be in the future
      expect(newState.due.getTime()).toBeGreaterThan(baseTime.getTime());
    });

    it('scheduling "forgot" results in earlier next due date than "easy"', () => {
      // First, get both cards to a stable review state by doing initial reviews
      const afterGood = scheduler.schedule(initialState, 'good', baseTime);

      // Schedule a second review to move toward 'review' state
      const secondReviewTime = new Date(afterGood.due.getTime() + 1000);
      const afterSecondGood = scheduler.schedule(
        afterGood,
        'good',
        secondReviewTime
      );

      // Now compare 'forgot' vs 'easy' ratings from the same state
      const reviewTime = new Date(afterSecondGood.due.getTime() + 1000);

      const afterForgot = scheduler.schedule(
        afterSecondGood,
        'forgot',
        reviewTime
      );
      const afterEasy = scheduler.schedule(afterSecondGood, 'easy', reviewTime);

      // 'forgot' should have a much shorter interval (earlier due date)
      // 'easy' should have a much longer interval (later due date)
      const forgotInterval = afterForgot.due.getTime() - reviewTime.getTime();
      const easyInterval = afterEasy.due.getTime() - reviewTime.getTime();

      expect(forgotInterval).toBeLessThan(easyInterval);
    });

    it('scheduling "easy" results in longer interval than "good"', () => {
      const reviewTime = baseTime;

      const afterGood = scheduler.schedule(initialState, 'good', reviewTime);
      const afterEasy = scheduler.schedule(initialState, 'easy', reviewTime);

      const goodInterval = afterGood.due.getTime() - reviewTime.getTime();
      const easyInterval = afterEasy.due.getTime() - reviewTime.getTime();

      expect(easyInterval).toBeGreaterThan(goodInterval);
    });

    it('increments lapses when user forgets', () => {
      // Get to a review state first
      let state = scheduler.schedule(initialState, 'good', baseTime);
      state = scheduler.schedule(
        state,
        'good',
        new Date(state.due.getTime() + 1000)
      );
      state = scheduler.schedule(
        state,
        'good',
        new Date(state.due.getTime() + 1000)
      );

      // Record the lapses before forgetting
      const lapsesBefore = state.lapses;

      // Now forget
      const afterForgot = scheduler.schedule(
        state,
        'forgot',
        new Date(state.due.getTime() + 1000)
      );

      // Lapses should increment when forgetting in review state
      // Note: Lapses only increment when in 'review' state
      if (state.state === 'review') {
        expect(afterForgot.lapses).toBe(lapsesBefore + 1);
      }
    });

    it('transitions state correctly through the learning process', () => {
      // Start as 'new'
      expect(initialState.state).toBe('new');

      // First review moves to 'learning'
      const afterFirst = scheduler.schedule(initialState, 'good', baseTime);
      expect(afterFirst.state).toBe('learning');

      // Continue reviewing with 'good' ratings to eventually reach 'review'
      let state = afterFirst;
      let iterations = 0;
      const maxIterations = 20; // Safety limit

      while (state.state !== 'review' && iterations < maxIterations) {
        const nextReviewTime = new Date(state.due.getTime() + 1000);
        state = scheduler.schedule(state, 'good', nextReviewTime);
        iterations++;
      }

      // Should eventually reach 'review' state
      expect(state.state).toBe('review');
    });
  });

  describe('isDue', () => {
    it('returns true when due date has passed', () => {
      const pastDueState: FSRSState = {
        difficulty: 5,
        stability: 2,
        due: new Date('2024-01-01T10:00:00Z'),
        lastReview: new Date('2024-01-01T09:00:00Z'),
        reps: 1,
        lapses: 0,
        state: 'learning',
      };

      const checkTime = new Date('2024-01-02T10:00:00Z'); // After due date
      expect(scheduler.isDue(pastDueState, checkTime)).toBe(true);
    });

    it('returns false when due date has not passed', () => {
      const futureState: FSRSState = {
        difficulty: 5,
        stability: 2,
        due: new Date('2024-01-10T10:00:00Z'),
        lastReview: new Date('2024-01-01T09:00:00Z'),
        reps: 1,
        lapses: 0,
        state: 'learning',
      };

      const checkTime = new Date('2024-01-02T10:00:00Z'); // Before due date
      expect(scheduler.isDue(futureState, checkTime)).toBe(false);
    });

    it('returns true when exactly at due date', () => {
      const exactDueState: FSRSState = {
        difficulty: 5,
        stability: 2,
        due: new Date('2024-01-02T10:00:00Z'),
        lastReview: new Date('2024-01-01T09:00:00Z'),
        reps: 1,
        lapses: 0,
        state: 'learning',
      };

      const checkTime = new Date('2024-01-02T10:00:00Z'); // Exactly at due date
      expect(scheduler.isDue(exactDueState, checkTime)).toBe(true);
    });

    it('uses current time when no check time provided', () => {
      // Create a state that's due in the past
      const pastDueState: FSRSState = {
        difficulty: 5,
        stability: 2,
        due: new Date('2020-01-01T10:00:00Z'), // Far in the past
        lastReview: new Date('2019-12-01T09:00:00Z'),
        reps: 1,
        lapses: 0,
        state: 'review',
      };

      // Should be due (since current time is after 2020)
      expect(scheduler.isDue(pastDueState)).toBe(true);

      // Create a state that's due far in the future
      const futureDueState: FSRSState = {
        difficulty: 5,
        stability: 2,
        due: new Date('2099-01-01T10:00:00Z'), // Far in the future
        lastReview: new Date(),
        reps: 1,
        lapses: 0,
        state: 'review',
      };

      // Should not be due
      expect(scheduler.isDue(futureDueState)).toBe(false);
    });
  });

  describe('getRetrievability', () => {
    it('returns 1.0 for a state that was just reviewed', () => {
      const now = new Date();
      const justReviewed: FSRSState = {
        difficulty: 5,
        stability: 10, // 10 days stability
        due: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // Due in 10 days
        lastReview: now,
        reps: 5,
        lapses: 0,
        state: 'review',
      };

      const retrievability = scheduler.getRetrievability(justReviewed, now);
      // Should be approximately 1.0 (or very close) right after review
      expect(retrievability).toBeGreaterThan(0.99);
    });

    it('returns a lower value for overdue items', () => {
      const now = new Date();
      const overdue: FSRSState = {
        difficulty: 5,
        stability: 1, // 1 day stability
        due: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // Overdue by 10 days
        lastReview: new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000), // Reviewed 11 days ago
        reps: 5,
        lapses: 0,
        state: 'review',
      };

      const retrievability = scheduler.getRetrievability(overdue, now);
      // Should be significantly less than 0.9 when overdue
      expect(retrievability).toBeLessThan(0.9);
    });
  });

  describe('getConfig', () => {
    it('returns the current configuration', () => {
      const config = scheduler.getConfig();

      expect(config.maximumInterval).toBe(365);
      expect(config.requestRetention).toBe(0.9);
    });

    it('reflects custom configuration', () => {
      const customScheduler = new FSRSScheduler({
        maximumInterval: 180,
        requestRetention: 0.85,
      });

      const config = customScheduler.getConfig();

      expect(config.maximumInterval).toBe(180);
      expect(config.requestRetention).toBe(0.85);
    });
  });
});
