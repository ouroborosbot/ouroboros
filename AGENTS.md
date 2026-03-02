## Planning/Doing Workflow (STRICT)

Task docs go in `docs/tasks/` with naming scheme `YYYY-MM-DD-HHMM-{planning|doing}-<slug>.md`.

1. **Plan**: Launch work-planner agent. It produces a planning doc.
2. **Review**: Show the user the planning doc path and STOP. Wait for explicit user approval.
3. **Convert**: Only after user approves the planning doc, resume work-planner to convert to a doing doc. User must also review and sign off on the doing doc before implementation. Suggest starting a new session for work-doer (it often runs on a different machine).
4. **Implement**: Only after user explicitly asks, launch work-doer agent to execute the doing doc. Never implement inside work-planner.
5. **Never self-approve**: Do not say "looks good" and proceed. The user reviews every planning and doing doc.
