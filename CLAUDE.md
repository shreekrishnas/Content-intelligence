# CLAUDE.md

## Rules

1. Every button, link, icon, and form you create MUST have a working handler. No decorative UI.
2. Every API/data call MUST handle loading, success, error, and empty states visibly to the user.
3. Every import MUST point to a real file that exports what you're importing. Verify before writing.
4. After any create/update/delete, the UI MUST reflect the change without manual page refresh.
5. No TODOs, no stubs, no mock data, no placeholder functions. Finish what you start.
6. Follow existing patterns in the codebase. Don't invent new conventions.
7. If a feature depends on something that doesn't exist yet, say so and ask — don't mock it.

## How to work

- Only read files relevant to the current task. Don't scan the full repo unless asked.
- Before editing a file, read it first. After editing, re-read to confirm the edit is correct.
- Build data layer before UI. Confirm the query/API works before wiring it to a component.
- Handle the sad paths: what if the API fails? What if the list is empty? What if input is invalid?

## Before saying done

Go through every change you made and check:

- Does each button/form/link I touched actually work end to end?
- Does each API call show loading while fetching, error on failure, empty state when no data?
- Are all imports valid? Any function I created but never called? Any state I set but never read?
- After a mutation (create/edit/delete), does the UI update without refresh?
- Any TypeScript or lint errors? Fix them.
- Any console errors? Fix them.
- Works on mobile width? No overflow or hidden elements?

If anything fails, fix it before reporting done.

## Communication

- Don't say "done" if it's not. Say what works and what doesn't.
- Don't explain what you're about to do. Just do it.
- If unsure about a requirement, ask. Don't guess.
- If something is broken that you didn't break, flag it but don't fix it unless asked.
