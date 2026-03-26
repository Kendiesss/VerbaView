import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Video, 
  Download, 
  Loader2, 
  Play, 
  Pause, 
  ChevronRight, 
  Image as ImageIcon,
  Type as TypeIcon,
  Music,
  AlertCircle
} from 'lucide-react';
import { cn } from './lib/utils';
import { GenerationJob, Storyboard, Scene } from './types';
import { 
  generateStoryboard, 
  generateVoiceover, 
  generateSceneImage, 
  generateSceneVideo 
} from './services/ai';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startGeneration = async () => {
    if (!prompt.trim()) return;

    try {
      // 1. Create Job
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const { jobId } = await res.json();
      
      const initialJob: GenerationJob = {
        id: jobId,
        status: 'storyboarding',
        progress: 10,
        prompt
      };
      setJob(initialJob);

      // 2. Storyboarding
      const storyboard = await generateStoryboard(prompt);
      const updatedJobWithStoryboard: GenerationJob = {
        ...initialJob,
        status: 'generating_assets',
        progress: 30,
        storyboard
      };
      setJob(updatedJobWithStoryboard);
      await updateJobOnServer(jobId, updatedJobWithStoryboard);

      // 3. Asset Generation (Parallel)
      const fullScript = storyboard.scenes.map(s => s.text).join(' ');
      
      // Generate Voiceover
      const voiceoverUrl = await generateVoiceover(fullScript);
      
      // Generate Scenes (Sequential for stability in demo, could be parallel)
      const updatedScenes: Scene[] = [];
      for (let i = 0; i < storyboard.scenes.length; i++) {
        const scene = storyboard.scenes[i];
        const imageUrl = await generateSceneImage(scene.visualPrompt);
        const videoUrl = await generateSceneVideo(imageUrl, scene.visualPrompt);
        
        updatedScenes.push({ ...scene, imageUrl, videoUrl });
        
        setJob(prev => prev ? ({
          ...prev,
          progress: 30 + ((i + 1) / storyboard.scenes.length) * 60,
          storyboard: { ...prev.storyboard!, scenes: [...updatedScenes, ...storyboard.scenes.slice(i + 1)] }
        }) : null);
      }

      const finalAssetsJob: GenerationJob = {
        ...updatedJobWithStoryboard,
        status: 'compositing',
        progress: 90,
        storyboard: {
          scenes: updatedScenes,
          voiceoverUrl
        }
      };
      setJob(finalAssetsJob);
      await updateJobOnServer(jobId, finalAssetsJob);

      // 4. Post-Production (Server-side FFmpeg)
      const compositeRes = await fetch(`/api/jobs/${jobId}/composite`, { method: 'POST' });
      if (!compositeRes.ok) throw new Error("Compositing failed on server");

      // Start polling for final video
      pollJobStatus(jobId);

    } catch (error: any) {
      console.error(error);
      setJob(prev => prev ? { ...prev, status: 'error', error: error.message } : null);
    }
  };

  const updateJobOnServer = async (id: string, data: Partial<GenerationJob>) => {
    await fetch(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });
  };

  const pollJobStatus = async (id: string) => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      setJob(data);
      if (data.status === 'ready' || data.status === 'error') {
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleDownload = () => {
    if (job?.finalVideoUrl) {
      const link = document.createElement('a');
      link.href = job.finalVideoUrl;
      link.download = `verbaview-${job.id}.mp4`;
      link.click();
    }
  };

  const currentScene = job?.storyboard?.scenes[currentSceneIndex];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex justify-between items-end mb-16">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-orange-500/80">System Active</span>
            </div>
            <h1 className="text-6xl font-bold tracking-tighter leading-none">
              VERBA<span className="text-orange-500">VIEW</span>
            </h1>
            <p className="text-white/40 mt-4 max-w-md text-sm leading-relaxed">
              Where words become worlds. Transform your narrative into cinematic visuals using high-fidelity generative models.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/20 block mb-1">Architecture</span>
            <span className="text-xs font-mono text-white/40">v1.0.4-STABLE</span>
          </div>
        </header>

        {!job ? (
          <section className="mt-20">
            <div className="relative group">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the world you want to create..."
                className="w-full h-48 bg-white/5 border border-white/10 rounded-2xl p-8 text-2xl font-light tracking-tight focus:outline-none focus:border-orange-500/50 transition-all resize-none placeholder:text-white/10"
              />
              <button
                onClick={startGeneration}
                disabled={!prompt.trim()}
                className="absolute bottom-6 right-6 bg-white text-black px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-black"
              >
                Generate <ChevronRight size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-6 mt-12">
              {[
                { icon: <TypeIcon size={16} />, title: "Semantic Scripting", desc: "Gemini 3.1 Pro orchestrates the narrative flow." },
                { icon: <ImageIcon size={16} />, title: "Neural Imaging", desc: "High-resolution frames generated per scene." },
                { icon: <Video size={16} />, title: "Temporal Motion", desc: "Veo 3.1 Fast brings static frames to life." }
              ].map((item, i) => (
                <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] transition-colors">
                  <div className="text-orange-500 mb-4">{item.icon}</div>
                  <h3 className="font-bold mb-1">{item.title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-8">
            {/* Status Bar */}
            <div className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl">
              <div className="flex items-center gap-4">
                {job.status !== 'ready' && job.status !== 'error' ? (
                  <Loader2 className="animate-spin text-orange-500" size={20} />
                ) : job.status === 'error' ? (
                  <AlertCircle className="text-red-500" size={20} />
                ) : (
                  <Sparkles className="text-orange-500" size={20} />
                )}
                <div>
                  <h2 className="font-bold capitalize">{job.status.replace('_', ' ')}</h2>
                  <p className="text-xs text-white/40">
                    {job.status === 'storyboarding' && "Analyzing prompt and structuring narrative..."}
                    {job.status === 'generating_assets' && `Synthesizing scene ${job.storyboard?.scenes.filter(s => s.videoUrl).length || 0 + 1} of ${job.storyboard?.scenes.length}...`}
                    {job.status === 'ready' && "Generation complete. Preview your creation below."}
                    {job.status === 'error' && `Error: ${job.error}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-orange-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${job.progress}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-white/40">{Math.round(job.progress)}%</span>
              </div>
            </div>

            {/* Main Preview Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="aspect-video bg-white/5 border border-white/10 rounded-3xl overflow-hidden relative group">
                  <AnimatePresence mode="wait">
                    {currentScene?.videoUrl ? (
                      <motion.video
                        key={currentScene.id}
                        src={currentScene.videoUrl}
                        autoPlay
                        loop
                        muted
                        className="w-full h-full object-cover"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    ) : currentScene?.imageUrl ? (
                      <motion.img
                        key={currentScene.id}
                        src={currentScene.imageUrl}
                        className="w-full h-full object-cover"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10">
                        <Video size={48} />
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Player Controls Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button className="p-3 bg-white text-black rounded-full hover:bg-orange-500 hover:text-white transition-colors">
                          <Play size={20} fill="currentColor" />
                        </button>
                        <div className="text-xs font-mono">
                          SCENE {currentSceneIndex + 1} / {job.storyboard?.scenes.length || 0}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Music size={14} className="text-orange-500" />
                        <span className="text-[10px] uppercase tracking-wider text-white/60">Audio Synced</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scene Text */}
                <div className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/20 block mb-4">Narration Script</span>
                  <p className="text-xl font-light leading-relaxed italic">
                    "{currentScene?.text || "Generating script..."}"
                  </p>
                </div>
              </div>

              {/* Sidebar: Storyboard List */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-white/20 px-2">Storyboard</h3>
                <div className="space-y-3">
                  {job.storyboard?.scenes.map((scene, i) => (
                    <button
                      key={scene.id}
                      onClick={() => setCurrentSceneIndex(i)}
                      className={cn(
                        "w-full text-left p-4 rounded-2xl border transition-all flex gap-4 group",
                        currentSceneIndex === i 
                          ? "bg-orange-500/10 border-orange-500/50" 
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      )}
                    >
                      <div className="w-20 aspect-video bg-black/40 rounded-lg overflow-hidden flex-shrink-0 relative">
                        {scene.imageUrl ? (
                          <img src={scene.imageUrl} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/5">
                            <ImageIcon size={16} />
                          </div>
                        )}
                        {scene.videoUrl && (
                          <div className="absolute top-1 right-1">
                            <Video size={10} className="text-orange-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-mono text-white/40">0{i + 1}</span>
                          <span className="text-[10px] font-mono text-white/40">{scene.duration}s</span>
                        </div>
                        <p className="text-xs font-medium truncate group-hover:text-orange-500 transition-colors">
                          {scene.visualPrompt}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {job.status === 'ready' && job.finalVideoUrl && (
                  <button 
                    onClick={handleDownload}
                    className="w-full mt-6 bg-white text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-orange-500 hover:text-white transition-all"
                  >
                    <Download size={18} /> Download Final Video
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-white/5 mt-20 flex justify-between items-center text-[10px] uppercase tracking-widest text-white/20">
        <div>© 2026 VerbaView Architecture</div>
        <div className="flex gap-8">
          <span>Privacy</span>
          <span>Terms</span>
          <span>API Docs</span>
        </div>
      </footer>
    </div>
  );
}
