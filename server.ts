import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// In-memory job store (In production, use Redis or a DB)
const jobs = new Map();

// Ensure temp directories exist (Use /tmp for Vercel compatibility)
const isVercel = !!process.env.VERCEL;
const tempDir = isVercel ? '/tmp' : path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch (e) {
    console.error("Failed to create temp dir:", e);
  }
}

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: isVercel ? "vercel" : "local" });
});

// API Routes
app.post("/api/jobs", (req, res) => {
  try {
    const { prompt } = req.body;
    const jobId = uuidv4();
    
    jobs.set(jobId, {
      id: jobId,
      status: 'storyboarding',
      progress: 0,
      prompt,
      createdAt: new Date(),
    });

    res.json({ jobId });
  } catch (error: any) {
    console.error("Error creating job:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// Endpoint to update job status (called by frontend or internal logic)
app.patch("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  
  const updatedJob = { ...job, ...req.body };
  jobs.set(req.params.id, updatedJob);
  res.json(updatedJob);
});

// Serve generated videos
app.use('/exports', express.static(tempDir));

// Post-Production: FFmpeg Compositing
app.post("/api/jobs/:id/composite", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.storyboard) return res.status(404).json({ error: "Job or storyboard not found" });

  const jobId = req.params.id;
  const jobDir = path.join(tempDir, jobId);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  try {
    const scenes = job.storyboard.scenes;
    const voiceoverData = job.storyboard.voiceoverUrl.split(',')[1];
    const voiceoverPath = path.join(jobDir, 'voiceover.wav');
    fs.writeFileSync(voiceoverPath, Buffer.from(voiceoverData, 'base64'));

    const videoPaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const videoData = scenes[i].videoUrl.split(',')[1];
      const videoPath = path.join(jobDir, `scene_${i}.mp4`);
      fs.writeFileSync(videoPath, Buffer.from(videoData, 'base64'));
      videoPaths.push(videoPath);
    }

    const outputPath = path.join(jobDir, 'final.mp4');
    const command = ffmpeg();

    videoPaths.forEach(p => command.input(p));
    
    command
      .input(voiceoverPath)
      .on('start', () => {
        jobs.set(jobId, { ...job, status: 'compositing', progress: 95 });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        jobs.set(jobId, { ...job, status: 'error', error: 'Compositing failed' });
      })
      .on('end', () => {
        const finalUrl = `/exports/${jobId}/final.mp4`;
        jobs.set(jobId, { ...job, status: 'ready', progress: 100, finalVideoUrl: finalUrl });
      })
      .mergeToFile(outputPath, jobDir);

    res.json({ status: 'started' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development (only if not on Vercel)
if (process.env.NODE_ENV !== "production" && !isVercel) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else if (!isVercel) {
  // Local production mode
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Only listen locally, Vercel handles the export
if (!isVercel) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VerbaView server running on http://localhost:${PORT}`);
  });
}

export default app;
