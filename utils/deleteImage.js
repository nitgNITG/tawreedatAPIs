import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deleteImage = async (fileUrl) => {
  try {
    if (!fileUrl) {
      console.log("No file URL provided");
      return false;
    }

    // Extract the file path from URL (e.g., "/uploads/user/123/file.jpg" -> "uploads/user/123/file.jpg")
    let filePath;
    if (fileUrl.startsWith("/uploads/")) {
      filePath = fileUrl.replace(/^\//, ""); // Remove leading slash
    } else if (fileUrl.startsWith("http")) {
      // Handle full URLs by extracting the path part
      const url = new URL(fileUrl);
      filePath = url.pathname.replace(/^\//, "");
    } else {
      // Already a relative path
      filePath = fileUrl;
    }

    // Create absolute path to the file
    const absolutePath = path.join(__dirname, "..", filePath);

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error("File does not exist:", absolutePath);
        return false;
      } else {
        throw error; // Let the outer catch handle unexpected errors
      }
    }

    // Delete the file
    await fs.unlink(absolutePath);
    console.log("File deleted successfully:", absolutePath);
    return true;
  } catch (error) {
    console.error("Error deleting file:", error.message);
    return false;
  }
};

export default deleteImage;
