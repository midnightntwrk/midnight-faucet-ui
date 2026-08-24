# Faucet UI

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Environment Variables

These are read at build time, so each deployment needs its own build. Put them in
`.env.local` for development, or in the build step's environment in CI.

| Variable | Default | Effect |
|---|---|---|
| `VITE_IS_INTERNAL` | `false` | `true` adds the pre-release networks (`devnet`, `qanet`) to the dropdown. Leave it unset for a public deployment, which then offers only `preview` and `preprod`. |
| `VITE_IS_LOCAL_BUILD` | `false` | `true` adds the loopback faucet (`local` → `localhost:5300`) to the dropdown. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare test key | The Turnstile site key to render the CAPTCHA with. |

Both build flags default to the safer answer, so a build that forgets them ships
the public dropdown rather than leaking a pre-release network. The dev and QA
deployments are the ones that set `VITE_IS_INTERNAL=true`.

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
npm run build

# Runs the end-to-end tests
npm run test:e2e
# Runs the tests only on Chromium
npm run test:e2e -- --project=chromium
# Runs the tests of a specific file
npm run test:e2e -- tests/example.spec.ts
# Runs the tests in debug mode
npm run test:e2e -- --debug
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

## Release Process

This project uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning and releases.

### How Releases Work

Releases are automatically created when commits matching the [Conventional Commits](https://www.conventionalcommits.org/) format are pushed to the `main` branch. The CI workflow must pass for the release workflow to trigger.

**Release workflow:**
1. Push commits to `main` with conventional commit messages
2. CI workflow runs and passes
3. Release workflow automatically analyzes commits and creates a GitHub release if applicable

### Commit Message Format

Commit messages must follow the Conventional Commits specification to trigger a release:

- `feat: description` — Creates a minor version bump (feature release)
- `fix: description` — Creates a patch version bump (bug fix release)
- `feat!: description` or `fix!: description` — Creates a major version bump (breaking change)
- `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` — No release triggered

**Examples:**
```
feat: add network dropdown component
fix: correct API timeout handling
feat!: change authentication mechanism (BREAKING CHANGE)
```

### First Release

For the first release, create a commit with a conventional commit message (e.g., `feat: initial release`) and push to `main`. semantic-release will analyze all commits since the repository's start and create the first release.

# Midnight Template Repository

This GitHub repository should be used as a template when creating a new Midnight GitHub repository.
The template is configured with default repository settings and a set of default files that are expected to exist in all Midnight GitHub repositories.

### LICENSE

Apache 2.0.

### README.md

Provides a brief description for users and developers who want to understand the purpose, setup, and usage of the repository.

### SECURITY.md

Provides a brief description of the Midnight Foundation's security policy and how to properly disclose security issues.

### CONTRIBUTING.md

Provides guidelines for how people can contribute to the Midnight project.

### CODEOWNERS

Defines repository ownership rules.

### ISSUE_TEMPLATE

Provides templates for reporting various types of issues, such as: bug report, documentation improvement and feature request.

### PULL_REQUEST_TEMPLATE

Provides a template for a pull request.

### CLA Assistant

The Midnight Foundation appreciates contributions, and like many other open source projects asks contributors to sign a contributor
License Agreement before accepting contributions. We use CLA assistant (https://github.com/cla-assistant/cla-assistant) to streamline the CLA
signing process, enabling contributors to sign our CLAs directly within a GitHub pull request.

### Dependabot

The Midnight Foundation uses GitHub Dependabot feature to keep our projects dependencies up-to-date and address potential security vulnerabilities.

### Checkmarx

The Midnight Foundation uses Checkmarx for application security (AppSec) to identify and fix security vulnerabilities.
All repositories are scanned with Checkmarx's suite of tools including: Static Application Security Testing (SAST), Infrastructure as Code (IaC), Software Composition Analysis (SCA), API Security, Container Security and Supply Chain Scans (SCS).

### Unito

Facilitates two-way data synchronization, automated workflows and streamline processes between: Jira, GitHub issues and Github project Kanban board.

### Software Package Data Exchange (SPDX)
Include the following Software Package Data Exchange (SPDX) short-form identifier in a comment at the top headers of each source code file.


 <I>// This file is part of <B>Midnight Faucet UI</B>.<BR>
 // Copyright (C) Midnight Foundation<BR>
 // SPDX-License-Identifier: Apache-2.0<BR>
 // Licensed under the Apache License, Version 2.0 (the "License");<BR>
 // You may not use this file except in compliance with the License.<BR>
 // You may obtain a copy of the License at<BR>
 //<BR>
 //	https://www.apache.org/licenses/LICENSE-2.0<BR>
 //<BR>
 // Unless required by applicable law or agreed to in writing, software<BR>
 // distributed under the License is distributed on an "AS IS" BASIS,<BR>
 // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.<BR>
 // See the License for the specific language governing permissions and<BR>
 // limitations under the License.</I>

