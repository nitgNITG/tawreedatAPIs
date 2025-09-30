import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clean up temp files older than 1 hour
const cleanupTempFiles = async () => {
  try {
    const tempDir = path.join(__dirname, "..", "uploads", "temp");
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtimeMs > oneHour) {
        await fs.unlink(filePath);
        console.log(`Deleted old temp file: ${file}`);
      }
    }
  } catch (error) {
    console.error("Error cleaning temp files:", error);
  }
};

// Run cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);

export default cleanupTempFiles;
