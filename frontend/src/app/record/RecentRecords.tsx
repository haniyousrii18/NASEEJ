import React from 'react';
import { useApiData } from '../api.js';
import { formatDate, nameOf } from '../format.js';
import { Async, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ProvenancePill, ReviewPill } from './badges.js';
import { titleOf, type TimelineItem } from './Timeline.js';

/**
 * A short list of the latest records of one or more types, each with its source, date, author and review state.
 * Used by summaries; the full filterable list is the Timeline.
 */
export const RecentRecords: React.FC<{ endpoint: string; types: TimelineItem['type'][]; limit?: number; emptyText: string }> = ({
  endpoint,
  types,
  limit = 4,
  emptyText,
}) => {
  const A = useA();
  const { state, reload } = useApiData<TimelineItem[]>(`${endpoint}?type=${types.join(',')}&limit=${limit}`);
  return (
    <Async state={state} onRetry={reload} isEmpty={(d) => d.length === 0} empty={<p className="na-muted">{emptyText}</p>}>
      {(items) => (
        <ul className="na-list">
          {items.map((i) => (
            <li key={i.id} className="na-list-item">
              <strong>{titleOf(i, A)}</strong>
              {i.type === 'lab_result' && (
                <span className="na-ltr">
                  {String(i.data.value)} {String(i.data.unit ?? '')}
                </span>
              )}
              <div className="na-row">
                <ProvenancePill provenance={i.provenance} />
                <ReviewPill status={i.reviewStatus} />
                {i.isExternal && <Pill tone="lilac">{A.common.record.external}</Pill>}
              </div>
              <span className="na-muted">
                {[formatDate(A.lang, i.occurredAt, i.type === 'visit'), nameOf(A.lang, i.organization), nameOf(A.lang, i.author)].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Async>
  );
};
