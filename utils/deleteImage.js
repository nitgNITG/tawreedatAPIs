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

    console.log(`Attempting to delete image: ${fileUrl}`);

    // Skip deletion for external URLs
    if (fileUrl.startsWith('http') && 
        !fileUrl.includes(process.env.BASE_URL) && 
        !fileUrl.includes('localhost')) {
      console.log(`Skipping deletion of external image: ${fileUrl}`);
      return true;
    }

    // Extract the relative path part (everything after "/uploads/")
    let relativePath;
    if (fileUrl.includes("/uploads/")) {
      // Extract path after "/uploads/"
      const match = fileUrl.match(/\/uploads\/(.+)/);
      relativePath = match ? match[1] : null;
    } else {
      console.log(`Unrecognized file path format: ${fileUrl}`);
      return false;
    }

    if (!relativePath) {
      console.log(`Could not extract relative path from: ${fileUrl}`);
      return false;
    }

    // Create the absolute filesystem path
    const absolutePath = path.join(__dirname, "..", "uploads", relativePath);
    console.log(`Calculated absolute path: ${absolutePath}`);

    // Check if file exists
    try {
      await fs.access(absolutePath);
      console.log(`File exists: ${absolutePath}`);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error(`File does not exist: ${absolutePath}`);
        return false;
      } else {
        console.error(`Error accessing file: ${error}`);
        throw error;
      }
    }

    // Delete the file
    await fs.unlink(absolutePath);
    console.log(`File deleted successfully: ${absolutePath}`);
    return true;
  } catch (error) {
    console.error(`Error deleting file: ${error.message}`);
    return false;
  }
};

export default deleteImage;