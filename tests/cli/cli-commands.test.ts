/**
 * CLI Command Tests
 *
 * These tests verify that all CLI commands work correctly by:
 * 1. Executing the CLI as a subprocess (like a real user would)
 * 2. Testing argument parsing and validation
 * 3. Testing error handling for invalid inputs
 * 4. Testing output format and content
 *
 * The tests use a fresh database for each test to ensure isolation.
 * Note: The `session` command requires an Anthropic API key and user interaction,
 * so it's tested separately for validation only.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { resolve, join } from 'path';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import * as schema from '../../src/storage/schema';
import { RecallSetRepository, RecallPointRepository, SessionRepository, SessionMessageRepository } from '../../src/storage/repositories';
import { SessionMetricsRepository } from '../../src/storage/repositories/session-metrics.repository';
import { RecallOutcomeRepository } from '../../src/storage/repositories/recall-outcome.repository';
import { RabbitholeEventRepository } from '../../src/storage/repositories/rabbithole-event.repository';
import { FSRSScheduler } from '../../src/core/fsrs';
import type { AppDatabase } from '../../src/storage/db';

// Test database path - unique for CLI tests to avoid conflicts
const TEST_DB_PATH = resolve(import.meta.dir, '../../test-cli.db');
const TEST_EXPORT_DIR = resolve(import.meta.dir, '../../test-exports');

/**
 * Cleans up all test artifacts including database files and exports.
 * Called in afterEach and afterAll to ensure no trace remains.
 */
