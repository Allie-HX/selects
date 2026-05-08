export const brand = {
  font: {
    family: "Inter",
    weights: {
      title: 800,
      supporting: 500,
      subtitle: 400,
    },
    letterSpacing: -1,
    lineHeight: 0.95,
  },

  colors: {
    yellow: "#FFF800",
    white: "#FFFFFF",
    purple: "#542E91",
  },

  captions: {
    wordsPerLine: 4,
    combineWithinMs: 800,
    position: { bottom: 200, left: 40, right: 40 },
    fontSize: {
      default: 52,
      highlight: 56,
    },
    shadow: "2px 2px 0px rgba(0,0,0,0.7)",
    activeWordColor: "#FFF800",
    inactiveWordColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.0)",
    borderRadius: 12,
    padding: { vertical: 8, horizontal: 16 },
  },

  textStyles: {
    whitePlain: { color: "#FFFFFF", shadow: "none" },
    whiteShadow: { color: "#FFFFFF", shadow: "2px 2px 0px rgba(0,0,0,0.7)" },
    yellowPlain: { color: "#FFF800", shadow: "none" },
    yellowShadow: { color: "#FFF800", shadow: "2px 2px 0px rgba(0,0,0,0.8)" },
    purpleBox: { color: "#FFFFFF", bg: "#542E91", borderRadius: 8 },
    whiteBox: { color: "#542E91", bg: "#FFFFFF", borderRadius: 8 },
  },

  formats: {
    hardSell: {
      textTransform: "uppercase" as const,
      highlightColor: "#FFF800",
      baseColor: "#FFFFFF",
      gradient: "linear-gradient(to top, #542E91 0%, rgba(84,46,145,0.8) 45%, transparent 75%)",
    },
    editorial: {
      textTransform: "none" as const,
      useBoxes: true,
      noYellow: true,
    },
    meme: {
      textTransform: "none" as const,
      background: "#542E91",
      noYellow: true,
    },
  },
} as const;
