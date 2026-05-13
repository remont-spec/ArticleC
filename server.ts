import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import mammoth from "mammoth";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import axios from "axios";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // WordPress Proxy to handle CORS and authorization more reliably
  app.post("/api/wp/create-post", async (req, res) => {
    const { baseUrl, username, appPassword, postData } = req.body;

    if (!baseUrl || !username || !appPassword || !postData) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const authHeader = Buffer.from(`${username}:${appPassword}`).toString("base64");
      
      const response = await axios.post(`${baseUrl}/wp-json/wp/v2/posts`, postData, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${authHeader}`
        }
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("WordPress Proxy Error:", error.response?.data || error.message);
      
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message || "Failed to communicate with WordPress";
      const code = error.response?.data?.code || "unknown_error";

      res.status(status).json({ message, code, detail: error.response?.data });
    }
  });

  // Proxy for fetching WordPress block patterns (both registered and user-created)
  app.get("/api/wp/patterns", async (req, res) => {
    const { baseUrl, username, appPassword, search } = req.query;

    if (!baseUrl || !username || !appPassword) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const authHeader = Buffer.from(`${username}:${appPassword}`).toString("base64");
      
      // Fetch from two sources:
      // 1. Registered Patterns (code/plugins)
      // 2. User-created Blocks/Patterns (Database)
      const [patternsRes, blocksRes] = await Promise.allSettled([
        axios.get(`${baseUrl}/wp-json/wp/v2/block-patterns`, {
          params: { search },
          headers: { "Authorization": `Basic ${authHeader}` }
        }),
        axios.get(`${baseUrl}/wp-json/wp/v2/blocks`, {
          params: { search },
          headers: { "Authorization": `Basic ${authHeader}` }
        })
      ]);

      let allPatterns: any[] = [];

      const getString = (val: any): string => {
        if (typeof val === 'string') return val;
        if (!val) return '';
        return val.rendered || val.raw || (typeof val === 'object' ? JSON.stringify(val) : String(val));
      };

      // Handle block-patterns (Registered)
      if (patternsRes.status === 'fulfilled') {
        allPatterns = [...allPatterns, ...patternsRes.value.data.map((p: any) => ({
          name: p.name,
          title: getString(p.title),
          content: getString(p.content),
          source: 'core'
        }))];
      }

      // Handle blocks (User-created Synced Patterns)
      if (blocksRes.status === 'fulfilled') {
        allPatterns = [...allPatterns, ...blocksRes.value.data.map((b: any) => ({
          name: `block-${b.id}`,
          title: getString(b.title),
          content: getString(b.content),
          source: 'user'
        }))];
      }

      res.status(200).json(allPatterns);
    } catch (error: any) {
      console.error("WordPress Patterns Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { message: error.message });
    }
  });

  // API for extracting text from files
  app.post("/api/extract-text", upload.array("files"), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const extractedTexts = await Promise.all(
        files.map(async (file) => {
          if (file.mimetype === "application/pdf") {
            const data = await pdf(file.buffer);
            return { name: file.originalname, text: data.text };
          } else if (
            file.mimetype ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            const data = await mammoth.extractRawText({ buffer: file.buffer });
            return { name: file.originalname, text: data.value };
          } else if (file.mimetype === "text/plain") {
            return { name: file.originalname, text: file.buffer.toString() };
          }
          return { name: file.originalname, text: "Unsupported file type" };
        })
      );

      res.json({ extractedTexts });
    } catch (error) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: "Failed to extract text" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
