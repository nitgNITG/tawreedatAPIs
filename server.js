import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import cookieParser from "cookie-parser";
import cleanupTempFiles from "./utils/cleanupTemp.js";

//create app
const app = express();

// --------------------------------
// middlewares
app.use(morgan("dev"));
app.use(cookieParser());
dotenv.config({
  path: ".env",
});

// CORS configuration - must be applied before routes
const allowedHosts = process?.env?.HOSTS_URL?.split(",");
// // Apply CORS middleware before other middlewares
// app.use((req, res, next) => {
//     if (req.path === '/api/redirect-payment') {
//         // Allow all origins for this endpoint
//         cors({
//             origin: true,
//             credentials: true,
//             methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//         })(req, res, next);
//     } else {
//         // Use regular CORS options for other routes
//         cors(corsOptions)(req, res, next);
//     }
// });
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
};

app.use(cors(corsOptions));
app.use(express.json());

// Set query parser to handle nested objects like createdAt[gte]
app.set("query parser", "extended");

// Serve static files from uploads directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(
  "/uploads",
  express.static(
    path.join(path.dirname(new URL(import.meta.url).pathname), "uploads")
  )
);

//routers
const loadRoutes = async (folderPath, baseRoute = "/api") => {
  const fullPath = path.resolve(folderPath);
  const files = fs.readdirSync(fullPath);

  // Sort files to ensure specific routes are loaded before dynamic routes
  // Put dynamic routes (containing brackets) at the end
  const sortedFiles = files.sort((a, b) => {
    const aIsDynamic = a.includes("[") && a.includes("]");
    const bIsDynamic = b.includes("[") && b.includes("]");

    if (aIsDynamic && !bIsDynamic) return 1;
    if (!aIsDynamic && bIsDynamic) return -1;
    return a.localeCompare(b);
  });

  // Process files sequentially to ensure proper route order
  for (const file of sortedFiles) {
    const filePath = path.join(fullPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      // Convert bracket notation to Express parameter syntax for directories
      const dirRoute = file.replace(/\[([^\]]+)\]/g, "");
      await loadRoutes(filePath, `${baseRoute}/${dirRoute}`);
    } else if (file.endsWith(".js")) {
      const fileUrl = pathToFileURL(filePath).href;
      // baseRoute should already have parameters converted from directory processing
      const routePath = baseRoute;

      try {
        const module = await import(fileUrl);
        app.use(routePath, module.default);
      } catch (err) {
        console.error(`❌ Error loading route ${file}:`, err);
      }
    }
  }
};

// Load routes synchronously
(async () => {
  await loadRoutes("./api");

  const port = process.env.PORT || 3120;
  // create a error middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal Server Error" });
  });
  app.listen(port, () => {
    console.log("listening on port", port);
  });
})();

cleanupTempFiles();
