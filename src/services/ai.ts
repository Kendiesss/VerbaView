import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Storyboard, Scene } from "../types";

const apiKey = process.env.GEMINI_API_KEY || "";

export const getAI = () => new GoogleGenAI({ apiKey });

export async function generateStoryboard(prompt: string): Promise<Storyboard> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Break this text into a compelling 30-second script for a video. Divide it into 4 distinct scenes. For each scene, provide: 1. The scene text (narration), 2. A descriptive image prompt for AI generation, and 3. Estimated scene duration in seconds (total should be around 30s).
    
    Input Prompt: ${prompt}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                visualPrompt: { type: Type.STRING },
                duration: { type: Type.NUMBER }
              },
              required: ["text", "visualPrompt", "duration"]
            }
          }
        },
        required: ["scenes"]
      }
    }
  });

  const data = JSON.parse(response.text);
  return {
    scenes: data.scenes.map((s: any, i: number) => ({
      ...s,
      id: `scene-${i}`
    }))
  };
}

export async function generateVoiceover(text: string): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Narrate the following script clearly and professionally: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate voiceover");
  
  return `data:audio/wav;base64,${base64Audio}`;
}

export async function generateSceneImage(prompt: string): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate image");
}

export async function generateSceneVideo(imageUri: string, prompt: string): Promise<string> {
  const ai = getAI();
  // Using veo-3.1-fast-generate-preview for image-to-video
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Animate this scene: ${prompt}`,
    image: {
      imageBytes: imageUri.split(',')[1],
      mimeType: 'image/png',
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Failed to generate video");

  // Fetch the video data
  const response = await fetch(downloadLink, {
    headers: { 'x-goog-api-key': apiKey }
  });
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
