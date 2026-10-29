import { CheckCheck, ListFilter } from 'lucide-react';

export function MatchModeControl({ label, name, value, disabled = false, onChange }: { label: string; name: string; value: 'any' | 'all'; disabled?: boolean; onChange(value: 'any' | 'all'): void }) {
  return <fieldset className="match-mode-group" disabled={disabled}><legend>{label}</legend><div className="segmented-control">
    <label><input type="radio" name={name} value="any" checked={value === 'any'} onChange={() => onChange('any')} /><ListFilter size={15} /><span>Any (OR)</span></label>
    <label><input type="radio" name={name} value="all" checked={value === 'all'} onChange={() => onChange('all')} /><CheckCheck size={15} /><span>All (AND)</span></label>
  </div></fieldset>;
}