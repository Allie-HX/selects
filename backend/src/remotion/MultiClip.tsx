import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { parseSrt, createTikTokStyleCaptions } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Inter";
import { brand } from "./brand.js";

const { fontFamily } = loadFont();

interface SegmentProps {
  clipUrl: string;
  startSeconds: number;
  endSeconds: number;
}

interface MultiClipProps extends Record<string, unknown> {
  segments: SegmentProps[];
  srtContents: string[];
  hookText: string;
  ctaText: string;
  durationInFrames?: number;
}

const FPS = 30;

export const MultiClip: React.FC<MultiClipProps> = ({
  segments,
  srtContents,
  hookText,
  ctaText,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  let frameOffset = 0;
  const segmentTimings = segments.map((seg) => {
    const segDuration = Math.round((seg.endSeconds - seg.startSeconds) * FPS);
    const start = frameOffset;
    frameOffset += segDuration;
    return { ...seg, startFrame: start, durationFrames: segDuration };
  });

  const showHook = frame < FPS * 3;
  const showCta = frame > durationInFrames - FPS * 4;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {segmentTimings.map((seg, i) => (
        <Sequence
          key={i}
          from={seg.startFrame}
          durationInFrames={seg.durationFrames}
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={seg.clipUrl}
              startFrom={Math.round(seg.startSeconds * FPS)}
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
            <CaptionOverlay
              srtContent={srtContents[i] ?? ""}
              segmentStartSeconds={seg.startSeconds}
            />
          </AbsoluteFill>
        </Sequence>
      ))}

      {showHook && hookText && (
        <HookOverlay text={hookText} frame={frame} fps={fps} />
      )}

      {showCta && ctaText && (
        <CtaOverlay
          text={ctaText}
          frame={frame - (durationInFrames - FPS * 4)}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
};

function CaptionOverlay({
  srtContent,
  segmentStartSeconds,
}: {
  srtContent: string;
  segmentStartSeconds: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (segmentStartSeconds + frame / fps) * 1000;

  if (!srtContent) return null;

  const { captions } = parseSrt({ input: srtContent });
  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: brand.captions.combineWithinMs,
  });

  const currentPage = pages.find(
    (p) => currentTimeMs >= p.startMs && currentTimeMs < p.startMs + p.durationMs
  );

  if (!currentPage) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: brand.captions.position.bottom,
        left: brand.captions.position.left,
        right: brand.captions.position.right,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 10px",
        }}
      >
        {currentPage.tokens.map((token, i) => {
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

function HookOverlay({
  text,
  frame,
  fps,
}: {
  text: string;
  frame: number;
  fps: number;
}) {
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 180 }, durationInFrames: 10 });
  const opacity = frame < fps * 2.5 ? 1 : Math.max(0, 1 - (frame - fps * 2.5) / (fps * 0.5));

  return (
    <div
      style={{
        position: "absolute",
        top: 160,
        left: 40,
        right: 40,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 64,
          fontWeight: brand.font.weights.title,
          color: brand.colors.yellow,
          textAlign: "center",
          textShadow: "2px 2px 0px rgba(0,0,0,0.8)",
          textTransform: "uppercase",
          letterSpacing: brand.font.letterSpacing,
          lineHeight: 1.05,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function CtaOverlay({
  text,
  frame,
  fps,
}: {
  text: string;
  frame: number;
  fps: number;
}) {
  const slideUp = spring({ frame, fps, config: { damping: 15, stiffness: 200 }, durationInFrames: 12 });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 120 + (1 - slideUp) * 80,
        left: 40,
        right: 40,
        display: "flex",
        justifyContent: "center",
        opacity: slideUp,
      }}
    >
      <div
        style={{
          background: brand.colors.purple,
          borderRadius: 12,
          padding: "12px 24px",
          border: "2px solid rgba(255,255,255,0.2)",
        }}
      >
        <span
          style={{
            fontFamily,
            fontSize: 36,
            fontWeight: brand.font.weights.title,
            color: brand.colors.white,
            textAlign: "center",
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
