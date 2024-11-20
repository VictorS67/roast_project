import run from "./app.js";

run().catch((err) => {
  console.log(`[ERROR] ${err.toString()}`);
  process.exit(1);
});
