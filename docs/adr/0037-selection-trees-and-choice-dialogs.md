# ADR 0037: Selection trees and choice dialogs

- Status: Accepted
- Date: 2026-11-06

## Decision

Add the general custom field kind `tree_choice` (Selection tree / Auswahlbaum), available for object and relationship-owned fields. Like `multiple_choice`, its values are UUID arrays; its option dictionary remains in the field's JSONB configuration. Each option has at most one optional `parentId` referring to an option in that same dictionary. Category retains its standard-field identity and UUID-array storage, with configurable single, multiple or tree selection; tree mode is represented by `category.tree: true` and `category.multiple: true`. Category parent IDs refer only to Category options of the same object. Type/Status keep their separate semantics.

Selecting a node selects that node and all its ancestors. Selecting a parent alone does not select its children. Deselecting a node removes it and all descendants; independently selected branches remain. Persist the complete ancestor-closed set in canonical UUID order, without a second explicit/implicit selection state. Parent filters therefore match records selected through a descendant. Every web/API/MCP write and default uses this closure through shared helpers and backend validation.

Require unique option identities, existing same-dictionary parents, an acyclic hierarchy and at most 20 ancestor levels. Retain the existing limits of 300 dictionary options and 100 selected UUIDs, including ancestors. Active children require active ancestors. Configuration activation includes ancestors; deactivation includes descendants. Existing inactive selections remain readable/retainable, but cannot be newly assigned. Retain option identities and labels for journal interpretation; hierarchy membership is not a permission rule.

## Configuration and conversion

Use the existing translated choice editor for labels/lifecycle and sibling ordering, supplemented by a parent Select excluding the current node, descendants and invalid-depth parents. Show parent paths in configuration. Selecting a new parent does not recreate the option ID. Keep field explanations, defaults, requiredness and configuration permissions shared with the other field kinds.

Preflight all existing contents, including recycled records, when changing kind or hierarchy. Add missing ancestors atomically to existing selections, increment affected record versions and append one field-change journal per affected record in the same change group. Category configuration uses the same rule. Journal option parent changes as definition changes. Roll back contents, definitions and journal together on any failure. Moving from tree to flat multiple selection preserves every selected UUID and clears dictionary parents; moving to single choice requires at most one existing UUID and otherwise fails without deleting ancestor selections. Same-kind tree changes preserve valid inactive values. Requiredness and field/object/edge rights continue to apply.

## Record UI

Render multiple-choice and tree-choice fields, including multiple/tree Category and defaults, as a read-only summary field with an adjacent selection button. Open one shared standard shadcn Dialog: searchable checkbox list or collapsible tree, selected count, Clear, Cancel and Apply. Tree search preserves ancestor paths; tree keyboard controls support arrows, Home/End and Space/Enter in addition to normal checkbox/list navigation. Applying changes updates the surrounding form draft; normal record/configuration Save persists it. Pending dialog selections participate in the common navigation/live-refresh guard. The save shortcut applies this dialog first; concurrent record changes retain the dialog draft and use the normal three-way review after Apply. Unchanged selections cannot be submitted. Closing/cancelling the picker leaves the enclosing value unchanged. Single choice remains a normal Select.

The three demo workspaces show single/multiple/tree Category across standard and custom objects. Custom asset/equipment objects also demonstrate a general Areas tree field independent of Category. Keep translated configuration labels, English fictional contents, workspace-specific number conventions, current rights and existing authored/default layouts.

## Consequences

No new business object or relationship represents a choice node. This extends ADRs 0006/0007; it does not make Type/Status hierarchical. The unreleased installation baseline adds the new `sys_fields.kind` constraint value, so disposable development databases are recreated from the current schema and demo seed. Released upgrades will follow the dedicated update policy.
