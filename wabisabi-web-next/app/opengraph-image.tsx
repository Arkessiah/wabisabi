import { ImageResponse } from "next/og";

// Imagen OpenGraph generada en build (1200x630). Sin assets externos.
export const alt = "Wabi-Sabi - Collaborative AI Development Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#efece4",
          color: "#2a2622",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#8a8378",
          }}
        >
          AI Development Platform
        </div>
        <div style={{ fontSize: 120, fontWeight: 800, marginTop: 12, letterSpacing: -3 }}>
          Wabi-Sabi
        </div>
        <div style={{ fontSize: 38, marginTop: 20, color: "#57514a", maxWidth: 900 }}>
          Collaborative AI, with a unique economic model.
        </div>
      </div>
    ),
    { ...size },
  );
}
