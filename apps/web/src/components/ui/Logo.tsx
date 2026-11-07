/** ShiftPatch brand: two overlapping rounded squares in an app-icon tile + wordmark (docs/design/DESIGN.md). */
export function Logo({ size = 36, inverse = false, wordSize }: { size?: number; inverse?: boolean; wordSize?: number }) {
  return (
    <span className="logo" style={{ gap: size > 40 ? 12 : 10 }}>
      <svg className="mark" style={{ width: size, height: size }} viewBox="0 0 48 48" aria-hidden="true">
        {inverse ? (
          <>
            <rect fill="#fff" width="48" height="48" rx="12" />
            <rect fill="#0E5A55" x="11" y="11" width="19" height="19" rx="5" />
            <rect className="m-b" style={{ stroke: "#fff" }} x="19" y="19" width="19" height="19" rx="5" />
          </>
        ) : (
          <>
            <rect className="m-bg" width="48" height="48" rx="12" />
            <rect className="m-a" x="11" y="11" width="19" height="19" rx="5" />
            <rect className="m-b" x="19" y="19" width="19" height="19" rx="5" />
          </>
        )}
      </svg>
      <span className="wordmark" style={{ fontSize: wordSize, color: inverse ? "#fff" : undefined }}>
        Shift<b style={{ color: inverse ? "#fff" : undefined }}>Patch</b>
      </span>
    </span>
  );
}
