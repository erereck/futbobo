import type { ReactNode, SVGProps } from "react";

export type FutboboIconName =
  | "arrow-left"
  | "arrow-right"
  | "ball"
  | "career"
  | "check"
  | "download"
  | "globe"
  | "hall"
  | "history"
  | "hourglass"
  | "medical"
  | "medal"
  | "microphone"
  | "news"
  | "play"
  | "player"
  | "settings"
  | "stats"
  | "trend-down"
  | "trend-up"
  | "tag"
  | "team"
  | "trophy"
  | "wallet";

type FutboboIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: FutboboIconName;
  size?: number | string;
};

const paths: Record<FutboboIconName, ReactNode> = {
  "arrow-left": <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  "arrow-right": <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7ZM9 9.2 5.7 8M15 9.2 18.3 8M10.1 12.7 8 16m5.9-3.3L16 16M8 16l.5 3.1M16 16l-.5 3.1" /></>,
  career: <><path d="M6 21V4" /><path d="M6 5h10l-2.5 4L16 13H6" /><circle cx="6" cy="3" r="1" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.7L16.5 9" /></>,
  download: <><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 15v4h14v-4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.7 2.5 4 5.5 4 9s-1.3 6.5-4 9c-2.7-2.5-4-5.5-4-9s1.3-6.5 4-9Z" /></>,
  hall: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v2a4 4 0 0 0 4 4M16 6h3v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6" /></>,
  history: <><path d="M7 4v16" /><circle cx="7" cy="7" r="2" /><circle cx="7" cy="17" r="2" /><path d="M11 7h7M11 17h7M11 12h5" /></>,
  hourglass: <><path d="M7 3h10M7 21h10M8 3c0 4 1.5 6.2 4 9-2.5 2.8-4 5-4 9M16 3c0 4-1.5 6.2-4 9 2.5 2.8 4 5 4 9" /></>,
  medical: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M9 5V3h6v2M12 9v7M8.5 12.5h7" /></>,
  medal: <><path d="m8 3 4 6 4-6M9 3H6l4 7M15 3h3l-4 7" /><circle cx="12" cy="15" r="5" /><path d="m12 12.5.8 1.6 1.7.2-1.2 1.2.3 1.8-1.6-.8-1.6.8.3-1.8-1.2-1.2 1.7-.2.8-1.6Z" /></>,
  microphone: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 10a6 6 0 0 0 12 0M12 16v5M8 21h8" /></>,
  news: <><path d="M4 13V8l12-4v13L4 13Z" /><path d="M16 8.5a4 4 0 0 1 0 4M7 14l1 6h4l-1-5" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" /></>,
  player: <><path d="m8 4-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a5 5 0 0 1-8 0Z" /><path d="M10 4c.5 1 1.2 1.5 2 1.5S13.5 5 14 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7 2-.7Z" /></>,
  stats: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M3 20h18" /></>,
  "trend-down": <><path d="M4 7h5l3 4 3-3 5 7" /><path d="M16 15h4v-4" /></>,
  "trend-up": <><path d="M4 17h5l3-4 3 3 5-7" /><path d="M16 9h4v4" /></>,
  tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z" /><circle cx="8.5" cy="8.5" r="1.5" /></>,
  team: <><circle cx="8.5" cy="8" r="3" /><circle cx="17" cy="9" r="2.2" /><path d="M3.5 20c.5-4 2.2-6 5-6s4.6 2 5.1 6M14 15.2c3.5-.6 5.6 1 6.5 4.8" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v2a4 4 0 0 0 5 4M16 6h4v2a4 4 0 0 1-5 4M12 13v5M8 21h8M9 18h6" /></>,
  wallet: <><path d="M4 7h14a2 2 0 0 1 2 2v9H6a2 2 0 0 1-2-2V7Z" /><path d="M4 7V6a2 2 0 0 1 2-2h11v3M15 11h5v4h-5a2 2 0 0 1 0-4Z" /></>,
};

export default function FutboboIcon({ name, size = "1em", className, ...props }: FutboboIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={["futbobo-icon", className].filter(Boolean).join(" ")}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" vectorEffect="non-scaling-stroke">
        {paths[name]}
      </g>
    </svg>
  );
}
