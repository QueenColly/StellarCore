
# Documentation Maintenance and Review Standards

This guide defines how StellarCore documentation is written, verified, reviewed, and maintained so that published explanations remain consistent with the implementation.

Documentation is part of the project's evidence boundary. It must describe what the repository actually implements and must not turn persisted metadata, advertised capabilities, or incomplete evidence into stronger claims.

## 1. Documentation principles

All project documentation must follow these principles:

- **Implementation first:** describe behavior that can be verified in the relevant source code, tests, API contracts, or configuration.
- **Evidence-aware wording:** distinguish reviewed configuration, advertised metadata, persisted observations, calculated results, and live external behavior.
- **Explicit limitations:** document what the implementation does not establish, rather than leaving readers to infer stronger guarantees.
- **Traceable examples:** make it possible for a reviewer to identify where an example or statement came from.
- **Focused scope:** update the document that owns the subject instead of copying large sections of another guide.
- **Reviewable changes:** keep documentation changes focused and include the source files checked.

StellarCore is a read-only evidence and visibility platform. Documentation must preserve that boundary.

## 2. Source verification

Before adding or changing a technical statement, inspect the current implementation on the branch being documented.

For changes that are required to match `development`, inspect the relevant `development` implementation as well. If the contribution branch and `development` differ, identify the difference instead of silently describing behavior that is not present on the target branch.

Use the following source order:

1. **Implementation:** route handlers, service functions, repositories, serializers, components, configuration, and data models.
2. **Tests and fixtures:** verify expected behavior, response shapes, validation rules, edge cases, and error states.
3. **Public API types and contracts:** confirm field names, nullability, allowed values, and response structure.
4. **Existing documentation:** preserve consistent terminology and link to specialized guides where appropriate.
5. **External specifications:** use the relevant SEP or other authoritative specification only when explaining protocol terminology or behavior outside StellarCore's own implementation.

Existing documentation is useful context, but it does not override the current implementation.

### Source verification procedure

For every document update:

1. Identify the exact feature or behavior being documented.
2. Locate the implementation files responsible for that behavior.
3. Inspect the relevant API types, serializers, and repository queries.
4. Read tests or fixtures that demonstrate the behavior.
5. Compare the proposed explanation with existing documentation.
6. Check whether the behavior is implemented, planned, disabled, or dependent on external services.
7. Record the important source paths in the pull request description.
8. Recheck links and examples after editing.

Do not infer behavior from a component name, database field name, issue description, or old documentation alone.

## 3. Writing examples accurately

Examples must teach the actual contract without implying that illustrative data is a live observation.

### Label the source of each example

Use an appropriate description before a code example:

- **Illustrative example:** values are fictional or selected only to demonstrate a format.
- **Derived from implementation or tests:** the structure and values are supported by a serializer, fixture, or test.
- **Captured response:** a response was actually captured from the identified environment at the stated time.

Do not describe an example as a captured production response unless it was genuinely captured from production.

### Keep examples consistent with implementation

Before publishing an example:

- Confirm field names and casing.
- Confirm whether a field is nullable or optional.
- Confirm enum values against the relevant type or schema.
- Confirm the response envelope and error codes.
- Confirm that the endpoint and HTTP method exist.
- Confirm that the example does not include fields that the serializer does not return.
- Avoid presenting a test fixture as current production state.

When a response contains a count, explain what is counted. For example, an anchor count in a corridor response represents persisted associations, not the number of anchors currently accepting transfers.

### Keep examples safe

Never invent:

- Live anchor availability.
- A currently operational transfer route.
- Verified customer transfers or settlement outcomes.
- Firm quotes or guaranteed exchange rates.
- Current market prices from illustrative values.
- Reputation scores that are not supported by the required evidence.
- API capabilities that are only proposed in an RFC.

Use explicit uncertainty wording when evidence is incomplete.

## 4. Evidence terminology and unsupported claims

Use terminology that reflects the evidence actually available to StellarCore.

| Evidence category | Appropriate description | Do not describe it as |
| --- | --- | --- |
| Reviewed registry entry | Reviewed configuration | Proof of current service availability |
| SEP metadata | Advertised interface or capability | Verified, reachable, or operational service |
| Anchor synchronization state | Persisted synchronization status | Real-time uptime guarantee |
| Anchor-corridor association | Reviewed or persisted association | Working transfer route |
| SEP-38 `/price` observation | Indicative-rate observation | Firm quote or guaranteed exchange rate |
| Reputation calculation | Evaluation based on persisted evidence | Independent endorsement or financial guarantee |
| Transfer outcome model | Data model or implemented processing logic, where applicable | Proof that a customer transfer occurred |

