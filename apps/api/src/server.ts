import { buildApp } from "./app.js";

buildApp().listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3001) }).catch((err) => {
  console.error(err);
  process.exit(1);
});
