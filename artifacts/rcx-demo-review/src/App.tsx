import { useEffect, useState } from 'react';
import { useSearch, useLocation, Router as WouterRouter } from 'wouter';
import { trackEvent } from './lib/analytics';

type View = 'supervisor' | 'agent';

const RC_BLUE = '#0073CF';

function ReviewPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const activeView: View = params.get('tab') === 'agent' ? 'agent' : 'supervisor';
  const [mountedViews, setMountedViews] = useState<Set<View>>(
    () => new Set([activeView]),
  );

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
    if (tab === activeView) return;
    navigate(`?tab=${tab}`, { replace: true });
    trackEvent('review_role_changed', {
      role: tab,
      previous_role: activeView,
    });
  }

  // Mount the newly selected view immediately, but don't boot the second full
  // prototype until the first one has had a chance to become usable.
  useEffect(() => {
    setMountedViews((current) => {
      if (current.has(activeView)) return current;
      const next = new Set(current);
      next.add(activeView);
      return next;
    });
  }, [activeView]);

  function preloadInactiveView() {
    const preload = () => {
      setMountedViews((current) => {
        if (current.size === views.length) return current;
        return new Set(views.map(({ view }) => view));
      });
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preload, { timeout: 1500 });
    } else {
      setTimeout(preload, 250);
    }
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

      {/* The selected iframe loads first. The second full prototype is mounted
          after the first iframe finishes loading, so duplicate application
          startup doesn't delay the first usable review. Once mounted, both
          views stay alive and switching preserves each view's state. */}
      <div style={{ flex: 1, position: 'relative' }}>
        {views
          .filter(({ view }) => mountedViews.has(view))
          .map(({ view, src, title }) => (
            <iframe
              key={view}
              src={src}
              title={title}
              onLoad={view === activeView ? preloadInactiveView : undefined}
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
