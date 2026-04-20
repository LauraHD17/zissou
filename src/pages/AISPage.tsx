import { AISList } from '../ais/AISList';

export function AISPage({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <h2 className="sr-only">AIS targets</h2>
      <AISList compact={compact} />
    </>
  );
}
