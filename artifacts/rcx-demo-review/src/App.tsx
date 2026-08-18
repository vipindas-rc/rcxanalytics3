import { useSearch, useLocation, Router as WouterRouter } from 'wouter';

type View = 'supervisor' | 'agent';

const RC_BLUE = '#0073CF';

function ReviewPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const activeView: View = params.get('tab') === 'agent' ? 'agent' : 'supervisor';

  const views: { view: View; src: string; title: string }[] = [
    {
      view: 'supervisor',
      src: '/?view=supervisor-2&mode=review',
      title: 'Supervisor — CP Suggestion',
    },
    {
      view: 'agent',
      src: '/?view=agent-2&mode=review',
      title: 'Agent — CP Suggestion',
    },
  ];

  function switchTab(tab: View) {
    navigate(`?tab=${tab}`, { replace: true });
  }

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
      {/* Slim header with view tab switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          background: '#fff',
          borderBottom: '1px solid #e5e5e5',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#888',
            marginRight: '4px',
            letterSpacing: '0.01em',
          }}
        >
          CP: Suggestion
        </span>

        {(['supervisor', 'agent'] as View[]).map((view) => {
          const label = view === 'supervisor' ? 'Supervisor' : 'Agent';
          const active = activeView === view;
          return (
            <button
              key={view}
              onClick={() => switchTab(view)}
              aria-pressed={active}
              style={{
                fontSize: '14px',
                fontWeight: active ? 600 : 400,
                color: active ? '#fff' : '#333',
                background: active ? RC_BLUE : '#f2f2f2',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 20px',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                lineHeight: '1.4',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Both iframes stay mounted; tabs only toggle visibility. Reloading
          the prototype on every switch is what made switching slow — now
          each view loads once and switching is instant (and each view keeps
          its in-app state). */}
      <div style={{ flex: 1, position: 'relative' }}>
        {views.map(({ view, src, title }) => (
          <iframe
            key={view}
            src={src}
            title={title}
            style={{
              position: 'absolute',
              inset: 0,
              border: 'none',
              width: '100%',
              height: '100%',
              display: activeView === view ? 'block' : 'none',
            }}
            allow="autoplay; clipboard-write"
          />
        ))}
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
