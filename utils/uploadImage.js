import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadImage = async (file, destination) => {
  try {
    console.log(`Starting upload process for file: ${file.originalname}`);
    
    // Create uploads directory and subdirectory if it doesn't exist
    const uploadsDir = path.join(__dirname, "..", "uploads");
    console.log(`Base uploads directory: ${uploadsDir}`);

    // Normalize destination path (remove leading slash and get first segment)
    const subDir = destination ? destination.replace(/^\//, "").split("/")[0] : "";
    const fullUploadDir = subDir ? path.join(uploadsDir, subDir) : uploadsDir;
    console.log(`Full upload directory: ${fullUploadDir}`);

    // Ensure directory exists
    await fs.mkdir(fullUploadDir, { recursive: true });

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop().toLowerCase();
    const fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.${fileExtension}`;
    console.log(`Generated filename: ${fileName}`);

    // Create the full file path
    const filePath = path.join(fullUploadDir, fileName);
    console.log(`Full file path for saving: ${filePath}`);

    // Process image based on file type
    let buffer;
    try {
      if (fileExtension === "png") {
        buffer = await sharp(file.buffer).png({ quality: 80 }).toBuffer();
      } else if (fileExtension === "webp") {
        buffer = await sharp(file.buffer).webp({ quality: 80 }).toBuffer();
      } else if (["gif", "svg"].includes(fileExtension)) {
        buffer = file.buffer;
      } else {
        buffer = await sharp(file.buffer).jpeg({ quality: 80 }).toBuffer();
      }
    } catch (sharpError) {
      console.error("Image processing error:", sharpError);
      throw new Error(`Image processing failed: ${sharpError.message}`);
    }

    // Write the buffer to file
    await fs.writeFile(filePath, buffer);
    console.log(`File written successfully to: ${filePath}`);

    // Return the URL path for the file (NOT the filesystem path)
    // This is what will be stored in the database and used for retrieval
    const relativePath = subDir ? `/uploads/${subDir}/${fileName}` : `/uploads/${fileName}`;
    console.log(`Returning relative path: ${relativePath}`);
    
    return relativePath;
  } catch (error) {
    console.error("Error in uploadImage function:", error);
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

export default uploadImage;