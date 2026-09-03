const SIDE_PANEL_TOGGLE_ICON =
  "/figmaAssets/icon-collapse-window.svg?v=2";

export function SidePanelToggleIcon({
  collapsed,
  inverted = false,
  className = "block size-4 transition-transform",
}: {
  collapsed: boolean;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`${className}${collapsed ? " rotate-180" : ""}`}
      style={inverted ? { filter: "brightness(0) invert(1)" } : undefined}
      src={SIDE_PANEL_TOGGLE_ICON}
    />
  );
}