# Workspace Agent Rules

## Ponytail: Lazy Senior Dev Code Ladder

Inspired by [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

Before writing any code, stop at the **first rung of this ladder that holds**:

```
1. Does this need to exist?      → no: skip it (YAGNI)
2. Already in this codebase?     → reuse it, don't rewrite
3. Stdlib / built-in does it?    → use it
4. Native platform feature?      → use it (e.g. <input type="date"> not flatpickr)
5. Already-installed dependency? → use it
6. Can it be done in one line?   → write one line
7. Only then: write the minimum that works
```

**Lazy about the solution, never about understanding the problem.**
Always read the relevant code and trace the real flow before picking a rung.

**Never cut:**
- Input validation and trust-boundary checks
- Error handling and data-loss guards
- Security controls
- Accessibility

When applying any of the first 6 rungs, add a brief inline comment explaining why
(e.g. `<!-- ponytail: browser has one -->` or `# stdlib covers this`).
