import { useEffect } from 'react';
import { useSearch, useLocation, Router as WouterRouter } from 'wouter';

function ReviewPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  // The review shell no longer offers Agent mode. Clean up retired tab links
  // rather than preserving misleading, shareable state.
  useEffect(() => {
    if (search) navigate('', { replace: true });
  }, [navigate, search]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: '#fff',
        fontFamily: 'Lato, Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ flex: 1 }}>
        <iframe
          src="/?view=supervisor-2&mode=review"
          title="Supervisor — CP Suggestion"
          style={{ border: 'none', width: '100%', height: '100%' }}
          allow="autoplay; clipboard-write"
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ReviewPage />
    </WouterRouter>
  );
}

export default App;
