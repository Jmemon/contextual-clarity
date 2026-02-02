/**
 * Contextual Clarity - Entry Point
 *
 * A conversational spaced repetition system combining FSRS scheduling
 * with Socratic AI dialogs to help users deeply internalize knowledge.
 *
 * This file serves as the main entry point for the application.
 * Currently a placeholder that will be expanded in later phases to:
 * - Initialize the HTTP server (Phase 3)
 * - Set up API routes
 * - Configure middleware
 *
 * For CLI usage, see src/cli/index.ts (Phase 1)
 */

// Verify core dependencies are importable
import { z } from 'zod';
import { Hono } from 'hono';

// Create a minimal Hono app to verify the framework is working
// This will be expanded in Phase 3 to serve the full API
const app = new Hono();
app.get('/', (c) => c.text('Contextual Clarity API'));

// Simple validation that the project is set up correctly
const StartupSchema = z.object({
  name: z.string(),
  version: z.string(),
  environment: z.enum(['development', 'production', 'test']).default('development'),
});

const config = StartupSchema.parse({
  name: 'contextual-clarity',
  version: '0.1.0',
  environment: process.env.NODE_ENV || 'development',
});

console.log(`[Contextual Clarity] v${config.version}`);
console.log(`[Environment] ${config.environment}`);
console.log('[Status] Project scaffolding complete!');
console.log('');
console.log('Next steps:');
console.log('  1. Copy .env.example to .env and add your ANTHROPIC_API_KEY');
console.log('  2. Run: bun run db:generate');
console.log('  3. Run: bun run db:migrate');
console.log('  4. Run: bun run db:seed');
console.log('  5. Run: bun run cli list');
