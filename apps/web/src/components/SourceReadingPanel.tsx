import type { SourceReading } from "@regdash/shared";

const FIELD_LABEL = { number: "Ticket number", type: "Type", status: "Status", createdAt: "Created" } as const;
const TYPE_LABEL = { INCIDENT: "incident", SR: "SR" } as const;

/** The rule-based assumptions behind the numbers, open to checking against the real file. */
export function SourceReadingPanel({ reading }: { reading: SourceReading }) {
  const { sheets, skippedSheets, typedBy, typeConflicts } = reading;
  const total = sheets.reduce((n, s) => n + s.tickets, 0);
  const conflicts = typeConflicts.length;

  return (
    <details className="banner banner-info">
      <summary>
        How this file was read: {total} ticket{total === 1 ? "" : "s"} from {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
        {conflicts > 0 && `, ${conflicts} with a type conflict`}
      </summary>

      {sheets.map((s) => (
        <div key={s.name}>
          <h3>Sheet "{s.name}": {s.tickets} ticket{s.tickets === 1 ? "" : "s"}, headers on row {s.headerRow}</h3>
          <ul>
            {s.columns.map((c) => (
              <li key={c.field}>
                {FIELD_LABEL[c.field]}: column "{c.header}"{c.how === "contents" && " (recognised from its contents)"}
              </li>
            ))}
            {!s.columns.some((c) => c.field === "type") && <li>Type: no column found</li>}
          </ul>
          {s.ignoredHeaders.length > 0 && <p className="muted">Not used: {s.ignoredHeaders.join(", ")}</p>}
        </div>
      ))}

      <h3>Where each ticket's type came from</h3>
      <ul>
        <li>Type column: {typedBy.column}</li>
        <li>Ticket number prefix: {typedBy.number}</li>
        <li>Sheet name: {typedBy.sheet}</li>
      </ul>

      {conflicts > 0 && (
        <>
          <h3>Type column and ticket number disagree (the type column is used)</h3>
          <ul>
            {typeConflicts.slice(0, 20).map((c) => (
              <li key={c.number}>{c.number}: column says {TYPE_LABEL[c.column]}, number says {TYPE_LABEL[c.prefix]}</li>
            ))}
          </ul>
          {conflicts > 20 && <p className="muted">…and {conflicts - 20} more</p>}
        </>
      )}

      {skippedSheets.length > 0 && (
        <>
          <h3>Sheets not read</h3>
          <ul>
            {skippedSheets.map((s) => (
              <li key={s.name}>{s.name}: {s.reason}</li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
