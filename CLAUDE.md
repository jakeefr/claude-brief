# claude-brief

TypeScript CLI tool. Agent session digest and history browser for Claude Code.

## Stack
- TypeScript + Commander.js + Ink (React for terminals) + tsup bundler
- SQLite (better-sqlite3) for local storage
- Single-file HTML web viewer (no build step)

## Rules
- Never import from @openclaw/* packages -- declare types inline
- All timestamps stored as UTC Unix milliseconds in SQLite
- Never log or display user prompt content -- only metadata
- Use path.join(os.homedir(), ...) for all home directory paths (Windows compatibility)
- Cost estimates always prefixed with ~ when using fallback pricing
- Run `npm run build` to compile TypeScript before testing CLI

## Commands
- `npm run build` -- compile with tsup
- `npm run dev` -- watch mode
- `npm test` -- run Jest tests
- `npm run lint` -- ESLint

## Demo recording
- Run `npx tsx scripts/capture-demo.ts` to generate assets/demo.gif
- Uses Playwright to capture scripts/record-demo.html (animated terminal simulator)
- ffmpeg converts frames to GIF -- requires ffmpeg on PATH
- To update demo data, edit the output lines in scripts/record-demo.html

## Key files
- src/cli.ts -- Commander.js entry point
- src/collector/parser.ts -- JSONL parser (most critical file)
- src/brief/generator.ts -- Digest generation logic
- src/tui/App.tsx -- Root Ink component
- src/web/viewer.html -- Self-contained web dashboard
