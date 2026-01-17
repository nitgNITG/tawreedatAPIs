import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import cookieParser from "cookie-parser";
import cleanupTempFiles from "./utils/cleanupTemp.js";
import prisma from "./prisma/client.js";

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
      const dirRoute = file.replaceAll(/\[([^\]]+)\]/g, "");
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

// export async function migrateUsersOldToNew() {
//   const users = await prisma.user.findMany();

//   console.log(`Found ${users.length} users to migrate`);

//   for (const user of users) {
//     const data = {};

//     // name
//     if (!user.full_name && user.fullname) {
//       data.full_name = user.fullname;
//     }

//     // image
//     if (!user.image_url && user.imageUrl) {
//       data.image_url = user.imageUrl;
//     }

//     // last login
//     if (!user.last_login_at && user.lastLoginAt) {
//       data.last_login_at = user.lastLoginAt.toISOString();
//     }

//     // confirmed
//     if (user.is_confirmed === null && user.isConfirmed !== null) {
//       data.is_confirmed = user.isConfirmed;
//     }

//     // password updated
//     if (!user.password_last_updated && user.passwordLastUpdated) {
//       data.password_last_updated = user.passwordLastUpdated;
//     }

//     // birth date
//     if (!user.birth_date && user.birthDate) {
//       data.birth_date = user.birthDate;
//     }

//     // fcm
//     if (!user.fcm_token && user.fcmToken) {
//       data.fcm_token = user.fcmToken;
//     }

//     // login type
//     if (!user.login_type && user.loginType) {
//       data.login_type = user.loginType;
//     }

//     // apple id
//     if (!user.apple_id && user.appleId) {
//       data.apple_id = user.appleId;
//     }

//     // deleted → deleted_at
//     if (!user.deleted_at && user.isDeleted === true) {
//       data.deleted_at = new Date();
//     }

//     // createdAt -> created_at
//     if (!user.created_at && user.createdAt) {
//       data.created_at = user.createdAt;
//     }

//     if (Object.keys(data).length > 0) {
//       await prisma.user.update({
//         where: { id: user.id },
//         data,
//       });
//     }
//   }

//   console.log("✅ User migration completed");
// }

// export async function nullifyOldUserColumns() {
//   const result = await prisma.user.updateMany({
//     data: {
//       role_id: "95d21c53-404a-4f02-8daa-65dc0c076b89",
//     },
//   });

//   console.log(`✅ Old user columns nulled for ${result.count} users`);
// }

// const ROLES = [
//   { name: admin, description: "System administrator" },
//   { name: "customer", description: "Regular customer" },
//   { name: "supplier", description: "Product supplier" },
// ];

// export async function seedUserRoles() {
//   for (const role of ROLES) {
//     await prisma.userRole.upsert({
//       where: { name: role.name },
//       update: {},
//       create: {
//         name: role.name,
//         description: role.description,
//       },
//     });
//   }

//   console.log("✅ User roles seeded successfully");
// }

// try {
//   nullifyOldUserColumns();
// } catch (error) {
//   console.error("❌ Error during user migration:", error);
// }
