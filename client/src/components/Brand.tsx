export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" role="img" aria-label="Logo ValueConvert">
      <rect width="38" height="38" rx="11" fill="#FFFFFF" />
      <path
        d="M10 15h17M23 11l4 4-4 4M28 24H11M15 20l-4 4 4 4"
        fill="none"
        stroke="#0E7C86"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <Logo />
      <span>ValueConvert</span>
    </div>
  );
}
