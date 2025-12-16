import prisma from "../prisma/client.js";

export async function getApplicationSettings() {
  const settings = await prisma.applicationSettings.findFirst();

  if (!settings) {
    throw new Error("Application settings not found");
  }

  return settings;
}
