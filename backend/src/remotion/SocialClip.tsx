import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { parseSrt, createTikTokStyleCaptions } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Inter";
import { brand } from "./brand";

const { fontFamily } = loadFont();

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
  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: brand.captions.combineWithinMs,
  });

  const currentPage = pages.find(
    (p) =>
      currentTimeMs >= p.startMs &&
      currentTimeMs < p.startMs + p.durationMs
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

      {currentPage && (
        <WordByWordCaptions
          page={currentPage}
          currentTimeMs={currentTimeMs}
          frame={frame}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
};

function WordByWordCaptions({
  page,
  currentTimeMs,
  frame,
  fps,
}: {
  page: { startMs: number; tokens: { text: string; fromMs: number; toMs: number }[] };
  currentTimeMs: number;
  frame: number;
  fps: number;
}) {
  const pageEntryFrame = Math.round((page.startMs / 1000) * fps);
  const localFrame = frame - pageEntryFrame;

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 200 },
    durationInFrames: 8,
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: brand.captions.position.bottom,
        left: brand.captions.position.left,
        right: brand.captions.position.right,
        display: "flex",
        justifyContent: "center",
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 10px",
          padding: `${brand.captions.padding.vertical}px ${brand.captions.padding.horizontal}px`,
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive =
            currentTimeMs >= token.fromMs && currentTimeMs < token.toMs;

          return (
            <span
              key={i}
              style={{
                fontFamily,
                fontSize: isActive
                  ? brand.captions.fontSize.highlight
                  : brand.captions.fontSize.default,
                fontWeight: brand.font.weights.title,
                letterSpacing: brand.font.letterSpacing,
                color: isActive
                  ? brand.captions.activeWordColor
                  : brand.captions.inactiveWordColor,
                textShadow: brand.captions.shadow,
                transition: "color 0.05s, font-size 0.05s",
                lineHeight: 1.2,
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