function cleanupTestArtifacts(): void {
  // Clean up database file and any SQLite journal files (WAL, SHM)
  const dbFiles = [
    TEST_DB_PATH,
    `${TEST_DB_PATH}-wal`,
    `${TEST_DB_PATH}-shm`,
    `${TEST_DB_PATH}-journal`,
  ];
  for (const file of dbFiles) {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  // Clean up export directory
  if (existsSync(TEST_EXPORT_DIR)) {
    try {
      rmSync(TEST_EXPORT_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Clean up any default export files that might have been created in cwd
  // These are created when CLI export runs without --output flag
  const projectRoot = resolve(import.meta.dir, '../..');
  const defaultExportPatterns = [
    'session-sess_cli_*.json',
    'session-sess_cli_*.csv',
    'recall-set-*.json',
    'recall-set-*.csv',
    'analytics-*.json',
    'analytics-*.csv',
  ];

  try {
    const { readdirSync } = require('fs');
    const files = readdirSync(projectRoot);
    for (const file of files) {
      // Check if file matches any of our test export patterns
      if (file.startsWith('session-sess_cli_') ||
          file.startsWith('recall-set-CLI') ||
          file.startsWith('analytics-CLI')) {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Executes a CLI command and returns the result
 */
async function runCli(args: string[], env?: Record<string, string>): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(['bun', 'run', 'src/cli/index.ts', ...args], {
    cwd: resolve(import.meta.dir, '../..'),
    env: {
      ...process.env,
      DATABASE_PATH: TEST_DB_PATH,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Creates and migrates a test database
 */
function createTestDatabase(): { db: AppDatabase; sqlite: Database } {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  const sqlite = new Database(TEST_DB_PATH);
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  const migrationsFolder = resolve(import.meta.dir, '../../drizzle');
  migrate(db, { migrationsFolder });
  return { db, sqlite };
}

/**
 * Seeds test data for CLI testing
 */
async function seedTestData(
  recallSetRepo: RecallSetRepository,
  recallPointRepo: RecallPointRepository,
  sessionRepo: SessionRepository,
  messageRepo: SessionMessageRepository,
  metricsRepo: SessionMetricsRepository,
  outcomeRepo: RecallOutcomeRepository,
  scheduler: FSRSScheduler
) {
  const now = new Date();
  const initialState = scheduler.createInitialState(now);

  // Create recall sets with different statuses
  const activeSet = await recallSetRepo.create({
    id: 'rs_cli_test_active',
    name: 'CLI Test Active',
    description: 'Active recall set for CLI testing',
    status: 'active',
    discussionSystemPrompt: 'Help the user learn about testing the CLI.',
  });

  const pausedSet = await recallSetRepo.create({
    id: 'rs_cli_test_paused',
    name: 'CLI Test Paused',
    description: 'Paused recall set',
    status: 'paused',
    discussionSystemPrompt: 'Paused set prompt.',
  });

  const archivedSet = await recallSetRepo.create({
    id: 'rs_cli_test_archived',
    name: 'CLI Test Archived',
    description: 'Archived recall set',
    status: 'archived',
    discussionSystemPrompt: 'Archived set prompt.',
  });

  // Create recall points
  const point1 = await recallPointRepo.create({
    id: 'rp_cli_1',
    recallSetId: activeSet.id,
    content: 'Test point 1 content',
    context: 'Test context 1',
    fsrsState: initialState,
  });

  const point2 = await recallPointRepo.create({
    id: 'rp_cli_2',
    recallSetId: activeSet.id,
    content: 'Test point 2 content',
    context: 'Test context 2',
    fsrsState: initialState,
  });

  // Create a completed session with messages and metrics
  const completedSession = await sessionRepo.create({
    id: 'sess_cli_completed',
    recallSetId: activeSet.id,
    targetRecallPointIds: ['rp_cli_1', 'rp_cli_2'],
    startedAt: new Date(Date.now() - 3600000),
  });
  await sessionRepo.update(completedSession.id, {
    status: 'completed',
    endedAt: new Date(Date.now() - 3000000),
  });

  // Add messages
  await messageRepo.create({
    id: 'msg_cli_1',
    sessionId: completedSession.id,
    role: 'assistant',
    content: 'Let me ask you about the first concept.',
    timestamp: new Date(Date.now() - 3600000),
    tokenCount: 20,
  });

  await messageRepo.create({
    id: 'msg_cli_2',
    sessionId: completedSession.id,
    role: 'user',
    content: 'I remember the test point 1 content.',
    timestamp: new Date(Date.now() - 3540000),
    tokenCount: 15,
  });

  await messageRepo.create({
    id: 'msg_cli_3',
    sessionId: completedSession.id,
    role: 'assistant',
    content: 'Great! Let us move on to the next topic.',
    timestamp: new Date(Date.now() - 3480000),
    tokenCount: 18,
  });

  // Add metrics
  await metricsRepo.create({
    id: 'sm_cli_1',
    sessionId: completedSession.id,
    durationMs: 600000,
    activeTimeMs: 550000,
    avgUserResponseTimeMs: 5000,
    avgAssistantResponseTimeMs: 2000,
    recallPointsAttempted: 2,
    recallPointsSuccessful: 2,
    recallPointsFailed: 0,
    overallRecallRate: 1.0,
    avgConfidence: 0.9,
    totalMessages: 3,
    userMessages: 1,
    assistantMessages: 2,
    avgMessageLength: 30,
    rabbitholeCount: 0,
    totalRabbitholeTimeMs: 0,
    avgRabbitholeDepth: 0,
    inputTokens: 500,
    outputTokens: 300,
    totalTokens: 800,
    estimatedCostUsd: 0.008,
    engagementScore: 85,
    calculatedAt: new Date(),
  });

  // Add recall outcomes
  await outcomeRepo.createMany([
    {
      id: 'ro_cli_1',
      sessionId: completedSession.id,
      recallPointId: 'rp_cli_1',
      success: true,
      confidence: 0.9,
      rating: 'good',
      reasoning: 'Clear understanding',
      messageIndexStart: 0,
      messageIndexEnd: 2,
      timeSpentMs: 300000,
      createdAt: new Date(),
    },
    {
      id: 'ro_cli_2',
      sessionId: completedSession.id,
      recallPointId: 'rp_cli_2',
      success: true,
      confidence: 0.85,
      rating: 'good',
      reasoning: 'Good recall',
      messageIndexStart: 2,
      messageIndexEnd: 4,
      timeSpentMs: 300000,
      createdAt: new Date(),
    },
  ]);

  // Create an abandoned session
  const abandonedSession = await sessionRepo.create({
    id: 'sess_cli_abandoned',
    recallSetId: activeSet.id,
    targetRecallPointIds: ['rp_cli_1'],
    startedAt: new Date(Date.now() - 7200000),
  });
  await sessionRepo.update(abandonedSession.id, {
    status: 'abandoned',
    endedAt: new Date(Date.now() - 7000000),
  });

  return { activeSet, pausedSet, archivedSet, points: [point1, point2], completedSession, abandonedSession };
}

describe('CLI Commands', () => {
  let db: AppDatabase;
  let sqlite: Database;

  beforeAll(async () => {
    // Clean up any leftover artifacts from previous test runs
    cleanupTestArtifacts();

    // Create export directory for tests
    if (!existsSync(TEST_EXPORT_DIR)) {
      mkdirSync(TEST_EXPORT_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Final cleanup - ensure no test artifacts remain
    cleanupTestArtifacts();
  });

  beforeEach(async () => {
    // Clean up before each test for isolation
    cleanupTestArtifacts();

    // Create export directory if it was cleaned
    if (!existsSync(TEST_EXPORT_DIR)) {
      mkdirSync(TEST_EXPORT_DIR, { recursive: true });
    }

    const testDb = createTestDatabase();
    db = testDb.db;
    sqlite = testDb.sqlite;

    const recallSetRepo = new RecallSetRepository(db);
    const recallPointRepo = new RecallPointRepository(db);
    const sessionRepo = new SessionRepository(db);
    const messageRepo = new SessionMessageRepository(db);
    const metricsRepo = new SessionMetricsRepository(db);
    const outcomeRepo = new RecallOutcomeRepository(db);
    const scheduler = new FSRSScheduler();

    await seedTestData(recallSetRepo, recallPointRepo, sessionRepo, messageRepo, metricsRepo, outcomeRepo, scheduler);

    // Close connection so CLI can access the database
    sqlite.close();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestArtifacts();
  });

  describe('help command', () => {
    it('should display help with no arguments', async () => {
      const { stdout, exitCode } = await runCli([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Contextual Clarity CLI');
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Commands:');
    });

    it('should display help with "help" command', async () => {
      const { stdout, exitCode } = await runCli(['help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Contextual Clarity CLI');
    });

    it('should display help with --help flag', async () => {
      const { stdout, exitCode } = await runCli(['--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Contextual Clarity CLI');
    });
  });

  describe('list command', () => {
    it('should list all recall sets', async () => {
      const { stdout, exitCode } = await runCli(['list']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Available Recall Sets');
      expect(stdout).toContain('CLI Test Active');
      expect(stdout).toContain('CLI Test Paused');
      expect(stdout).toContain('CLI Test Archived');
    });

    it('should show status for each set', async () => {
      const { stdout, exitCode } = await runCli(['list']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('active');
      expect(stdout).toContain('paused');
      expect(stdout).toContain('archived');
    });

    it('should work with alias "ls"', async () => {
      const { stdout, exitCode } = await runCli(['ls']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Available Recall Sets');
    });

    it('should work with alias "l"', async () => {
      const { stdout, exitCode } = await runCli(['l']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Available Recall Sets');
    });
  });

  describe('stats command', () => {
    it('should display stats for a recall set', async () => {
      const { stdout, exitCode } = await runCli(['stats', 'CLI Test Active']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('CLI Test Active');
      expect(stdout).toContain('Overview');
    });

    it('should show error when set name is missing', async () => {
      const { stdout, exitCode } = await runCli(['stats']);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Error');
      expect(stdout).toContain('Recall set name is required');
    });

    it('should show error for non-existent set', async () => {
      const { stdout, stderr, exitCode } = await runCli(['stats', 'NonExistentSet']);
      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/not found|error/i);
    });

    it('should work with "stat" alias', async () => {
      const { stdout, exitCode } = await runCli(['stat', 'CLI Test Active']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('CLI Test Active');
    });
  });

  describe('sessions command', () => {
    it('should list sessions for a recall set', async () => {
      const { stdout, exitCode } = await runCli(['sessions', 'CLI Test Active']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Recent Sessions');
      expect(stdout).toContain('sess_cli_completed');
    });

    it('should show session status', async () => {
      const { stdout, exitCode } = await runCli(['sessions', 'CLI Test Active']);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/completed|abandoned/i);
    });

    it('should show error when set name is missing', async () => {
      const { stdout, exitCode } = await runCli(['sessions']);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Error');
      expect(stdout).toContain('Recall set name is required');
    });

    it('should show error for non-existent set', async () => {
      const { stdout, stderr, exitCode } = await runCli(['sessions', 'NonExistent']);
      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/not found|error/i);
    });
  });

  describe('replay command', () => {
    it('should replay a session transcript', async () => {
      const { stdout, exitCode } = await runCli(['replay', 'sess_cli_completed']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Session Replay');
      expect(stdout).toContain('sess_cli_completed');
    });

    it('should show error when session ID is missing', async () => {
      const { stdout, exitCode } = await runCli(['replay']);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Error');
      expect(stdout).toContain('Session ID is required');
    });

    it('should show error for non-existent session', async () => {
      const { stdout, stderr, exitCode } = await runCli(['replay', 'sess_nonexistent']);
      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/not found|error/i);
    });
  });

  describe('export command', () => {
    describe('export session', () => {
      it('should export a session as JSON', async () => {
        const outputFile = join(TEST_EXPORT_DIR, 'test-session.json');
        const { stdout, exitCode } = await runCli(['export', 'session', 'sess_cli_completed', '--output', outputFile]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Exported');
        expect(existsSync(outputFile)).toBe(true);

        const content = await Bun.file(outputFile).text();
        expect(() => JSON.parse(content)).not.toThrow();

        unlinkSync(outputFile);
      });

      it('should export a session as CSV', async () => {
        const outputFile = join(TEST_EXPORT_DIR, 'test-session.csv');
        const { stdout, exitCode } = await runCli(['export', 'session', 'sess_cli_completed', '--format', 'csv', '--output', outputFile]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Exported');
        expect(existsSync(outputFile)).toBe(true);

        unlinkSync(outputFile);
      });

      it('should show error for non-existent session', async () => {
        const { stdout, stderr, exitCode } = await runCli(['export', 'session', 'sess_nonexistent']);
        expect(exitCode).toBe(1);
        const output = stdout + stderr;
        expect(output).toMatch(/not found|error/i);
      });
    });

    describe('export set', () => {
      it('should export a recall set as JSON', async () => {
        const outputFile = join(TEST_EXPORT_DIR, 'test-set.json');
        const { stdout, exitCode } = await runCli(['export', 'set', 'CLI Test Active', '--output', outputFile]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Exported');
        expect(existsSync(outputFile)).toBe(true);

        const content = await Bun.file(outputFile).text();
        expect(() => JSON.parse(content)).not.toThrow();

        unlinkSync(outputFile);
      });

      it('should show error for non-existent set', async () => {
        const { stdout, stderr, exitCode } = await runCli(['export', 'set', 'NonExistent']);
        expect(exitCode).toBe(1);
        const output = stdout + stderr;
        expect(output).toMatch(/not found|error/i);
      });
    });

    describe('export analytics', () => {
      it('should export analytics as JSON', async () => {
        const outputFile = join(TEST_EXPORT_DIR, 'test-analytics.json');
        const { stdout, exitCode } = await runCli(['export', 'analytics', 'CLI Test Active', '--output', outputFile]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Exported');
        expect(existsSync(outputFile)).toBe(true);

        const content = await Bun.file(outputFile).text();
        expect(() => JSON.parse(content)).not.toThrow();

        unlinkSync(outputFile);
      });

      it('should show error for non-existent set', async () => {
        const { stdout, stderr, exitCode } = await runCli(['export', 'analytics', 'NonExistent']);
        expect(exitCode).toBe(1);
        const output = stdout + stderr;
        expect(output).toMatch(/not found|error/i);
      });
    });

    describe('export help', () => {
      it('should show export help with no subcommand', async () => {
        const { stdout, stderr, exitCode } = await runCli(['export']);
        expect(exitCode).toBe(1);
        const output = stdout + stderr;
        expect(output).toContain('session');
        expect(output).toContain('set');
        expect(output).toContain('analytics');
      });
    });
  });

  describe('unknown command', () => {
    it('should show error for unknown command', async () => {
      const { stdout, exitCode } = await runCli(['foobar']);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Unknown command');
      expect(stdout).toContain('foobar');
    });
  });

  describe('session command validation', () => {
    it('should show error when set name is missing', async () => {
      const { stdout, exitCode } = await runCli(['session']);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Error');
      expect(stdout).toContain('Recall set name is required');
    });

    it('should show error when ANTHROPIC_API_KEY is not set', async () => {
      const { stdout, exitCode } = await runCli(['session', 'CLI Test Active'], {
        ANTHROPIC_API_KEY: '',
      });
      expect(exitCode).toBe(1);
      expect(stdout).toContain('ANTHROPIC_API_KEY');
    });

    it('should work with "start" alias', async () => {
      const { stdout, exitCode } = await runCli(['start'], { ANTHROPIC_API_KEY: '' });
      expect(exitCode).toBe(1);
      expect(stdout).not.toContain('Unknown command');
    });

    it('should work with "s" alias', async () => {
      const { stdout, exitCode } = await runCli(['s'], { ANTHROPIC_API_KEY: '' });
      expect(exitCode).toBe(1);
      expect(stdout).not.toContain('Unknown command');
    });
  });
});
