import { AISList } from '../components/AISList';

export function AISPage() {
  return (
    <div className="page page--ais">
      <h1 className="sr-only">AIS targets</h1>
      <AISList />
    </div>
  );
}
