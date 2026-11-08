import React, { useId } from 'react';
import { AppIcon } from '../AppIcons.js';
import { Button } from '../ui.js';
import { useA } from '../useA.js';
import { fill } from '../format.js';

/**
 * One filter pattern for every list: an optional search box, a "Filters" button that opens the panel, the active
 * filters as removable chips (always visible, so a hidden filter can never silently shorten a list), and one reset.
 * Filters apply as they are chosen; "Done" only closes the panel.
 */
export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export const SearchField: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ id, label, value, onChange, placeholder }) => {
  const A = useA();
  return (
    <div className="hp-search" role="search">
      <label className="hp-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <AppIcon name="search" size={18} className="hp-search-icon" />
      <input id={id} type="search" className="na-input" dir="auto" value={value} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="hp-search-clear" aria-label={A.health.common.searchClear} onClick={() => onChange('')}>
          <AppIcon name="close" size={16} />
        </button>
      )}
    </div>
  );
};

/** The button that opens a FilterBar's panel. FilterBar draws it by default; a page can place it elsewhere. */
export const FilterToggle: React.FC<{ open: boolean; count: number; controls: string; onToggle: () => void }> = ({ open, count, controls, onToggle }) => {
  const C = useA().health.common;
  return (
    <Button small variant="quiet" className="hp-filters-btn" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <AppIcon name="settings" size={16} />
      {C.filters}
      {count > 0 && (
        <span className="hp-count" aria-label={fill(C.filtersOn, { n: count })}>
          {count}
        </span>
      )}
    </Button>
  );
};

export const FilterBar: React.FC<{
  search?: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string };
  open: boolean;
  onToggle: () => void;
  active: ActiveFilter[];
  onReset: () => void;
  /** The controls inside the panel (selects, dates, chips). */
  children?: React.ReactNode;
  /** The page shows the toggle itself (e.g. in its header), as a FilterToggle with the same `controls` id. */
  external?: { controls: string };
}> = ({ search, open, onToggle, active, onReset, children, external }) => {
  const A = useA();
  const C = A.health.common;
  const ownId = useId();
  const panelId = external?.controls ?? ownId;
  const hasPanel = !!children;
  // A page that draws the toggle itself has nothing to show here until the panel is open or a filter is on.
  if (external && !open && active.length === 0) return null;
  return (
    <div className="hp-filters">
      <div className="hp-filters-row">
        {search && <SearchField {...search} />}
        {hasPanel && !external && <FilterToggle open={open} count={active.length} controls={panelId} onToggle={onToggle} />}
      </div>
      {open && hasPanel && (
        <div className="hp-filters-panel" id={panelId} role="group" aria-label={C.filters}>
          {children}
          <div className="hp-filters-actions">
            <Button small variant="primary" onClick={onToggle}>
              {C.done}
            </Button>
          </div>
        </div>
      )}
      {active.length > 0 && (
        <ul className="hp-chiplist" aria-label={C.activeFilters}>
          {active.map((f) => (
            <li key={f.key} className="hp-chip">
              <span>{f.label}</span>
              <button type="button" aria-label={fill(C.removeFilter, { label: f.label })} onClick={f.onRemove}>
                <AppIcon name="close" size={14} />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="hp-chip-clear" onClick={onReset}>
              {C.clearAll}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
};
