import Anthropic from "@anthropic-ai/sdk";
import { brand } from "../remotion/brand.js";

export interface ClipInfo {
  key: string;
  clipName: string;
  category: string;
  durationSeconds: number;
  transcript: string;
}

export interface Segment {
  clipKey: string;
  clipName: string;
  startSeconds: number;
  endSeconds: number;
  purpose: string;
}

export interface CompositionPlan {
  title: string;
  segments: Segment[];
  hookText: string;
  ctaText: string;
  transitionStyle: "slide" | "fade" | "wipe";
  captionStyle: "word-by-word" | "subtitle";
  totalDurationSeconds: number;
}

const SYSTEM_PROMPT = `You are a social video editor AI. You select and sequence clips to create compelling short-form social videos.

You will receive:
- A list of source clips with transcripts, categories, and durations
- A target audience description
- Brand guidelines
- A target duration (usually 30s)

Your job is to pick the best segments from the available clips and arrange them into a cohesive social video. Think like a professional social media editor:
- Start with a strong hook (first 3 seconds are critical)
- Keep it punchy — quick cuts, no dead air
- Match content to the target audience
- End with a clear CTA

Return ONLY valid JSON matching the schema, no markdown fences or explanation.`;

function buildUserPrompt(
  clips: ClipInfo[],
  audience: string,
  targetDuration: number
): string {
  const clipList = clips
    .map(
      (c, i) =>
        `Clip ${i + 1}: "${c.clipName}" [${c.category}] (${c.durationSeconds}s)
Key: ${c.key}
Transcript: ${c.transcript}`
    )
    .join("\n\n");

  return `## Source Clips

${clipList}

## Brand Guidelines
- Font: ${brand.font.family} (weight ${brand.font.weights.title} for titles)
- Primary accent: ${brand.colors.yellow}
- Text: ${brand.colors.white} default, ${brand.colors.yellow} for highlights
- Background: ${brand.colors.purple}
- Caption style: word-by-word highlighting, 3-4 words per group

## Brief
- Target audience: ${audience}
- Target duration: ${targetDuration} seconds
- Format: 9:16 vertical social video

## Output Schema
{
  "title": "short internal title for this edit",
  "segments": [
    {
      "clipKey": "the R2 key of the source clip",
      "clipName": "human-readable clip name",
      "startSeconds": 0,
      "endSeconds": 10,
      "purpose": "hook / demo / lifestyle / closer / etc"
    }
  ],
  "hookText": "bold text overlay for the first 3 seconds",
  "ctaText": "call to action text at the end",
  "transitionStyle": "slide | fade | wipe",
  "captionStyle": "word-by-word",
  "totalDurationSeconds": ${targetDuration}
}

Pick segments that total approximately ${targetDuration} seconds. You can use multiple segments from the same clip if needed. Return ONLY the JSON object.`;
}

export async function generateCompositionPlan(
  clips: ClipInfo[],
  audience: string,
  targetDuration: number = 30
): Promise<CompositionPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(clips, audience, targetDuration),
      },
    ],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("Unexpected response type");

  const plan: CompositionPlan = JSON.parse(text.text);

  const totalSegmentTime = plan.segments.reduce(
    (sum, s) => sum + (s.endSeconds - s.startSeconds),
    0
  );
  plan.totalDurationSeconds = totalSegmentTime;

  return plan;
}
