// A small own icon set (24x24, stroke based) so no icon library or external file is needed.
const PATHS = {
  dashboard: "M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z",
  projects: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  key: "M15 7a4 4 0 1 1-3.9 4.9L4 19v-3l2-2v-2h2l1.9-1.9A4 4 0 0 1 15 7Zm1 2h.01",
  devices: "M4 5h16v10H4V5Zm4 14h8m-4-4v4",
  server: "M4 5h16v5H4V5Zm0 9h16v5H4v-5Zm3-6.5h.01M7 16.5h.01",
  audit: "M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 5h6m-6 4h6m-6 4h3",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4",
  users: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-3 0-5 1.5-5 3.5V19h10v-2.5C13 14.5 11 13 8 13Zm8 0c-.5 0-1 0-1.5.1 1.5.9 2.5 2.2 2.5 3.4V19h4v-2.5c0-2-2-3.5-5-3.5Z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 4a7.5 7.5 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5Z",
  logout: "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5m5-4 4-4-4-4m4 4H9",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  lock: "M7 11V8a5 5 0 0 1 10 0v3m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z",
  warning: "M12 4 3 20h18L12 4Zm0 6v5m0 3h.01",
  check: "m5 12 5 5L20 7",
  copy: "M9 9h10v11H9V9Zm-4 6V4h10",
  refresh: "M20 6v5h-5M4 18v-5h5m10.5-2A8 8 0 0 0 6 7.5M4.5 13A8 8 0 0 0 18 16.5",
  wifi: "M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0m-3 3.5h.01",
  ethernet: "M7 4h10v8h-2v3h-2v3h-2v-3H9v-3H7V4Z",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6l1-7Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  empty: "M4 7h16v12H4V7Zm0 0 3-3h10l3 3M9 13h6",
  external: "M14 4h6v6m0-6-9 9M10 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5",
  terminal: "M4 17l6-5-6-5m8 10h8",
};


export default function Icon({ name, className = "nav-icon", size }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.empty} />
    </svg>
  );
}
