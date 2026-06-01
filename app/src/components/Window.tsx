import type { CSSProperties, ReactNode } from "react";

/**
 * A terminal-style panel: thin border, hard offset shadow, a header with an
 * orange marker and a monospace title. Sharp corners — not a rounded SaaS box.
 */
export function Window({
  title,
  children,
  tile = false,
  className = "",
  bodyStyle,
}: {
  title: ReactNode;
  children: ReactNode;
  tile?: boolean;
  className?: string;
  bodyStyle?: CSSProperties;
}) {
  return (
    <div className={`window ${tile ? "tile" : ""} ${className}`}>
      <div className="titlebar">
        <span className="marker" />
        <span className="win-title">{title}</span>
      </div>
      <div className="win-body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}
