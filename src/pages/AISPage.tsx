import { AISList } from '../components/AISList';

export function AISPage({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <h1 className="sr-only">AIS targets</h1>
      <AISList compact={compact} />
    </>
  );
}
