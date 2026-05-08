import { Composition } from "remotion";
import { SocialClip } from "./SocialClip";
import { MultiClip } from "./MultiClip";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SocialClip"
        component={SocialClip}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={900}
        defaultProps={{
          videoUrl: "",
          srtContent: "",
        }}
        calculateMetadata={({ props }: { props: Record<string, unknown> }) => {
          return {
            durationInFrames:
              (props as { durationInFrames?: number }).durationInFrames ?? 900,
          };
        }}
      />
      <Composition
        id="MultiClip"
        component={MultiClip}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={900}
        defaultProps={{
          segments: [],
          srtContents: [],
          hookText: "",
          ctaText: "",
        }}
        calculateMetadata={({ props }: { props: Record<string, unknown> }) => {
          return {
            durationInFrames:
              (props as { durationInFrames?: number }).durationInFrames ?? 900,
          };
        }}
      />
    </>
  );
};
