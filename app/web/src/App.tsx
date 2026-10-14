import { useEffect, useState } from 'react';

type Status = { busy: boolean; operation: string | null };

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>Challenges</h1>
      <p>
        {error
          ? 'No se pudo contactar al orquestador local.'
          : status
            ? `Servidor disponible · ${status.busy ? `ocupado (${status.operation})` : 'libre'}`
            : 'Conectando…'}
      </p>
    </main>
  );
}
