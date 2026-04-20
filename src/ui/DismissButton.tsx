// Tiny close control for chart-overlay pills. Text-based ("×") — no icon
// component, no rounded background, no hover lift. Just a 32×32 hit area
// so hands-in-gloves can find it.

interface Props {
  onClick: () => void;
  label: string;
}

export function DismissButton({ onClick, label }: Props) {
  return (
    <button type="button" className="pill-dismiss" onClick={onClick} aria-label={label}>
      ×
    </button>
  );
}
