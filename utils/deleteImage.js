import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deleteImage = async (fileUrl) => {
  try {
    if (!fileUrl) return false;

    let filePath;
    if (fileUrl.startsWith("/uploads/")) {
      filePath = fileUrl.replace(/^\//, "");
    } else if (fileUrl.startsWith("http")) {
      const url = new URL(fileUrl);
      filePath = url.pathname.replace(/^\//, "");
    } else {
      filePath = fileUrl;
    }

    const absolutePath = path.join(__dirname, "..", filePath);

    try {
      await fs.access(absolutePath); // check file exists
      await fs.unlink(absolutePath);
      console.log("Deleted:", absolutePath);
      return true;
    } catch (err) {
      if (err.code === "ENOENT") {
        console.warn("File not found:", absolutePath);
        return false;
      }
      console.error("Delete error:", err.message);
      return false;
    }
  } catch (error) {
    console.error("Unexpected delete error:", error.message);
    return false;
  }
};

export default deleteImage;
