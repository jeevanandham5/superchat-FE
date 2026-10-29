import React from "react";

// line icons drawn on a 24px grid, sized and coloured by the parent
const Icon = ({ children, size = 20, strokeWidth = 2, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const SendIcon = (p) => (
  <Icon {...p}>
    <path d="M5 12h13" />
    <path d="M12 5l7 7-7 7" />
  </Icon>
);

export const MicIcon = (p) => (
  <Icon {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 18v4" />
  </Icon>
);

export const PaperclipIcon = (p) => (
  <Icon {...p}>
    <path d="M21.4 11.1l-8.9 8.9a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" />
  </Icon>
);

export const ImageIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 15l-5-5L5 21" />
  </Icon>
);

export const VideoIcon = (p) => (
  <Icon {...p}>
    <rect x="2" y="6" width="14" height="12" rx="3" />
    <path d="M16 10l6-3v10l-6-3" />
  </Icon>
);

export const MusicIcon = (p) => (
  <Icon {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Icon>
);

export const PlayIcon = (p) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </Icon>
);

export const PauseIcon = (p) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </Icon>
);

export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="M4 12l5 5L20 6" />
  </Icon>
);

export const DoubleCheckIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12l5 5L18 6" />
    <path d="M12 16l1 1L23 6" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </Icon>
);

export const LinkIcon = (p) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Icon>
);

export const LogOutIcon = (p) => (
  <Icon {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Icon>
);

export const DownloadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Icon>
);

export const ArrowLeftIcon = (p) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="M12 19l-7-7 7-7" />
  </Icon>
);

export const LogoMark = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="sc-logo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8B5CF6" />
        <stop offset="1" stopColor="#F472B6" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="18" fill="url(#sc-logo-g)" />
    <path
      d="M32 14c-10.5 0-19 7.2-19 16.2 0 4.9 2.5 9.3 6.5 12.3L18 50l8.6-3.7c1.7.4 3.5.6 5.4.6 10.5 0 19-7.2 19-16.2S42.5 14 32 14z"
      fill="#fff"
    />
    <path d="M34.5 20.5L26 32.5h6l-2.5 10 8.5-12h-6l2.5-10z" fill="#8B5CF6" />
  </svg>
);
