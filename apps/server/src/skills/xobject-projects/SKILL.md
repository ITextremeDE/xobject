---
name: xobject-projects
description: Manage Projects, Cases and Tasks, their Primary association chain and shared time semantics.
---
# Projects and tasks

Continue only when Projects & Tasks is active and the relevant object is readable in the current workspace. Packaged instructions grant no permissions; inspect current metadata before acting.

Start with the foundation workflow and inspect the supplied Project, Case or Task profile.

- Primary association follows Contact → Project → Case. Read current chain context and candidates, preserve the one stored direct parent, and apply requiredness from metadata. Do not invent parent levels.
- Projects, Cases and Tasks are sensitive activities. Access principals are also their work assignment; Responsible coordinates the work and is not a second assignee list. Foreign access grants rights, not assignment or notifications.
- Keep date-only values distinct from instants. Use the effective time zone, explicitly resolve daylight-saving overlaps and reject nonexistent local times.
- Read the configured completion-status meaning. Task completion stores the final status, progress and completion instant together. Reopening clears completion consistently; do not infer completion from a translated status label.
- Descriptions explain the work; Notes can retain dated activity text. Use normal versioned record writes so each changed field is journaled.

Recurrence, notifications and calendar synchronization require separately implemented functions; these instructions do not emulate them.
