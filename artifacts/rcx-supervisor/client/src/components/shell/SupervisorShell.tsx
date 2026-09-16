import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Button } from "@ringcentral/spring-ui";

type ShellArea = "agent" | "analytics";

type NavigationProps = {
  activeArea: ShellArea;
  onNavigate: (path: "/" | "/analytics") => void;
};

type ShellProps = NavigationProps & {
  children: ReactNode;
  header: ReactNode;
};

export type SupervisorHeaderState = {
  engaged?: boolean;
  elapsed?: string;
  engagedSinceMs?: number;
  availableSinceMs?: number;
};

type SupervisorHeaderStateContextValue = {
  state: SupervisorHeaderState;
  setState: Dispatch<SetStateAction<SupervisorHeaderState>>;
};

const SupervisorHeaderStateContext =
  createContext<SupervisorHeaderStateContextValue | null>(null);

export function useSupervisorHeaderState() {
  const context = useContext(SupervisorHeaderStateContext);
  if (!context) {
    throw new Error(
      "useSupervisorHeaderState must be used inside SupervisorShell",
    );
  }
  return context;
}

type NavItem = {
  label: string;
  icon: string;
  badge?: string;
  destination?: "/" | "/analytics";
};

const primaryNavigation: NavItem[] = [
  { label: "Message", icon: "/figmaAssets/icon-bubble-lines-border.svg", badge: "6" },
  { label: "Video", icon: "/figmaAssets/icon-videocam-border.svg" },
  { label: "Phone", icon: "/figmaAssets/icon-phone-border.svg" },
  {
    label: "Agent",
    icon: "/figmaAssets/icon-engage-border-1.svg",
    destination: "/",
  },
  {
    label: "Analytics",
    icon: "/figmaAssets/icon-analytics-border.svg",
    destination: "/analytics",
  },
  { label: "Contacts", icon: "/figmaAssets/phone-inbox-border-1.svg" },
  { label: "More", icon: "/figmaAssets/icon-more-horiz.svg" },
];

const utilityNavigation: NavItem[] = [
  { label: "Apps", icon: "/figmaAssets/icon-default-integration-border.svg" },
  { label: "Settings", icon: "/figmaAssets/icon-settings-border.svg" },
  { label: "Help", icon: "/figmaAssets/icon-help-border.svg" },
];

/** Renders the frame's original SVG asset without token recoloring. */
export function ShellIcon({
  src,
  className = "h-4 w-4",
  active = false,
  color,
}: {
  src: string;
  className?: string;
  active?: boolean;
  tone?: "neutral" | "static";
  color?: string;
}) {
  if (active || color) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
        style={{
          backgroundColor: active ? "#066fac" : color,
          maskImage: `url(${src})`,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskImage: `url(${src})`,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
        }}
      />
    );
  }

  return (
    <img
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      src={src}
      alt=""
    />
  );
}

function NavigationItem({
  item,
  activeArea,
  onNavigate,
}: NavigationProps & { item: NavItem }) {
  const isActive =
    item.destination === "/" ? activeArea === "agent" : item.destination === "/analytics" ? activeArea === "analytics" : false;

  return (
    <Button
      type="button"
      variant="text"
      color="neutral"
      aria-current={isActive ? "page" : undefined}
      aria-label={item.destination ? `Open ${item.label}` : item.label}
      onClick={() => item.destination && onNavigate(item.destination)}
      className="relative flex min-h-10 w-20 flex-col items-center justify-center px-0 py-[5px]"
      style={{
        height: 52,
        minHeight: 52,
        width: 80,
        gap: 0,
        borderRadius: 0,
        backgroundColor: isActive
          ? "#066fac1f"
          : "transparent",
        color: isActive
          ? "#066fac"
          : "#121212",
      }}
    >
      <ShellIcon
        src={item.icon}
        className="relative h-6 w-6"
        active={isActive}
        color="#121212"
      />
      <span className="mt-0.5 flex h-4 items-center justify-center self-stretch text-center font-caption-2 text-[length:var(--caption-2-font-size)] font-[number:var(--caption-2-font-weight)] leading-[var(--caption-2-line-height)] tracking-[var(--caption-2-letter-spacing)] [font-style:var(--caption-2-font-style)]">
        {item.label}
      </span>
      {item.badge ? (
        <span
          className="absolute right-[22px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white bg-[#ff8800] font-caption-1 text-[length:var(--caption-1-font-size)] font-[number:var(--caption-1-font-weight)] leading-[var(--caption-1-line-height)] tracking-[var(--caption-1-letter-spacing)] text-white [font-style:var(--caption-1-font-style)]"
          style={{
            backgroundColor: "#ff8800",
            borderColor: "#ffffff",
            color: "#ffffff",
          }}
        >
          {item.badge}
        </span>
      ) : null}
    </Button>
  );
}

