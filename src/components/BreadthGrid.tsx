import type { BreadthCell } from "@/server/progress";
import type { Field } from "@/lib/suggestions";
import type { Format } from "@/lib/formats";
import type { UiStrings } from "@/lib/ui-strings";

/**
 * What has been read about, as a grid of subjects against kinds of writing.
 *
 * A table rather than SVG, deliberately. It is tabular data, and the DOM gives
 * it row and column headers, keyboard focus and screen-reader semantics for
 * free - all of which would have to be rebuilt by hand in a drawing. SVG is
 * reserved for the two things here that are genuinely graphical.
 *
 * Every cell is always rendered, however little has been read. An empty grid
 * is not a failure state: it is the shape of the thing, and seeing the shape is
 * the point.
 */
export function BreadthGrid({
  cells,
  fields,
  formats,
  fieldLabel,
  formatLabel,
  cellTitle,
  t,
}: {
  cells: BreadthCell[];
  fields: readonly Field[];
  formats: readonly Format[];
  fieldLabel: (f: Field) => string;
  formatLabel: (f: Format) => string;
  /** Pre-formatted: the interpolating strings are server-only functions. */
  cellTitle: (cell: BreadthCell) => string;
  t: UiStrings;
}) {
  const at = (field: Field, format: Format) =>
    cells.find((c) => c.field === field && c.format === format)!;

  return (
    <div className="space-y-3">
    <table className="w-full border-separate border-spacing-1 text-sm">
      <caption className="sr-only">{t.breadthHeading}</caption>
      <thead>
        <tr>
          <td />
          {formats.map((format) => (
            <th
              key={format}
              scope="col"
              className="pb-1 text-center text-xs font-normal text-muted"
            >
              {formatLabel(format)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <tr key={field}>
            <th scope="row" className="w-1/3 pr-2 text-left font-normal">
              {fieldLabel(field)}
            </th>
            {formats.map((format) => {
              const cell = at(field, format);
              return (
                <td key={format} className="p-0">
                  <div
                    title={cellTitle(cell)}
                    aria-label={cellTitle(cell)}
                    className={[
                      "flex h-9 w-full items-center justify-center rounded text-xs font-medium",
                      cell.state === "filled"
                        ? "bg-accent text-white"
                        : cell.state === "started"
                          ? // Dashed, not a lighter fill: "I started this and
                            // put it down" is a different fact from "I have
                            // read a bit about this", and shading alone would
                            // read as the second.
                            "border-2 border-dashed border-accent bg-surface"
                          : "border border-border bg-surface",
                    ].join(" ")}
                  >
                    {/* The count goes IN the cell, not in a tooltip. `title`
                        does nothing on a touchscreen - there is no hover - so
                        on the device most of this app's reading happens on,
                        every number here was invisible. The title stays for the
                        pointer users it does serve. */}
                    {cell.state === "filled" && cell.count}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
      {/* The dashed state cannot explain itself the way a number can, and its
          only explanation used to be a tooltip. One line, always shown. */}
      <p className="flex items-center gap-2 text-sm text-muted">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-6 shrink-0 rounded border-2 border-dashed border-accent"
        />
        {t.breadthStarted}
      </p>
    </div>
  );
}
