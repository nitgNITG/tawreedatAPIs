const revalidateDashboard = async (tag) => {
  try {
    await fetch(`${process.env.FRONTEND_URL}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag,
        key: process.env.REVALIDATE_API_KEY,
      }),
    });
  } catch (err) {
    console.error("Failed to revalidate:", err);
  }
};
export default revalidateDashboard;
