import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const game = service("stormskud", {
    // Source is uploaded with `railway up`; GitHub is not required.
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "node server/index.js",
    healthcheck: "/health",
    healthcheckTimeout: 30,
    // Rooms live in memory: keep exactly one process, awake between games.
    replicas: { "europe-west4-drams3a": 1 },
    deploy: {
      sleepApplication: false,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      overlapSeconds: 0,
    },
    env: { NODE_ENV: "production", PORT: "3000" },
  });

  return project("STORMSKUD", {
    resources: [game],
  });
});
