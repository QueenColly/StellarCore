async function main(): Promise<void> {
  try {
    const { auditCurrentStellarCoreConfiguration } = await import(
      "@/lib/config/currentStellarCoreConfiguration"
    );
    const result = auditCurrentStellarCoreConfiguration();

    process.stdout.write(`${JSON.stringify({
      ok: result.ok,
      issueCount: result.issues.length,
      issues: result.issues,
    })}\n`);

    if (!result.ok) process.exitCode = 1;
  } catch {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      issueCount: 1,
      issues: [{
        code: "CONFIGURATION_LOAD_FAILURE",
        registry: "configuration",
      }],
    })}\n`);
    process.exitCode = 1;
  }
}

void main();
