import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadImage = async (file, destination) => {
  try {
    // Create uploads directory and subdirectory if it doesn't exist
    const uploadsDir = path.join(__dirname, "..", "uploads");

    // Parse destination to create subdirectory (e.g., "/user" -> "user")
    const subDir = destination ? destination.replace(/^\//, '').split('/')[0] : "";
    const fullUploadDir = subDir ? path.join(uploadsDir, subDir) : uploadsDir;

    await fs.mkdir(fullUploadDir, { recursive: true });

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop().toLowerCase();
    const fileName = `${timestamp}_${Math.random()
      .toString(36)
      .substring(2)}.${fileExtension}`;

    // Create the full file path
    const filePath = path.join(fullUploadDir, fileName);

    let buffer;
    if (fileExtension === "png") {
      buffer = await sharp(file.buffer).png({ quality: 80 }).toBuffer();
    } else if (fileExtension === "webp") {
      buffer = await sharp(file.buffer).webp({ quality: 80 }).toBuffer();
    } else if (fileExtension === "gif" || fileExtension === "svg") {
      buffer = file.buffer;
    } else {
      buffer = await sharp(file.buffer).jpeg({ quality: 80 }).toBuffer();
    }

    // Write the buffer to file
    await fs.writeFile(filePath, buffer);

    // Return the relative URL path including subdirectory
    const publicUrl = subDir
      ? `${process.env.BASE_URL}/uploads/${subDir}/${fileName}`
      : `${process.env.BASE_URL}/uploads/${fileName}`;
    return publicUrl;
  } catch (error) {
    console.error("Error in uploadImage function:", error);
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

export default uploadImage;
