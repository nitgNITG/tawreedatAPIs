import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadImage = async (file, destination) => {
  let tempFilePath = null;

  try {
    // Store the temp file path for cleanup
    tempFilePath = file.path;

    // Create uploads directory and subdirectory
    const uploadsDir = path.join(__dirname, "..", "uploads");
    const subDir = destination
      ? destination.replace(/^\//, "").split("/")[0]
      : "";
    const fullUploadDir = subDir ? path.join(uploadsDir, subDir) : uploadsDir;

    // Ensure directories exist
    await fs.mkdir(fullUploadDir, { recursive: true });
    await fs.mkdir(path.join(uploadsDir, "temp"), { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop().toLowerCase();
    const fileName = `${timestamp}_${Math.random()
      .toString(36)
      .substring(2)}.${fileExtension}`;

    const finalFilePath = path.join(fullUploadDir, fileName);

    // Process image based on type
    if (fileExtension === "png") {
      await sharp(tempFilePath, {
        limitInputPixels: 268402689,
        sequentialRead: true,
      })
        .resize(2000, 2000, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png({ quality: 80, compressionLevel: 9 })
        .toFile(finalFilePath);
    } else if (fileExtension === "webp") {
      await sharp(tempFilePath, {
        limitInputPixels: 268402689,
        sequentialRead: true,
      })
        .resize(2000, 2000, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(finalFilePath);
    } else if (["jpeg", "jpg"].includes(fileExtension)) {
      await sharp(tempFilePath, {
        limitInputPixels: 268402689,
        sequentialRead: true,
      })
        .resize(2000, 2000, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(finalFilePath);
    } else if (["gif", "svg"].includes(fileExtension)) {
      // Copy without processing
      await fs.copyFile(tempFilePath, finalFilePath);
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }

    // Delete the temporary file
    await fs.unlink(tempFilePath).catch((err) => {
      console.warn("Failed to delete temp file:", err.message);
    });

    // Return the public URL
    const publicUrl = subDir
      ? `${process.env.BASE_URL}/uploads/${subDir}/${fileName}`
      : `${process.env.BASE_URL}/uploads/${fileName}`;

    console.log("Image uploaded successfully:", publicUrl);
    return publicUrl;
  } catch (error) {
    console.error("Error in uploadImage function:", error);

    // Clean up temp file if it exists
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch((err) => {
        console.warn("Failed to delete temp file on error:", err.message);
      });
    }

    throw new Error(`Image processing failed: ${error.message}`);
  }
};

export default uploadImage;
