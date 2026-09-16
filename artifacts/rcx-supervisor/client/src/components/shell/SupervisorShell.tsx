import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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

function iconStyle(
  icon: string,
  active = false,
  tone: "neutral" | "static" = "neutral",
): CSSProperties {
  return {
    backgroundColor:
      active
        ? "var(--sui-colors-primary-f)"
        : tone === "static"
        ? "var(--sui-colors-neutral-static-w0)"
        : "var(--sui-colors-neutral-b1)",
    maskImage: `url(${icon})`,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
    WebkitMaskImage: `url(${icon})`,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
  };
}

/** Applies the frame's semantic foreground to the supplied SVG asset. */
export function ShellIcon({
  src,
  className = "h-3.5 w-3.5",
  active = false,
  tone = "neutral",
}: {
  src: string;
  className?: string;
  active?: boolean;
  tone?: "neutral" | "static";
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      style={iconStyle(src, active, tone)}
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
      className="relative flex min-h-9 w-14 flex-col items-center justify-center px-0 py-1"
      style={{
        height: 38,
        minHeight: 38,
        width: 56,
        padding: "4px 0",
        gap: 0,
        borderRadius: 0,
        backgroundColor: isActive
          ? "var(--sui-colors-primary-f-t20)"
          : "transparent",
        color: isActive
          ? "var(--sui-colors-primary-f)"
          : "var(--sui-colors-neutral-b1)",
      }}
    >
      <ShellIcon src={item.icon} className="relative h-4 w-4" active={isActive} />
      <span className="mt-px flex h-3 items-center justify-center self-stretch text-center text-[10px] font-medium leading-3">
        {item.label}
      </span>
      {item.badge ? (
        <span
          className="absolute right-1 top-0 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium leading-none"
          style={{
            backgroundColor: "var(--sui-colors-warning)",
            borderColor: "var(--sui-colors-neutral-w0)",
            color: "var(--sui-colors-neutral-w0)",
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
      className="flex w-14 shrink-0 flex-col justify-between border-r border-neutral-200 bg-navb-02 py-2"
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
  const [availableSeconds, setAvailableSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setAvailableSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const neutralSurface = "var(--sui-colors-neutral-w0)";
  const headerOverlay = "var(--sui-colors-neutral-static-w0-t20)";
  const foreground = "var(--sui-colors-neutral-b1)";
  const liveElapsed = `${String(Math.floor(availableSeconds / 60)).padStart(2, "0")}:${String(availableSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="relative flex h-full w-full items-center bg-[url('/figmaAssets/appbar-bg.svg')] bg-cover bg-center px-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="text" color="neutral" className="relative h-8 w-8 p-0" aria-label="Account">
          <div className="relative h-8 w-8 overflow-hidden rounded-full" style={{ backgroundColor: neutralSurface }}>
            <img className="h-full w-full object-cover" alt="" src="/figmaAssets/image-1-1.png" />
          </div>
          <ShellIcon src="/figmaAssets/presence.svg" className="absolute bottom-0 right-0 h-3 w-3" tone="static" />
        </Button>
        <h1 className="font-headline-2 text-[length:var(--headline-2-font-size)] font-[number:var(--headline-2-font-weight)] leading-[var(--headline-2-line-height)] tracking-[var(--headline-2-letter-spacing)] [font-style:var(--headline-2-font-style)]" style={{ color: "var(--sui-colors-neutral-static-w0)" }}>
          RingCentral, Inc.
        </h1>
        <div className="flex items-center gap-1">
          <Button type="button" variant="text" color="neutral" aria-label="Back" onClick={onBack} className="flex h-6 w-6 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: headerOverlay }}>
            <ShellIcon src="/figmaAssets/icon-chevron-left.svg" tone="static" />
          </Button>
          <Button type="button" variant="text" color="neutral" aria-label="Forward" onClick={onForward} className="flex h-6 w-6 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: headerOverlay }}>
            <ShellIcon src="/figmaAssets/icon-chevron-right.svg" tone="static" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 px-2">
        <div className="relative w-full max-w-[400px]">
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ backgroundColor: headerOverlay }} />
          <div className="relative flex h-7 items-center gap-2 px-3">
            <ShellIcon src="/figmaAssets/icon-search-nav.svg" tone="static" />
            <span className="font-button text-[length:var(--button-font-size)] font-[number:var(--button-font-weight)] leading-[var(--button-line-height)] tracking-[var(--button-letter-spacing)] [font-style:var(--button-font-style)] opacity-60" style={{ color: "var(--sui-colors-neutral-static-w0)" }}>Search</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 self-stretch">
        {activeControls}
        <Button type="button" variant="text" color="neutral" onClick={onPresence} className="flex h-7 w-[124px] min-w-0 items-center gap-1 rounded-2xl px-2" style={{ backgroundColor: neutralSurface }}>
          {engaged ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" style={{ backgroundColor: "var(--sui-colors-danger-f)" }} /> : <ShellIcon src="/figmaAssets/presence.svg" className="h-3.5 w-3.5" />}
          <ShellIcon src="/figmaAssets/icon-engage-border.svg" />
          <div className="flex flex-1 items-center justify-between gap-1" style={{ color: foreground }}>
            <span className="font-caption-1">{engaged ? "Engaged" : "Available"}</span>
            <span className="whitespace-nowrap font-caption-1">{elapsed ?? liveElapsed}</span>
          </div>
          <ShellIcon src="/figmaAssets/icon-arrow-down.svg" />
        </Button>
        <Button type="button" variant="text" color="neutral" aria-label="Open dialer" onClick={onDialer} className="flex h-7 w-7 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: neutralSurface }}>
          <ShellIcon src="/figmaAssets/icon-dialer-s.svg" />
        </Button>
        <Button type="button" variant="text" color="neutral" aria-label="Start a call" onClick={onAddCall} className="flex h-7 w-7 min-w-0 items-center justify-center rounded-full p-0" style={{ backgroundColor: neutralSurface }}>
          <ShellIcon src="/figmaAssets/icon-call-add.svg" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Shared structural shell. The header is a slot because legacy Supervisor
 * augments it with call controls while Analytics deliberately avoids those
 * proto stores and their eager imports.
 */
export function SupervisorShell({ children, header, ...navigation }: ShellProps) {
  return (
    <main className="flex h-screen w-full flex-col overflow-clip bg-white">
      <header
        data-name="App bar"
        className="flex h-11 w-full shrink-0 items-center border-b"
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
  );
}