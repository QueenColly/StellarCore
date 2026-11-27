
# Figma-to-GitHub Design Contribution Workflow

This guide explains how Drips Wave contributors can complete StellarCore UI/UX design issues and hand their work over for review and implementation.

The goal is to make design contributions understandable, reusable, accessible, and easy for developers to implement.

This workflow applies to the published StellarCore UI/UX design issues.

## 1. Find a design issue

Start by reviewing the open UI/UX issues in the [StellarCore repository](https://github.com/Aboyeji-Isaac/StellarCore/issues).

Select an issue that:

- Has a clearly defined design objective.
- Has an understandable scope and deliverables.
- Has not already been completed or superseded.
- You are able to complete within the stated acceptance criteria.

Read the entire issue before opening Figma.

Pay particular attention to:

- Description and objective.
- Scope.
- Acceptance criteria.
- Figma deliverables.
- Out-of-scope requirements.
- Contribution guidance.

Do not assume that a design issue authorizes changes to backend services, API contracts, database schemas, or unrelated application features.

### Examples of published design issues

The following issues illustrate the types of design work requested in StellarCore.

| Issue | Design area | Main objective |
| --- | --- | --- |
| [#564 — Header Navigation Bar](https://github.com/Aboyeji-Isaac/StellarCore/issues/564) | Navigation | Design the light-mode header and supported navigation destinations. |
| [#566 — Public Evidence Console](https://github.com/Aboyeji-Isaac/StellarCore/issues/566) | Dashboard overview | Present the four evidence categories clearly. |
| [#567 — How to Read the Dashboard](https://github.com/Aboyeji-Isaac/StellarCore/issues/567) | User education | Explain the different evidence layers. |
| [#569 — Corridors Section](https://github.com/Aboyeji-Isaac/StellarCore/issues/569) | Dashboard | Present source, destination, and associated anchor information. |
| [#570 — Reputation Section](https://github.com/Aboyeji-Isaac/StellarCore/issues/570) | Dashboard | Present reputation evaluations without inventing unsupported scores. |
| [#571 — What You Can Inspect (Horizontal)](https://github.com/Aboyeji-Isaac/StellarCore/issues/571) | Evidence presentation | Create a horizontal overview of the evidence categories. |
| [#572 — What You Can Inspect (Vertical)](https://github.com/Aboyeji-Isaac/StellarCore/issues/572) | Responsive design | Create a vertical alternative with the same evidence meaning. |
| [#582 — The Product Contract (Four Promises)](https://github.com/Aboyeji-Isaac/StellarCore/issues/582) | Product communication | Communicate read-only visibility, evidence separation, limitations, and explainability. |

These are examples, not an exhaustive list of the published design tasks.

## 2. Open the shared Figma workspace

Use the official shared StellarCore design workspace:

[StellarCore UI/UX — Figma](https://www.figma.com/design/6JWnNmN1g3TvkEkp88bJqp/StellarCore-UI-UX)

Before creating or editing frames:

1. Open the shared workspace.
2. Identify the existing page or section related to your assigned issue.
3. Review existing components, styles, and previous design work.
4. Avoid creating duplicate components when reusable equivalents already exist.
5. Keep your work organized so another contributor can understand it.

If you cannot access the workspace or the relevant page, request access or clarification through the assigned GitHub issue.

Do not replace or reorganize unrelated design work.

## 3. Organize your workspace and frames

Use clear and consistent names so reviewers can identify the issue and the purpose of each frame.

The following is a recommended naming convention for new contributions, not a claim that every existing Figma frame already follows it.

### Suggested page organization

```text
StellarCore UI/UX
│
├── Existing Designs
│
├── Issue #564 - Header Navigation
│   ├── Desktop
│   ├── Mobile
│   └── Components
│
├── Issue #566 - Public Evidence Console
│   ├── Desktop
│   ├── Mobile
│   └── Components
│
├── Issue #569 - Corridors Section
│   ├── Desktop
│   ├── Mobile
│   └── Components
│
└── Issue #570 - Reputation Section
    ├── Desktop
    ├── Mobile
    └── Components
```

For your assigned issue, use a page or clearly separated section that identifies its issue number.

### Suggested frame naming

Use names such as:

```text
Issue-569 / Corridors / Desktop
Issue-569 / Corridors / Mobile

Issue-570 / Reputation / Desktop
Issue-570 / Reputation / Mobile
```

For additional interaction or evidence states:

```text
Issue-570 / Reputation / Insufficient Evidence
Issue-570 / Reputation / Established
Issue-570 / Reputation / Not Evaluated
```

Only create states that are relevant to the assigned issue and supported by the current application behavior.

## 4. Use editable and understandable layers

Design files should remain editable.

Avoid submitting a design that consists entirely of flattened screenshots or images when the interface can be represented with editable Figma elements.

Organize layers using meaningful names.

For example:

```text
Corridors Section
│
├── Section Header
│   ├── Title
│   └── Description
│
├── Corridor Table
│   ├── Table Header
│   ├── Source Column
│   ├── Destination Column
│   └── Anchor Count Column
│
└── Responsive Layout
    ├── Desktop Layout
    └── Mobile Layout
```

For a reputation design:

```text
Reputation Section
│
├── Section Header
├── Reputation Card
│   ├── Anchor Name
│   ├── Evaluation State
│   ├── Score
│   ├── Score Band
│   └── Evidence Metrics
│
└── Evidence States
    ├── Established
    ├── Insufficient Evidence
    └── Not Evaluated
```

These examples are suggested organizational structures.

### Layer naming guidelines

- Use descriptive names rather than generic names such as `Frame 23` or `Rectangle 12`.
- Group related elements logically.
- Keep text editable.
- Keep icons and illustrations reusable where practical.
- Avoid unnecessary nested groups.
- Use Auto Layout where it improves responsive behavior.
- Make component instances easy to identify.
- Preserve the original design's intended reading order.

## 5. Reuse components and styles

Before creating new elements, inspect the existing shared design system.

Where suitable, reuse:

- Buttons.
- Navigation elements.
- Cards.
- Badges.
- Typography styles.
- Color styles.
- Spacing conventions.
- Table elements.
- Icons.
- Responsive layout patterns.

If an element will appear repeatedly, consider making it a reusable component.

Avoid introducing a new visual language for one section when existing design conventions can support it.

### Design consistency

Design contributions should remain consistent with the StellarCore product experience.

Consider:

- Text hierarchy.
- Consistent spacing.
- Color contrast.
- Component states.
- Visual alignment.
- Responsive behavior.
- Keyboard-focus visibility.
- Logical reading order.

A visually attractive design should also be understandable and accessible.

## 6. Design desktop and mobile layouts

Follow the responsive requirements in the assigned issue.

Where the issue requires desktop and mobile deliverables, provide both.

Consider:

- Content reflow.
- Readable labels.
- Appropriate text sizes.
- Adequate spacing.
- Touch-friendly interactive elements where applicable.
- No accidental horizontal overflow.
- Clear information hierarchy.
- Appropriate contrast.
- Keyboard accessibility for interactive controls.

Do not simply scale down the desktop frame.

Reorganize the layout where necessary while preserving the same information and meaning.

### Responsive design example

For a corridor table:

**Desktop**

A structured table can display:

- Source asset and country.
- Destination asset and country.
- Associated anchor count.

**Mobile**

The same information can be reorganized into readable stacked rows or cards if that better supports the available screen width.

Do not remove important evidence fields simply to make the design fit.

## 7. Preserve StellarCore's evidence boundaries

This is one of the most important requirements for every StellarCore design contribution.

Design copy must reflect what the current implementation actually supports.

### Anchors

You may communicate:

- Anchor names.
- Home domains.
- Persisted synchronization status.
- Advertised SEP capabilities.
- Persisted corridor associations.

Do not present advertised capabilities as proof of current availability.

### Corridors

You may communicate:

- Source assets.
- Source countries.
- Destination assets.
- Destination countries.
- Persisted associated anchor counts.

Do not present a reviewed corridor association as proof of an executable or guaranteed transfer route.

### Rates

You may communicate:

- Persisted indicative-rate observations.
- Captured timestamps.
- Freshness classifications.
- Median availability when the evidence requirement is satisfied.

Do not present indicative rates as firm quotes.

Do not invent a median when there are insufficient fresh independent sources.

### Reputation

You may communicate:

- Established evaluations.
- Insufficient-evidence states.
- Not-evaluated states.
- Available persisted metrics.

Do not invent reputation scores, rankings, or performance claims.

A missing score should remain visibly unavailable rather than being replaced with a fabricated number.

### Wallet and transfer functionality

Do not design unsupported public wallet connection, transaction signing, transfer execution, or customer custody workflows as though they already exist.

Any proposed functionality outside the assigned issue should be discussed separately with maintainers.

## 8. Include a complete design handoff

When the design is ready, prepare the following deliverables.

### 1. Specific Figma frame link

Copy the direct link to the relevant Figma frame or section.

Do not submit only the general workspace URL when a direct frame link is available.

Ensure reviewers can access the linked design.

### 2. Screenshots

Export screenshots showing the important frames.

Include the desktop and mobile versions when required by the issue.

Screenshots should:

- Show the complete relevant design.
- Use readable resolution.
- Have meaningful filenames.
- Avoid unnecessary unrelated content.
- Match the actual Figma design.

Suggested filenames:

```text
issue-569-corridors-desktop.png
issue-569-corridors-mobile.png

issue-570-reputation-desktop.png
issue-570-reputation-mobile.png
```

### 3. Handoff notes

Explain:

- What the design changes.
- Which frames were created or updated.
- Which existing components were reused.
- What responsive decisions were made.
- What accessibility considerations were addressed.
- How the design preserves StellarCore's evidence boundaries.
- Any decisions requiring maintainer clarification.

### 4. GitHub issue submission

Return to the assigned issue and submit your handoff.

A design-only contribution should include:

- Direct Figma frame link.
- Screenshots.
- Brief design summary.
- Relevant acceptance-criteria notes.
- Any outstanding limitations or questions.

A design submission does not automatically mean that the implementation has been completed.

## 9. Design review

Before submitting your work, verify the following:

### Visual consistency

- [ ] The design follows the existing StellarCore visual direction.
- [ ] Reusable components and styles have been considered.
- [ ] Layer names are understandable.
- [ ] No unrelated application sections have been redesigned.

### Responsive behavior

- [ ] Required desktop frames are included.
- [ ] Required mobile frames are included.
- [ ] Important content remains visible.
- [ ] Layouts do not introduce accidental horizontal overflow.

### Accessibility

- [ ] Text has sufficient contrast.
- [ ] Typography is readable.
- [ ] Information follows a logical reading order.
- [ ] Keyboard-focus states are considered for interactive elements.
- [ ] Meaning is not communicated through color alone.

### Evidence integrity

- [ ] Anchor status is described accurately.
- [ ] Reviewed corridors are not presented as verified transfers.
- [ ] Indicative rates are not presented as firm quotes.
- [ ] Unsupported reputation scores are not displayed.
- [ ] No unsupported wallet or custody functionality is introduced.

### Handoff

- [ ] The direct Figma frame link is included.
- [ ] Screenshots are attached.
- [ ] Handoff notes are included.
- [ ] The assigned GitHub issue is referenced.

## 10. From approved design to implementation PR

A design contribution and a code implementation are separate contributions.

If the assigned issue is design-only:

1. Submit the Figma link and screenshots.
2. Allow maintainers to review the design.
3. Address feedback.
4. Wait for the appropriate implementation direction.

If you are also authorized to implement the approved design:

1. Review the current `development` branch.
2. Identify the relevant existing components and styles.
3. Create a focused implementation branch from `development`.
4. Implement only the approved scope.
5. Preserve existing application behavior and API contracts.
6. Add or update relevant tests.
7. Run the required contributor checks.
8. Open a PR targeting `development`.

For these design issues, follow their explicit contribution instruction: target `development`, never modify or target `main`.

The repository's current general [Contributing Guide](../CONTRIBUTING.md) contains a different branch-target instruction (`main`). This is a documentation-policy discrepancy that should be reconciled by maintainers. Do not use this design workflow to silently override the general contribution guide for unrelated issues.

### Suggested implementation checks

Run these commands from the repository root:

```bash
npx tsc --noEmit
npm run lint
npm test
```

Only claim checks passed when they have actually been executed successfully.

## 11. Example design handoff

The following is an illustrative submission structure.

```markdown
## Design Contribution

**Related Issue:** #569

### Figma
[View Corridors Desktop and Mobile Frames](PASTE_DIRECT_FIGMA_FRAME_LINK)

### Screenshots
- issue-569-corridors-desktop.png
- issue-569-corridors-mobile.png

### Summary
Designed the corridors section to present source and destination
assets, country labels, and persisted associated anchor counts.

### Design Decisions
- Organized corridor information for desktop and mobile.
- Used editable and clearly named Figma layers.
- Reused appropriate visual components.
- Preserved readable labels and logical information hierarchy.
- Avoided presenting corridor associations as verified transfers.

### Accessibility
- Considered text contrast.
- Preserved readable typography.
- Considered responsive reading order and keyboard focus.

### Limitations
No API, backend, transfer execution, or reputation-scoring
changes were included.
```

Replace the placeholder Figma link with the actual frame URL before submitting.

## 12. Useful resources

- [StellarCore Repository](https://github.com/Aboyeji-Isaac/StellarCore)
- [StellarCore UI/UX Figma Workspace](https://www.figma.com/design/6JWnNmN1g3TvkEkp88bJqp/StellarCore-UI-UX)
- [StellarCore Issues](https://github.com/Aboyeji-Isaac/StellarCore/issues)
- [Contributing Guide](../CONTRIBUTING.md)
- [Documentation Index](README.md)
- [Public Dashboard Guide](dashboard-guide.md)
- [Public API Reference](api-reference.md)

---

**Final principle:** A good StellarCore design contribution is editable, accessible, responsive, reusable, evidence-accurate, and straightforward for another contributor to implement.
