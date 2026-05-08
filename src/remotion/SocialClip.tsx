import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { parseSrt } from "@remotion/captions";

export interface SocialClipProps extends Record<string, unknown> {
  videoUrl: string;
  srtContent: string;
  durationInFrames?: number;
}

export const SocialClip: React.FC<SocialClipProps> = ({
  videoUrl,
  srtContent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  const { captions } = parseSrt({ input: srtContent });

  const currentCaption = captions.find(
    (c) => currentTimeMs >= c.startMs && currentTimeMs < c.endMs
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {videoUrl && (
        <OffthreadVideo
          src={videoUrl}
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            height: "100%",
            width: "auto",
            minWidth: "100%",
            objectFit: "cover",
          }}
        />
      )}

      {currentCaption && (
        <div
          style={{
            position: "absolute",
            bottom: 200,
            left: 40,
            right: 40,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: 52,
              fontWeight: 700,
              color: "#fff",
              textAlign: "center",
              lineHeight: 1.3,
              textShadow:
                "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)",
              padding: "8px 16px",
              backgroundColor: "rgba(0,0,0,0.4)",
              borderRadius: 12,
            }}
          >
            {currentCaption.text.trim()}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
