
# Accessibility Writing and Evidence Labeling Guide

This guide establishes content and labeling practices for StellarCore's evidence-heavy interfaces.

The goal is to make dashboard information understandable without relying on color, visual position, unexplained abbreviations, or assumptions about what incomplete evidence proves.

The guidance is intended to support WCAG 2.2 AA accessibility goals. It is not a claim that every current page or component has been independently audited or certified as conformant.

## 1. Write descriptive labels

A label should communicate the meaning of the evidence, not merely its visual appearance.

Prefer wording that tells readers what a value represents and how confidently it can be interpreted.

Examples:

| Prefer | Avoid | Reason |
| --- | --- | --- |
| Synced | Green | Describes the synchronization state |
| Sync degraded | Yellow | Communicates the state without requiring color recognition |
| Sync failed | Red | Communicates the recorded state |
| Sync unknown | Grey | Explains that the state is not established |
| Advertised SEPs | Supported services | Avoids implying that advertised endpoints are operational |
| Persisted corridor associations | Available routes | Distinguishes stored relationships from live transfer availability |
| Indicative-rate observation | Guaranteed rate | Avoids overstating pricing evidence |

Use concise language, but do not remove the context required to understand an evidence value.

## 2. Badges and meaning beyond color

Badges can use visual tones to distinguish states, but color must not be the only way to communicate meaning.

The current dashboard `Badge` component renders a visible text label alongside its visual tone.

For example, the anchor dashboard maps persisted API statuses to these labels:

| Persisted status | Visible label |
| --- | --- |
| `LIVE` | Synced |
| `DEGRADED` | Sync degraded |
| `DOWN` | Sync failed |
| `UNKNOWN` | Sync unknown |

When creating or changing evidence badges:

- Keep the visible label descriptive.
- Do not use color as the only indication of success, warning, failure, or uncertainty.
- Avoid labels such as "Good", "Bad", or "Green" when the evidence meaning can be stated directly.
- Use consistent wording for the same state across the dashboard and detail pages.
- Do not make the label imply stronger evidence than the underlying field supports.

### Example: anchor synchronization badge

The following describes the existing dashboard wording:

```text
Persisted status: LIVE
Visible badge: Synced
```

The label means the persisted synchronization state is `LIVE`. It does not mean the anchor is guaranteed to be online at the moment the page is viewed.

Do not change the meaning to "Online now" unless the implementation provides and verifies that separate live-availability evidence.

## 3. Timestamps and evidence context

A timestamp should tell readers which event or measurement it describes.

Use a descriptive label next to the timestamp, such as:

- Captured at
- Evaluated at
- Last synchronized
- Generated at

Only use a label when the underlying field actually represents that event.

Do not use a generic "Updated" label when the reader needs to distinguish observation capture from evaluation or synchronization.

### Existing timestamp formatting

The `EvidenceTimestamp` component formats valid persisted timestamps in UTC and uses the HTML `<time>` element with a machine-readable `dateTime` value.

Its visible format includes an explicit `UTC` suffix.

Missing or invalid timestamp values are rendered as:

```text
Unavailable
```

This is preferable to displaying an invalid date or silently substituting the current time.

### Timestamp writing rules

- Preserve the meaning of the source timestamp.
- State the timezone explicitly when presenting UTC values.
- Do not imply that a capture timestamp is the time a transfer settled.
- Do not imply that an evaluation timestamp is the time an external service was last checked.
- Do not replace missing timestamps with invented dates.
- Use `Unavailable` or another accurate empty-state label when a timestamp cannot be rendered.

For more context, inspect `components/ui/EvidenceTimestamp.tsx` and the component that supplies the timestamp.

## 4. Keyboard and control labels

All interactive controls should have an understandable purpose when reached through keyboard navigation or assistive technology.

When adding or changing interactive UI:

- Use native links for navigation and native buttons for actions.
- Ensure interactive elements can be reached and operated using a keyboard.
- Provide a visible focus indicator.
- Do not remove the browser outline without providing an equally visible replacement.
- Use descriptive link text that explains the destination.
- Give icon-only controls an accessible name.
- Use `aria-label` when a visible label is not available and the accessible name cannot be supplied by other means.
- Use `aria-labelledby` when an existing visible heading or label should name a region.
- Keep focus order consistent with the visual and reading order.
- Do not use a non-interactive element as a button or link.

### Existing implementation example

The anchor detail page includes a breadcrumb navigation landmark with an accessible label:

```tsx
<nav aria-label="Breadcrumb">
  ...
</nav>
```

It also provides visible keyboard focus styling on its dashboard link.

When updating this navigation, preserve its descriptive name and visible focus treatment.

Do not add redundant ARIA attributes to native elements when their built-in semantics already provide the required information.

