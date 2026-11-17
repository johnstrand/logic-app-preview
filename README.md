# Azure Logic App Workflow Preview

Interactive, frontend-only web application to paste, upload, and visually inspect **Azure Logic Apps Standard** `workflow.json` files right in your browser — with zero backend or data leaving your machine.

Live site: **https://johnstrand.github.io/logic-app-preview/**

## Features

- **Logic App Standard & WDL Support**: Prioritizes `{ definition, kind }` (`Stateful` / `Stateless`) from `workflow.json`, and also auto-detects bare WDL definitions and Consumption/ARM templates.
- **Interactive Azure-Style Canvas**: Pan, zoom, minimap, and auto-layout powered by `@xyflow/react` and `@dagrejs/dagre`.
- **Inline Collapsible Control Flow**: Renders `Scope`, `Foreach`, `Until`, `If` (`True`/`False` branch lanes), and `Switch` (`Case`/`Default` lanes) with per-node collapse/expand toggles and global Expand/Collapse All controls.
- **Run-After Dependency Visualization**: Color-coded edges and status pills for `Succeeded`, `Failed`, `TimedOut`, and `Skipped` execution paths.
- **Node & Workflow Inspector**: View structured `inputs`, highlighted `@expressions`, clickable `runAfter` dependencies, retry/timeout/concurrency settings, raw JSON, and workflow-level `parameters` and `outputs`.
- **Search & Jump (`Ctrl+K`)**: Quickly filter triggers and actions at any nesting depth and automatically expand/focus the target node.
- **Export & Share**: Download the workflow diagram as **PNG** or **SVG**, or generate an on-demand client-side compressed share link (`#wf=...`).
- **Light & Dark Mode**: Fluent/Azure-inspired theme switcher.

## Local Development

```bash
npm install
npm run dev
```

### Scripts

- `npm run dev` — Start local Vite development server
- `npm test -- --run` — Run parser and layout unit tests (Vitest)
- `npm run build` — Type-check and build static production bundle into `dist/`
- `npm run preview` — Preview the production `dist/` bundle locally
