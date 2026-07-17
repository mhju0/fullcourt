import { ImageResponse } from "next/og";

export const alt = "FullCourt — NBA analytics: rest, fatigue, and shot value";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The C1 court mark, inlined as a data-URI so satori rasterizes it directly.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 72 48" fill="none"><defs><clipPath id="c"><rect x="6" y="7" width="60" height="34" rx="3"/></clipPath></defs><g clip-path="url(#c)"><path d="M6 7 H33 L39 41 H6 Z" fill="#3B82F6" fill-opacity="0.5"/><path d="M33 7 H66 V41 H39 Z" fill="#E5484D" fill-opacity="0.5"/><path d="M33 7 L39 41" stroke="#F2F4F7" stroke-width="2.4"/></g><rect x="6" y="7" width="60" height="34" rx="3" stroke="#F2F4F7" stroke-width="3"/><circle cx="36" cy="24" r="6" stroke="#F5A623" stroke-width="2.6"/></svg>`;
const MARK_SRC = `data:image/svg+xml,${encodeURIComponent(MARK)}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0A0B0D",
          padding: "72px 80px",
          color: "#F2F4F7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <img src={MARK_SRC} width={150} height={100} alt="" />
          <div style={{ display: "flex", fontSize: 32, letterSpacing: 3, color: "#8A929C" }}>
            NBA ANALYTICS PLATFORM
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: -1.5 }}>
            <span style={{ color: "#F2F4F7" }}>Full</span>
            <span style={{ color: "#F5A623" }}>Court</span>
          </div>
          <div style={{ display: "flex", fontSize: 38, color: "#B7BEC7", maxWidth: 960, lineHeight: 1.35 }}>
            Rest, fatigue, and shot value — the more-rested NBA team wins ~54.8% of the time.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 26, color: "#5B626C", letterSpacing: 2 }}>
          <div style={{ display: "flex", color: "#3B82F6", fontWeight: 700 }}>REST ADVANTAGE</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>40-SEASON BACKTEST</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>SHOT QUALITY</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
