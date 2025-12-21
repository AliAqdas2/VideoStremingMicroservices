import express from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in service directory
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const app = express();
app.use(express.json());
app.use(cors());

const isProduction = process.env.NODE_ENV === "production";
const distPath = path.join(__dirname, "dist");
const publicPath = path.join(__dirname, "public");

// API endpoint to get config
app.get("/api/config", (req, res) => {
  res.json({
    controllerServiceUrl:
      process.env.CONTROLLER_SERVICE_URL || "http://104.154.135.248:3005",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "ViewGeneratorServ" });
});

if (isProduction && fs.existsSync(distPath)) {
  // Production: Serve built static files from dist
  app.use(express.static(distPath));

  // Serve index.html with injected API_BASE_URL for all routes (SPA)
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, "utf8");
      const controllerUrl =
        process.env.CONTROLLER_SERVICE_URL || "http://104.154.135.248:3005";
      const scriptTag = `<script>window.API_BASE_URL = '${controllerUrl}';</script>`;
      html = html.replace("</head>", `    ${scriptTag}\n</head>`);
      res.send(html);
    } else {
      res.status(404).send("Not found");
    }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`View Generator Service running on port ${PORT}`);
  console.log(`Mode: ${isProduction ? "production" : "development"}`);
  if (isProduction) {
    console.log(`Serving built files from: ${distPath}`);
  } else {
    console.log(`For development, run: npm run dev`);
  }
  console.log(
    `API Base URL: ${
      process.env.CONTROLLER_SERVICE_URL || "http://104.154.135.248:3005"
    }`
  );
});
