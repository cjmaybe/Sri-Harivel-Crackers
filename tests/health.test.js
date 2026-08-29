const { setupTestEnv } = require("./helpers");
const env = setupTestEnv();
const request = require("supertest");
const app = require("../server");

afterAll(env.cleanup);

describe("Health checks", () => {
  test("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });

  test("GET /health/db returns ok when database is reachable", async () => {
    const res = await request(app).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
