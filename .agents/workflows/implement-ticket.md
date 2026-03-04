---
description: Run this when implementing a single ticket
---

You are implementing exactly one ticket for the mai-reminder MVP. Follow the workflow below.

## Input

The user will provide a ticket ID (e.g. E0-01) or say "next" to use the first unchecked ticket in Sprint\*.md.

## Context files (read as needed)

- Requirements.md
- Sprint\*.md
- CLAUDE.md

## Scope

- Implement ONLY the specified ticket.
- Do not work on future tickets.
- Keep changes minimal.

## TDD workflow (mandatory)

1. **Red:** Add or adjust tests first. Run tests and show failing output.
2. **Green:** Implement minimal code to pass tests. **Important:** Strictly avoid using `any` in tests or implementation (e.g., use `unknown` or define proper mock types) to prevent `@typescript-eslint/no-explicit-any` linter errors.
3. **Refactor:** Clean up while keeping tests green and lint-free.

## Use up-to-date Documentation

Use [context7] MCP to check up-to-date docs when needed when implementing new libraries or frameworks, or adding features using them.

## Validation

After implementation, run and report:

- npm run test
- npm run lint
- npm run typecheck

###Review

### 1. Code Quality Review (mandatory)

After validation passes, you MUST run the Code Quality Review using
@code-quality-reviewer skill

Provide the code quality reviewer with:

- List of changed files
- Complete file contents of each changed file
- Git diff if available
- **Important**: Ignore changes to package.lock, package.json and .md files

Wait for the review and address any critical or high-severity issues before proceeding.

### 2. Electron Security Review (conditional)

If the ticket involves Electron IPC changes (main process, preload scripts, or IPC handlers), also run the Electron Security review using
@electron-security skill

Provide the electron security reviewer with:

- List of changed files related to Electron IPC
- Complete file contents of each changed file

Wait for the reviews and address any critical or high-severity issues before proceeding.

If ticket is not related to Electron IPC, skip this step.

### 3. Accessibility Review (conditional)

If the ticket involves User Interface Changes, also run the Accessibility Review using
@a11y-reviewer skill

Provide the accessibility rerviewer with:

- List of changed files related to User Interface
- Complete file contents of each changed file

Wait for the reviews and address any critical or high-severity issues before proceeding.

If ticket is not related to User Interface, skip this step.

## Deliverables

- List of changed files
- Short rationale for the change
- Commands run and their outcomes
- Remaining risks or follow-ups

## Finishing

If tests show no errors, mark the ticket as Done in the sprint file and commit the changes.
