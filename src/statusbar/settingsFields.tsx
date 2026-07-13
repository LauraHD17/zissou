// Shared field components + input parsers for the Settings form. Split from
// SettingsButton so the form, its leaf controls, and the panel shell each
// live in one focused file.

import { setHeadingMode, useHeadingMode, type HeadingMode } from '../compass/compassStore';

/** Compact labeled numeric field with a unit suffix ("Draft (depth) [2.5] ft"). */
export function DimField({
  label,
  sublabel,
  unit,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  sublabel: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`settings-form__field settings-form__field--dim${disabled ? ' settings-form__field--disabled' : ''}`}
    >
      <span className="settings-form__field-label">
        {label} <span className="settings-form__field-sublabel">{sublabel}</span>
      </span>
      <span className="settings-form__input-wrap">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <span className="settings-form__unit" aria-hidden="true">
          {unit}
        </span>
      </span>
    </label>
  );
}

/** Heading-source tri-state — writes the compass store directly (no Save). */
export function HeadingModePicker() {
  const mode = useHeadingMode();
  const options: { value: HeadingMode; label: string }[] = [
    { value: 'auto', label: 'Auto (recommended)' },
    { value: 'cog', label: 'GPS course' },
    { value: 'compass', label: 'Compass' },
  ];
  return (
    <div className="settings-form__row" role="group" aria-label="Boat arrow heading source">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`tab${mode === o.value ? ' tab--active' : ''}`}
          aria-pressed={mode === o.value}
          onClick={() => setHeadingMode(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
