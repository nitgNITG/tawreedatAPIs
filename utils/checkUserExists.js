import prisma from "../prisma/client.js";

/**
 * Check if a user exists by ID
 * @param{string} userId - ID of the user
 * @returns boolean
 */
export const checkUserExists = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }, // only fetch the id for efficiency
  });
  return !!user;
};
