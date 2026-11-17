// Retired after a production task was mutated by a test Session of the same Bot.
// Fail before importing API helpers, exchanging credentials, or submitting any task.
console.error('CONTINUITY_LIVE_RETIRED use node --test tests/naumi-bot-task-integrity.test.mjs; isolated Session/HTTP acceptance only');
process.exitCode=2;
