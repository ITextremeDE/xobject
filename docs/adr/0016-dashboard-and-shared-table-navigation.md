# ADR 0016: Workspace dashboard, shared tables and command navigation

- Status: Accepted
- Date: 2026-10-30

## Decision

Use the official shadcn `base-nova` dashboard-01 composition for the workspace Dashboard: four summary cards, an interactive area chart and a mixed-object record table. Adopt official Chart/Badge primitives and Recharts; keep workspace chart colors and regional formatting. Preserve dashboard-01's semantic card gradients and SVG area gradients, using unique IDs per chart instance. Dashboard and object-list local search both expose `/` and a visible keyboard hint. Dashboard code loads separately from the application shell.

The common API/MCP operations `get_workspace_dashboard` and `list_workspace_records` resolve current authorization before reading business contents. Business-content access remains installation-Administrator-only until the complete content-rights model exists. Other workspace members retain navigation to permitted definitions/settings and see no record-derived dashboard metrics. Workspaces stay isolated, and inactive/deleted object types are excluded from the normal dashboard.

Summary cards count records across active object types, active object definitions, records created within 30 days and distinct records whose current update time differs from creation within seven days. The 7/30/90-day chart uses the effective personal/workspace time zone. It counts record creations by their creation timestamp and distinct edited records per day from record journal events after creation. One record may therefore appear in multiple daily edit counts. Zero days remain zero; no fictional production metrics or trend percentages are injected. Statistics describe active, retained data; they are not a complete lifetime archive of removed objects.

The mixed-object API projects installed active standard fields into a fixed schema. Missing Keyword/Type/Status/Category values remain null; the UI shows an em dash and uses identity when no Keyword exists. Resolve classification labels instead of showing option IDs. Include object identity/label, creator/editor, timestamps and version; never join unrelated custom columns by coincident technical names. Server-side filtering, allow-listed sorting and pagination operate on the combined dataset before a page is returned.

Dashboard and individual object record lists share `RecordDataTable`, column visibility, current-page selection, row menus and `TablePagination`. Selection never implies a bulk mutation. Row actions open the record, optionally open its object list, or copy its ID; no unsupported Delete action is shown. Identity/Keyword stays visible. The footer always shows selected/total counts, page size, page count and first/previous/next/last controls, including empty/single-page results. Search/filter/sort/page/page-size state uses URL parameters; switching size or filter resets the page. Additional Dashboard sections are object-type filter tabs encoded in the URL, not new business objects/modules. Column visibility is a local draft of the mounted view and is not a saved global schema change.

Use the same complete pagination footer for potentially growing user, group, membership, field-definition and account-session tables. Those administrative tables retain their existing explicit actions; record selection does not create administrative bulk actions. The instance Journal also uses this footer. Its filtering and paging remain server-side; already-complete management lists page locally. All table headers use the standard muted semantic surface.

Follow sidebar-02 for search placement below the workspace chooser, with a compact trigger when collapsed. Keep Command/Ctrl+K. The scrollable command menu includes Dashboard, Settings, keyboard help, permitted object definitions, resources and authorized record search. Local navigation works without a two-character minimum; remote record search retains its minimum/debounce. Base UI dialog focus handling and cmdk item navigation remain authoritative. Choosing a destination closes mobile navigation. Keep resource URLs in one shared source.

User menus use the standard example's avatar/profile header and more generous item spacing. Resource links live in a bottom-aligned SidebarContent group, with the user button separately in SidebarFooter, matching the examples' separation.

## Validation

Application tests cover heterogeneous/missing standard fields, classification labels and multi-category projection, global sorting/pagination/filtering, workspace isolation, inactive types, empty dashboards, actual counts/daily activity and API/MCP authorization. Existing tests remain green. Chrome acceptance on a disposable multi-object fixture verified page selection/count/reset, page sizes and navigation in both mixed and single-object lists, column hiding, adding an object section, row menus, command-search results and End/Enter navigation, Settings navigation, collapsed-sidebar access and light/dark rendering. Browser logs contained no errors or warnings. The fixture uses synthetic data and is removed after acceptance.
