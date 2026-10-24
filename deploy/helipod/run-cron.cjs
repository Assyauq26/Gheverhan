// Run inside the application container; never pass CRON_SECRET on a command line.
const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 16) throw new Error("Cron secret is not configured");
fetch("http://127.0.0.1:3000/api/internal/cron/expire-orders", {
  headers: { Authorization: "Bearer " + secret },
  signal: AbortSignal.timeout(60000),
}).then(async (response) => {
  if (!response.ok) throw new Error("Cron HTTP " + response.status);
  const result = await response.json();
  if (!result.success) throw new Error("Cron returned failure");
  console.log(JSON.stringify({ status: "ok", ...result.data }));
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
