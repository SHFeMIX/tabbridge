# TabBridge

English · [简体中文](README.zh-CN.md)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

TabBridge is a CLI tool and Skill designed for AI Agents: after user authorization, it allows AI agents to operate on **tabs you already have open** in your real browser through a browser extension—instead of launching a fresh browser instance like Playwright, Puppeteer, or Agent Browser.

## Core Positioning

> Don't open a new browser instance. Connect the agent to your already-open tabs and let AI seamlessly take over.

Traditional browser automation tools spin up a new browser process, which means:

- Already-logged-in accounts must log in again
- Cookies, localStorage, and session state are lost
- Additional authentication steps are required (SMS, 2FA, QR code scans)

TabBridge is different: it takes over **tabs that are already running in your real browser**, letting AI continue working within your existing session.

## Why TabBridge

| Capability | Playwright / Puppeteer / Agent Browser | TabBridge |
|------------|----------------------------------------|-----------|
| Target | Fresh browser instance | Your already-open tabs |
| Login state | Must re-authenticate | Inherits current session |
| Deployment | Needs browser driver or remote infra | Local CLI + browser extension |
| AI-friendliness | Raw HTML, high token cost | Structured Snapshot, token-efficient |
| Dangerous actions | Usually none | Coordinate actions require user confirmation |

## Key Features

- **Session takeover**: connect to the currently active tab or any already-open tab.
- **AI-friendly Snapshot**: converts a page into a structured semantic view with interactive element refs (`@e1`, `@e2`…), helping large models understand pages faster while consuming fewer tokens.
- **Ref-based actions**: perform `click`, `fill`, `type`, `select`, `check`, and more using semantic refs from the latest snapshot.
- **Fine-grained permissions**: explicit user authorization is required before reading or acting; grants expire after 30 minutes and re-authorization is needed when a tab navigates to a different origin. Approval requests shown in the extension popup expire after 5 minutes if not acted on.
- **High-risk action confirmation**: coordinate actions (`click-coordinates`, `drag-coordinates`) must be manually confirmed in the browser extension popup.
- **Local-first**: the CLI communicates with the browser extension through a local WebSocket broker, with no reliance on cloud browser farms.

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent (via Skill)                     │
│                  invokes `tabbridge` commands                │
└───────────────────────────┬─────────────────────────────────┘
                            │ process spawn
┌───────────────────────────▼─────────────────────────────────┐
│                    TabBridge CLI (Node.js)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│                      TabBridge Broker                        │
│                 (local WebSocket server)                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│                   Chrome Extension                           │
│       (offscreen document + content script + popup)          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   User's Webpage                             │
│                 (already-open tab)                           │
└─────────────────────────────────────────────────────────────┘
```

The first `tabbridge` command automatically starts the local broker; you do not need to run it manually.

## Quick Start

### Prerequisites

- Node.js (LTS recommended)
- Chrome / Chromium 116+
- macOS, Windows, or Linux

### 1. Install the CLI

```bash
npm install -g tabbridge
```

After installation, the `tabbridge` command is available globally.

### 2. Install the browser extension

> The extension is not yet on the Chrome Web Store. Until it is published, you need to build and load it manually from source.

Clone the repository, install workspace dependencies from the monorepo root, build the extension with WXT, and load it into Chrome:

```bash
pnpm install
pnpm --filter @tabbridge/chrome-extension build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `packages/chrome-extension/dist/chrome-mv3/` (the directory that contains `manifest.json`).

When you run `tabbridge tabs request-access`, approve the site in the extension popup. You can also revoke or manage access later in the extension details page.

Note: the extension popup UI is currently in Chinese. Approval buttons are 允许 (Allow), 允许一次 (Allow once), and 拒绝 (Deny).

For development, run `pnpm --filter @tabbridge/chrome-extension dev`; WXT outputs to `packages/chrome-extension/dist/chrome-mv3-dev/`.

### 3. Connect and operate a page

Make sure the active tab is a normal `http://` or `https://` page. Internal Chrome pages, extension pages, file URLs, and `about:` pages are not supported in the current version.

```bash
# Check connection status
tabbridge status --json

# List controllable tabs
tabbridge tabs list --json

# Connect to the currently active tab
tabbridge connect --json

# Request access to the page
tabbridge tabs request-access --tab <tabId> --reason "Read page content" --json

# Get an AI-friendly snapshot (`-i` is accepted for compatibility but ignored)
tabbridge snapshot -i --json

# Perform an action
tabbridge click @e1 --json
```

## Snapshot: A Page View Optimized for LLMs

`tabbridge snapshot` does not dump the entire DOM to the model. Instead, it generates a compact semantic representation:

```text
Page: Example
URL: https://example.com

@e1 [button] "Save"
@e2 [textbox] placeholder="Comment"
```

Each `@eN` ref is a temporary label for the current snapshot. The AI can use it to precisely refer to elements without parsing verbose HTML or CSS selectors. Refs are volatile and reassigned on every snapshot, ensuring actions are always based on the latest page state.

## Security & Approval Boundaries

TabBridge puts the security of your browser context first:

- **Site authorization**: each origin requires separate user approval.
- **Session isolation**: no extraction of cookies, localStorage, credentials, or tokens.
- **No arbitrary code execution**: injecting arbitrary JavaScript or intercepting network traffic is not allowed.
- **High-risk confirmation**: coordinate actions require confirmation through the browser extension popup.
- **No silent fallback**: ref actions are never silently replaced by coordinate actions.
- **No secrets in argv**: never pass passwords, 2FA codes, payment details, credentials, or tokens as CLI arguments. Use `type --text-stdin` / `fill --text-stdin` for sensitive input.

## Project Structure

```text
tabbridge/
├── packages/
│   ├── cli/              # TabBridge CLI (the `tabbridge` command)
│   ├── chrome-extension/ # Chrome / Chromium browser extension
│   ├── broker/           # Local WebSocket bridge service
│   └── shared/           # Shared types and error codes
├── skills/
│   └── tabbridge/        # Claude Skill and reference docs
└── docs/                 # Design documents
```

## Development

```bash
pnpm test        # run the full test suite
pnpm typecheck   # run TypeScript checks
pnpm lint        # run lint / type checks across packages
pnpm clean       # remove build artifacts
```

## License

[MIT](LICENSE)
