import { CLASSIFICATION_META, MOVE_CLASSIFICATIONS, type ReviewReport } from '@chess/types';
import { ClassificationBadge } from '@/components/board/ClassificationBadge';

/** Accuracy, single-game rating estimate and per-classification counts for both players. */
export function ReviewSummary({
  report,
  names,
}: {
  report: ReviewReport;
  names: { white: string; black: string };
}) {
  const sides = [
    { key: 'white', name: names.white },
    { key: 'black', name: names.black },
  ] as const;

  return (
    <section aria-label="Review summary" className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {sides.map(({ key, name }) => (
          <div key={key} className="rounded-(--radius-control) bg-surface-raised p-3 text-center">
            <p className="truncate text-sm text-text-muted">{name}</p>
            <p className="tabular text-3xl font-bold" aria-label={`${name} accuracy`}>
              {report.accuracy[key].toFixed(1)}
            </p>
            <p className="text-xs text-text-muted">Accuracy</p>
            <p
              className="tabular mt-2 text-lg font-semibold"
              aria-label={`${name} estimated rating`}
            >
              {report.estimatedRating[key] ?? '—'}
            </p>
            <p className="text-xs text-text-muted">Game rating</p>
          </div>
        ))}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Moves by classification</caption>
        <thead>
          <tr className="text-text-muted">
            <th scope="col" className="sr-only">
              Classification
            </th>
            <th scope="col" className="w-12 font-medium">
              {names.white}
            </th>
            <th scope="col" className="w-12 font-medium">
              {names.black}
            </th>
          </tr>
        </thead>
        <tbody>
          {MOVE_CLASSIFICATIONS.map((c) => (
            <tr key={c} className="border-t border-border">
              <th scope="row" className="flex items-center gap-2 py-1.5 text-left font-medium">
                <ClassificationBadge classification={c} />
                {CLASSIFICATION_META[c].label}
              </th>
              <td className="tabular text-center">{report.counts.white[c]}</td>
              <td className="tabular text-center">{report.counts.black[c]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