/** The lightweight, proto-free part of the RingCX application shell. */
export function SupervisorNavigation(props: NavigationProps) {
  return (
    <aside
      data-name="Side nav"
      className="flex w-20 shrink-0 flex-col justify-between border-r border-neutral-200 bg-navb-02 py-4"
    >
      <nav className="flex flex-col" aria-label="Primary navigation">
        {primaryNavigation.map((item) => (
          <NavigationItem key={item.label} item={item} {...props} />
        ))}
      </nav>
      <nav className="flex flex-col" aria-label="Utility navigation">
        {utilityNavigation.map((item) => (
          <NavigationItem key={item.label} item={item} {...props} />
        ))}
      </nav>
    </aside>
  );
}

type HeaderProps = {
  activeControls?: ReactNode;
  engaged?: boolean;
  elapsed?: string;
  onBack?: () => void;
  onForward?: () => void;
  onPresence?: () => void;
  onDialer?: () => void;
  onAddCall?: () => void;
};

/**
 * The common Supervisor app-bar contents. Dynamic call controls remain an
 * injected slot so Analytics never imports the legacy preview/takeover stores.
 */
export function SupervisorHeader({
  activeControls,
  engaged = false,
  elapsed,
  onBack,
  onForward,
  onPresence,
  onDialer,
  onAddCall,
}: HeaderProps) {
  const headerContext = useContext(SupervisorHeaderStateContext);
  const resolvedEngaged = headerContext?.state.engaged ?? engaged;
  const resolvedElapsed = headerContext?.state.elapsed ?? elapsed;
  const elapsedSince = resolvedEngaged
    ? headerContext?.state.engagedSinceMs ?? null
    : headerContext?.state.availableSinceMs ?? null;
  const liveElapsed = useShellElapsedSince(elapsedSince);
  const neutralSurface = "var(--sui-colors-neutral-w0)";
  const headerOverlay = "var(--sui-colors-neutral-static-w0-t20)";
  const foreground = "var(--sui-colors-neutral-b1)";
  const displayElapsed = elapsedSince === null ? resolvedElapsed ?? liveElapsed : liveElapsed;

  return (
    <div className="relative flex h-full w-full items-center bg-[url('/figmaAssets/appbar-bg.svg')] bg-cover bg-center px-4 pl-5">
      <div className="flex items-center gap-4">
        <Button type="button" variant="text" color="neutral" className="relative h-10 w-10 p-0" aria-label="Account">
          <div className="relative h-10 w-10 overflow-hidden rounded-full" style={{ backgroundColor: neutralSurface }}>
            <img className="h-full w-full object-cover" alt="" src="/figmaAssets/image-1-1.png" />
          </div>
          <ShellIcon src="/figmaAssets/presence.svg" className="absolute bottom-0 right-0 h-3.5 w-3.5" tone="static" />
        </Button>
        <h1 className="font-headline-2 text-[length:var(--headline-2-font-size)] font-[number:var(--headline-2-font-weight)] leading-[var(--headline-2-line-height)] tracking-[var(--headline-2-letter-spacing)] [font-style:var(--headline-2-font-style)]" style={{ color: "var(--sui-colors-neutral-static-w0)" }}>
          RingCentral, Inc.
        </h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="text" color="neutral" aria-label="Back" onClick={onBack} className="flex h-8 w-8 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: headerOverlay }}>
            <ShellIcon src="/figmaAssets/icon-chevron-left.svg" tone="static" />
          </Button>
          <Button type="button" variant="text" color="neutral" aria-label="Forward" onClick={onForward} className="flex h-8 w-8 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: headerOverlay }}>
            <ShellIcon src="/figmaAssets/icon-chevron-right.svg" tone="static" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 px-2 pl-3 pr-3">
        <div className="relative w-full max-w-[468px]">
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ backgroundColor: headerOverlay }} />
          <div className="relative flex h-8 items-center gap-2 px-3">
            <ShellIcon src="/figmaAssets/icon-search-nav.svg" tone="static" />
            <span className="font-button text-[length:var(--button-font-size)] font-[number:var(--button-font-weight)] leading-[var(--button-line-height)] tracking-[var(--button-letter-spacing)] [font-style:var(--button-font-style)] opacity-60" style={{ color: "var(--sui-colors-neutral-static-w0)" }}>Search</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 self-stretch">
        <div
          id="supervisor-header-controls"
          data-name="Supervisor header controls"
          className="contents"
        >
          {activeControls}
        </div>
        <Button type="button" variant="text" color="neutral" onClick={onPresence} className="flex h-8 w-[164px] min-w-0 items-center gap-1 rounded-2xl px-3 ml-[0px] mr-[0px] pl-[8px] pr-[8px]" style={{ backgroundColor: neutralSurface }}>
          {resolvedEngaged ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" style={{ backgroundColor: "var(--sui-colors-danger-f)" }} /> : <ShellIcon src="/figmaAssets/presence.svg" className="h-3.5 w-3.5" />}
          <ShellIcon src="/figmaAssets/icon-engage-border.svg" />
          <div className="flex flex-1 items-center justify-between gap-1" style={{ color: foreground }}>
            <span className="font-caption-1">{resolvedEngaged ? "Engaged" : "Available"}</span>
            <span className="whitespace-nowrap font-caption-1">{displayElapsed}</span>
          </div>
          <ShellIcon src="/figmaAssets/icon-arrow-down.svg" />
        </Button>
        <Button type="button" variant="text" color="neutral" aria-label="Open dialer" onClick={onDialer} className="flex h-8 w-8 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: neutralSurface }}>
          <ShellIcon src="/figmaAssets/icon-dialer-s.svg" />
        </Button>
        <Button type="button" variant="text" color="neutral" aria-label="Start a call" onClick={onAddCall} className="flex h-8 w-8 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: neutralSurface }}>
          <ShellIcon src="/figmaAssets/icon-call-add.svg" />
        </Button>
      </div>
    </div>
  );
}

