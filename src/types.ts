export type GenerationStatus = 'idle' | 'storyboarding' | 'generating_assets' | 'compositing' | 'ready' | 'error';

export interface Scene {
  id: string;
  text: string;
  visualPrompt: string;
  duration: number; // in seconds
  imageUrl?: string;
  videoUrl?: string;
}

export interface Storyboard {
  scenes: Scene[];
  voiceoverUrl?: string;
}

export interface GenerationJob {
  id: string;
  status: GenerationStatus;
  progress: number;
  prompt: string;
  storyboard?: Storyboard;
  finalVideoUrl?: string;
  error?: string;
}
