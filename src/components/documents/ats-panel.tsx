import { checkAts, type AtsInput, type AtsStatus } from "@/lib/ats-check";

const MARK: Record<AtsStatus, { symbol: string; label: string; className: string }> = {
  pass: { symbol: "✓", label: "Passes", className: "text-success" },
  warn: { symbol: "!", label: "Could be better", className: "text-warning" },
  fail: { symbol: "✕", label: "Fails", className: "text-danger" },
};

/**
 * What an applicant-tracking system will make of the resume, scored by the
 * rubric in src/lib/ats-check.ts. Folded away until asked for.
 */
export function AtsPanel(props: AtsInput) {
  const report = checkAts(props);
  return (
    <details className="rounded-card bg-card px-4 py-2.5 text-meta">
      <summary className="cursor-pointer font-medium text-ink">
        ATS check · {report.score} of {report.max}
        {report.max < 100 && <span className="font-normal text-muted"> (keywords not scored)</span>}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {report.categories.map((category) => (
          <section key={category.id} aria-label={category.title}>
            <h3 className="flex justify-between font-medium text-ink">
              <span>{category.title}</span>
              <span className="text-muted">{category.max ? `${category.score} / ${category.max}` : "not scored"}</span>
            </h3>
            <ul className="mt-1 flex flex-col gap-0.5">
              {category.items.map((item) => (
                <li key={item.label}>
                  <span className={MARK[item.status].className} role="img" aria-label={MARK[item.status].label}>
                    {MARK[item.status].symbol}
                  </span>{" "}
                  {item.label}
                  {item.detail && <span className="text-muted"> · {item.detail}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {report.advice.length > 0 && (
          <section aria-label="Worth knowing">
            <h3 className="font-medium text-ink">Worth knowing</h3>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-muted">
              {report.advice.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-muted">
          Scored against a published rubric, not a real ATS. Treat it as a checklist: no parser is exactly like another.
        </p>
      </div>
    </details>
  );
}