function formatElapsed(sinceMs: number | null) {
  if (sinceMs === null) return "00:00";
  const totalSeconds = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function useShellElapsedSince(sinceMs: number | null) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (sinceMs === null) return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sinceMs]);

  return formatElapsed(sinceMs);
}

/**
 * Shared structural shell. The header is a slot because legacy Supervisor
 * augments it with call controls while Analytics deliberately avoids those
 * proto stores and their eager imports.
 */
export function SupervisorShell({ children, header, ...navigation }: ShellProps) {
  const [headerState, setHeaderState] = useState<SupervisorHeaderState>(() => ({
    engaged: false,
    availableSinceMs: Date.now() - (21 * 60 + 1) * 1000,
  }));
  const wasEngagedRef = useRef(false);

  useEffect(() => {
    const isEngaged = Boolean(headerState.engaged);
    if (wasEngagedRef.current && !isEngaged) {
      setHeaderState((current) => ({
        ...current,
        availableSinceMs: Date.now(),
        engagedSinceMs: undefined,
      }));
    }
    wasEngagedRef.current = isEngaged;
  }, [headerState.engaged]);

  return (
    <SupervisorHeaderStateContext.Provider value={{ state: headerState, setState: setHeaderState }}>
      <main className="flex h-screen w-full flex-col overflow-clip bg-white">
        <header
          data-name="App bar"
          className="flex h-14 w-full shrink-0 items-center border-b"
          style={{
            backgroundColor: "var(--sui-colors-neutral-w0)",
            borderColor: "var(--sui-colors-neutral-b2)",
          }}
        >
          {header}
        </header>
        <div className="flex min-h-0 flex-1">
          <SupervisorNavigation {...navigation} />
          {children}
        </div>
      </main>
    </SupervisorHeaderStateContext.Provider>
  );
}