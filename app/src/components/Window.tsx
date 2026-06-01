import type { CSSProperties, ReactNode } from "react";

/**
 * A warm "OS window" panel: title bar with traffic-light controls + a
 * monospace filename-style title, and a body.
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
        <span className="win-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="win-title">{title}</span>
      </div>
      <div className="win-body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}