A successful metadata synchronization does not prove that an anchor is currently accepting customer transactions.

An advertised transfer interface does not prove that StellarCore can initiate, observe, or verify a transfer.

A persisted corridor association does not prove that a transfer can be completed between its source and destination.

An indicative price is not a firm quote. Do not describe a rate observation as a guaranteed execution price.

A reputation score must not be invented, inferred from an anchor status, or published in documentation without checking the scoring requirements and persisted evidence.

When a feature is proposed or described in an RFC, label it as proposed or future work. Do not present it as an available production feature.

## 5. Documentation update triggers

Review the affected documentation whenever a change modifies or clarifies any of the following:

- Public API routes, methods, parameters, response fields, validation, or error behavior.
- Database models, relationships, or persisted evidence semantics.
- Anchor discovery, SEP metadata, synchronization, or health-state transitions.
- Corridor registry entries or anchor-corridor associations.
- Rate observation capture, freshness, median eligibility, or quote behavior.
- Reputation inputs, eligibility requirements, score states, or metrics.
- Dashboard labels, empty states, timestamps, tables, navigation, or interaction behavior.
- Environment variables, setup instructions, scripts, operational procedures, or CI requirements.
- Security, privacy, authorization, or read-only boundaries.

A documentation update should explain the changed behavior and link to the relevant specialized documentation. Do not duplicate an entire API reference, architecture guide, or operational procedure merely to record a small change.

## 6. Review responsibility

### Author or contributor

The author is responsible for:

- Checking the implementation and existing documentation.
- Writing accurate explanations and clearly labelled examples.
- Including relevant source paths in the pull request.
- Checking relative links, commands, terminology, and Markdown structure.
- Identifying limitations or unresolved differences between branches.
- Updating the changelog when required by the contribution guide.

### Maintainer or reviewer

The reviewer should verify:

- The documented behavior matches the implementation being reviewed.
- Examples match actual types, serializers, tests, and route contracts.
- Unsupported claims and ambiguous wording have been removed.
- Existing specialized documentation has not been unnecessarily duplicated.
- Relative links and referenced commands are valid.
- The change follows the repository's contribution and changelog conventions.

A reviewer should request clarification when a claim cannot be traced to implementation or authoritative evidence.

## 7. Documentation and CI limitations

The repository's automated CI checks validate code quality and other configured project checks. They do not replace human review of technical documentation.

Passing TypeScript, lint, tests, audits, or a production build does not prove that a Markdown explanation is factually correct.

Do not claim that documentation link validation, Markdown linting, accessibility conformance, or documentation freshness checks are automated unless the relevant workflow or tool is present and has been verified.

For the current contributor workflow, consult [CONTRIBUTING.md](../CONTRIBUTING.md).

The documented standard contributor commands are:

```bash
npx tsc --noEmit
npm run lint
npm test
```

The current CI workflow also includes the configured registry, SQL, and API compatibility audits, the production dependency audit, and the production build. Check the workflow before documenting changes to those checks.

## 8. Documentation pull request checklist

Before submitting a documentation pull request, confirm the following:

- [ ] The document describes behavior verified against the relevant implementation.
- [ ] The target branch and any required `development` comparison have been checked.
- [ ] Existing documentation has been reviewed for overlap.
- [ ] Technical terms and field names match the source code.
- [ ] Examples are accurately labelled and match the implementation.
- [ ] Null, empty, error, and insufficient-evidence states are described correctly.
- [ ] No live availability, verified transfer, firm quote, guaranteed rate, or unsupported score is implied.
- [ ] Relative links point to existing files or valid sections.
- [ ] Commands match the current scripts and contribution instructions.
- [ ] Headings are descriptive and logically nested.
- [ ] Tables and code blocks are readable in Markdown.
- [ ] The changelog is updated when required by [CONTRIBUTING.md](../CONTRIBUTING.md#changelog).
- [ ] The pull request includes a short list of reviewed source files and known limitations.
- [ ] Relevant repository checks have been run, and their results are reported accurately.

## 9. Related documentation

- [Contributing Guide](../CONTRIBUTING.md)
- [Changelog](../CHANGELOG.md)
- [Public API Reference](api-reference.md)

This guide establishes a review process; it does not claim that documentation accuracy is automatically enforced by CI.
