import { Composition } from "remotion";
import { SocialClip } from "./SocialClip";

export const RemotionRoot: React.FC = () => {
  return (
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
      calculateMetadata={({ props }) => {
        return {
          durationInFrames:
            (props as { durationInFrames?: number }).durationInFrames ?? 900,
        };
      }}
    />
  );
};
