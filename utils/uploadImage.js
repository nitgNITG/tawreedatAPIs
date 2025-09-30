import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log("file:", __filename);
console.log("uploadImage.js __dirname:", __dirname);

const uploadImage = async (file, destination) => {
  try {
    const uploadsDir = path.join(__dirname, "..", "uploads");
    const subDir = destination
      ? destination.replace(/^\//, "").split("/")[0]
      : "";
    const fullUploadDir = subDir ? path.join(uploadsDir, subDir) : uploadsDir;

    await fs.mkdir(fullUploadDir, { recursive: true });

    const timestamp = Date.now();
    const fileExtension = file.originalname.split(".").pop().toLowerCase();
    const fileName = `${timestamp}_${Math.random()
      .toString(36)
      .substring(2)}.${fileExtension}`;
    const filePath = path.join(fullUploadDir, fileName);

    let buffer;

    try {
      if (fileExtension === "png") {
        buffer = await sharp(file.buffer).png({ quality: 80 }).toBuffer();
      } else if (fileExtension === "webp") {
        buffer = await sharp(file.buffer).webp({ quality: 80 }).toBuffer();
      } else if (["jpeg", "jpg"].includes(fileExtension)) {
        buffer = await sharp(file.buffer).jpeg({ quality: 80 }).toBuffer();
      } else if (["gif", "svg"].includes(fileExtension)) {
        buffer = file.buffer; // no processing
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }
    } catch (sharpError) {
      console.error("Sharp failed:", sharpError.message);
      throw new Error("Image processing failed");
    }

    await fs.writeFile(filePath, buffer);

    const imagePath = subDir
      ? `${process.env.BASE_URL}/uploads/${subDir}/${fileName}`
      : `${process.env.BASE_URL}/uploads/${fileName}`;
    console.log("Uploaded image path:", imagePath);

    return imagePath;
  } catch (error) {
    console.error("Upload failed:", error.message);
    return null; // safer than throw, so routes can handle gracefully
  }
};

export default uploadImage;
