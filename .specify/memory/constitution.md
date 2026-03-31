<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial ratification)
  Added principles:
    - I. Design System Compliance
    - II. Brand Consistency
    - III. Monorepo Architecture
    - IV. Accessibility First
    - V. TypeScript Strict
    - VI. Token-Based Styling
  Added sections:
    - Technology Stack
    - Development Workflow
  Removed sections: none
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ no changes needed (Constitution Check is generic)
    - .specify/templates/spec-template.md ✅ no changes needed (user story structure compatible)
    - .specify/templates/tasks-template.md ✅ no changes needed (phase structure compatible)
  Follow-up TODOs: none
-->

# eBio Constitution

## Core Principles

### I. Design System Compliance

All user-facing UI MUST conform to the eBio Design System v1.0
(`ebio-design-system.docx` at project root).

- Every component MUST use the documented color palette (Green, Earth, Sky,
  Coral, Neutral) through design tokens — never arbitrary colors.
- Typography MUST follow the three-family stack: **DM Serif Display**
  (display/hero), **Plus Jakarta Sans** (all UI text), **JetBrains Mono**
  (prices in FCFA). Using Inter, Roboto, Arial, or System UI as primary
  font is prohibited.
- Component dimensions, border-radius, spacing, and shadows MUST match
  the design system tokens (radius-xs through radius-pill, space-1 through
  space-12).
- Dark mode MUST be supported: Neutral 900/800 backgrounds (no pure
  black), text stops 100–200 on dark surfaces, CTA colors unchanged.
- All button variants (Primary, Secondary, Earth, Ghost, Danger) MUST
  follow the specified dimensions: 44px height mobile / 40px web,
  10px radius, Plus Jakarta Sans 600 13px.

### II. Brand Consistency

All generated code, UI text, and documentation MUST respect eBio brand
rules.

- Brand name is **eBio** (lowercase "e", uppercase "B") — never Ebio,
  EBIO, or e-bio.
- Application vocabulary MUST use the official terms: **Fournisseur**
  (not vendeur/marchand), **Acheteur** (not client/utilisateur),
  **Mise en relation** (not messagerie), **Commander** (not acheter),
  **Validé eBio** (not certifié/approuvé), **Fiche boutique**
  (not page produit), **Itinéraire** (not directions/trajet).
- French (Benin) is the primary language. System messages use
  vouvoiement; community content may use tutoiement.
- Number formatting MUST follow French conventions: "1 200 FCFA"
  (space separator), "1,2 km" (comma decimal), dates as "il y a 2 h",
  "hier", "lun. 20 mars" — never ISO timestamps in UI.
- Prices MUST always be rendered in JetBrains Mono with the format
  "X XXX FCFA / unité".

### III. Monorepo Architecture

The project follows a monorepo structure. All features MUST
respect this architecture.

- **API**: NestJS with MikroORM (PostgreSQL), REST endpoints.
- **Frontend SPA**: React with TailwindCSS and Radix UI.
- **Frontend SSR**: React server-side rendered application.
- **Shared packages**: `packages/ui` (shadcn/ui components),
  `packages/openapi-generator` (generated types, validators, SDK).
- Frontend-backend communication MUST go through OpenAPI-generated types
  and SDK — no hand-written API calls.
- Full-stack features SHOULD be delivered in a single PR when possible.
- Shared types and validators live in `packages/openapi-generator`;
  duplicating type definitions across apps is prohibited.

### IV. Accessibility First

WCAG AA compliance is the minimum standard for all eBio interfaces.

- All interactive elements MUST have a minimum touch target of 44×44px.
- Text contrast MUST meet WCAG AA ratios: 4.5:1 for normal text,
  3:1 for large text (≥18px or ≥14px bold).
- Images MUST have descriptive `alt` text in French.
- Form fields MUST have visible labels at all times — placeholder text
  alone is never acceptable as a label.
- Color MUST NOT be the sole means of conveying information; always
  pair with an icon or text label.
- React Native components without visible text MUST include
  `accessibilityLabel`.
- Green 400 (#2CB878) MUST NOT be used as text color on white
  backgrounds (insufficient contrast for small text).

### V. TypeScript Strict

All code MUST be written in TypeScript with strict type safety.

- `strict: true` in all tsconfig files — no `any` types except at
  validated system boundaries.
- End-to-end type safety from database entities (MikroORM) through
  API contracts (OpenAPI) to frontend components.
- NestJS services and controllers MUST use typed DTOs validated at
  runtime (class-validator / OpenAPI schemas).
- Frontend MUST consume the generated OpenAPI SDK — never raw
  fetch/axios with manually typed responses.
- Prefer clean code patterns: single responsibility, dependency
  injection (NestJS), composition over inheritance.

### VI. Token-Based Styling

All styling MUST use design tokens — never hardcoded values in
application code.

- CSS MUST reference `--ebio-*` custom properties (e.g.,
  `--ebio-green-400`) defined in a central theme file.
- TailwindCSS configuration MUST map eBio tokens to Tailwind utilities
  (e.g., `bg-ebio-green-400`).
- React Native MUST import constants from a central `theme.ts` file.
- Hex values are permitted ONLY in token definition files (CSS
  `:root`, `theme.ts`, `tailwind.config`).
- Semantic variables (`--bg-page`, `--bg-surface`, `--text-primary`,
  etc.) MUST be used for dark mode switching via
  `prefers-color-scheme`.
- Spacing and border-radius MUST use the token scale — no arbitrary
  pixel values.

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 24.13.0 |
| Package manager | pnpm | 10.28.2 |
| API framework | NestJS | — |
| ORM | MikroORM (PostgreSQL) | — |
| Frontend framework | React | — |
| CSS | TailwindCSS | — |
| UI primitives | Radix UI / shadcn/ui | — |
| API contract | OpenAPI (generated SDK) | — |
| Tracing | OpenTelemetry (Sentry + Langfuse) | — |
| Storage | MinIO (S3-compatible, dev only) | — |
| Mail | MailDev (dev only) | — |

## Development Workflow

- **Monorepo commands**: `pnpm dev` (all apps), `pnpm build`,
  `pnpm lint`, `pnpm generate` (OpenAPI clients).
- **Database**: `pnpm db:migrate:create`, `pnpm db:migrate:up`,
  `pnpm db:migrate:down`, `pnpm db:seed`.
- **Docker services**: PostgreSQL, MailDev, MinIO via
  `pnpm docker:up`.
- **CI**: GitHub Actions — lint, type-check, build on every push to
  main/master and on PRs.
- Feature specifications and task files MUST be placed in
  `docs/features/<feature-name>/`.
- Each PR MUST pass lint, type-check, and build before merge.
- Constitution compliance MUST be verified in code review: design
  system adherence, brand vocabulary, accessibility, type safety,
  token usage.

## Governance

- This constitution is the highest-authority document for the eBio
  project. It supersedes conflicting guidance in any other document.
- Amendments require: (1) documented rationale, (2) team review,
  (3) version bump following semver (MAJOR for principle
  removal/redefinition, MINOR for additions, PATCH for clarifications).
- All PRs and code reviews MUST verify compliance with these
  principles. Non-compliance MUST be flagged and resolved before merge.
- Complexity beyond what is documented here MUST be justified in
  writing (e.g., in a plan.md Complexity Tracking table).
- The eBio Design System document (`ebio-design-system.docx`) is the
  authoritative visual reference; this constitution encodes its rules
  for development enforcement.

**Version**: 1.0.0 | **Ratified**: 2026-03-23 | **Last Amended**: 2026-03-23