## 5. Table headings and column names

Tables must communicate the meaning of their columns and preserve a logical reading structure.

The current corridor dashboard table uses these visible column names:

| Column heading | Meaning |
| --- | --- |
| Source | Source asset and country |
| Destination | Destination asset and country |
| Anchors | Number of persisted anchor associations |

When creating or changing a data table:

- Use a semantic `<table>` for tabular data.
- Use `<thead>` and `<tbody>` to distinguish header and data rows.
- Use `<th>` for header cells and `<td>` for data cells.
- Use `scope="col"` for column headers where appropriate.
- Use clear, descriptive column names.
- Do not rely on abbreviations without explaining them.
- Ensure the column heading describes the values below it.
- Preserve a meaningful reading order when the table is viewed on a narrow screen.
- Do not use spacing or visual alignment alone to communicate relationships.

### Example: corridor table headings

```tsx
<thead>
  <tr>
    <th scope="col">Source</th>
    <th scope="col">Destination</th>
    <th scope="col">Anchors</th>
  </tr>
</thead>
```

This is a writing and implementation example for table semantics. It does not claim that every existing table already uses `scope="col"`.

## 6. Communicating uncertainty and incomplete evidence

StellarCore presents persisted evidence. Its wording must make uncertainty clear.

Use language that describes the evidence available rather than assuming an external outcome.

| Evidence or state | Appropriate wording | Avoid |
| --- | --- | --- |
| SEP metadata | Advertised interface | Available service |
| Persisted anchor status | Persisted sync state | Online now |
| Reviewed corridor association | Associated corridor | Working route |
| SEP-38 observation | Indicative-rate observation | Firm quote |
| Missing timestamp | Unavailable | Current time |
| Insufficient reputation evidence | Insufficient evidence | Zero reputation |
| Empty directory response | No records are currently persisted | Service unavailable |

### Empty, unavailable, and failed are different

Do not treat these states as interchangeable:

- **Empty:** the request succeeded, but there are no records to display.
- **Unavailable:** a particular value cannot be provided or interpreted.
- **Error:** the request or operation failed.
- **Insufficient evidence:** the available evidence does not satisfy the requirements for a stronger conclusion.

Use the state that matches the implementation's response.

### Avoid unsupported certainty

Do not write:

- "This anchor is currently available" based only on a persisted `LIVE` status.
- "This route works" based only on an anchor-corridor association.
- "This transfer was verified" without a trusted, authorized source of transfer evidence.
- "This is the guaranteed rate" for an indicative-rate observation.
- "This anchor is trustworthy" based only on incomplete reputation evidence.

Prefer descriptions such as:

- "The anchor's persisted synchronization status is LIVE."
- "The corridor has one persisted anchor association."
- "The anchor advertises SEP-38."
- "The available evidence is insufficient to publish a reputation score."

## 7. Headings, instructions, and terminology

Use headings that describe the content that follows.

- Keep heading levels in a logical order.
- Do not skip heading levels merely to obtain a visual size.
- Use descriptive link text instead of "click here".
- Explain protocol abbreviations when readers may not know them.
- Keep instructions short and action-oriented.
- Use the same field names and status terminology as the public API where technical precision matters.
- Explain technical terms in plain language where the intended audience includes non-developers.

A document should remain understandable when headings are read independently or when the page is navigated using assistive technology.

## 8. WCAG 2.2 AA review goals

When adding or changing dashboard content, review the relevant WCAG 2.2 AA concerns, including:

- Text and non-text contrast.
- Color not being the only means of conveying information.
- Keyboard accessibility and visible focus.
- Logical focus order.
- Descriptive labels and accessible names.
- Semantic headings, landmarks, and table structures.
- Meaningful link purpose.
- Reflow and readability at narrow viewport widths.
- Clear identification of errors and status messages.

This checklist is a review aid, not proof of conformance. Automated checks alone cannot establish that all content and interactions are accessible. Review the rendered interface with keyboard navigation and appropriate assistive technology when the change affects interactive behavior or information structure.

## 9. Implementation references

The current content and semantics described in this guide can be reviewed in:

- `components/dashboard/Badge.tsx` — visible badge text and visual tones.
- `components/dashboard/AnchorsSection.tsx` — anchor status labels and advertised capability descriptions.
- `components/dashboard/CorridorsSection.tsx` — corridor table headings and empty/error states.
- `components/ui/EvidenceTimestamp.tsx` — UTC timestamp formatting and machine-readable time values.
- `app/anchors/[slug]/page.tsx` — breadcrumb semantics, focus styling, and anchor evidence wording.

When updating these components, keep visible wording, accessible semantics, and evidence meaning aligned.
