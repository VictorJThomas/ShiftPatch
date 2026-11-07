import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

buildApp({ logger: true })
  .listen({ host: "0.0.0.0", port })
  .then(() => console.log(`ShiftPatch API listening on http://localhost:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
