const { setupTestEnv } = require("./helpers");
const env = setupTestEnv();
const request = require("supertest");
const app = require("../server");

afterAll(env.cleanup);

async function getCsrf(agent) {
  const res = await agent.get("/api/csrf-token");
  return res.body.csrfToken;
}

describe("CSRF protection", () => {
  test("mutating request without CSRF header is rejected", async () => {
    const agent = request.agent(app);
    await agent.get("/api/csrf-token"); // sets cookie
    const res = await agent.post("/api/admin/login").send({ username: "admin", password: "wrong" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/csrf/i);
  });

  test("mutating request with correct CSRF header + cookie is accepted (auth may still fail)", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent
      .post("/api/admin/login")
      .set("X-CSRF-Token", token)
      .send({ username: "admin", password: "wrong-password" });
    // Should get past CSRF (403 would mean CSRF failed); a 401 means it reached auth logic.
    expect(res.status).toBe(401);
  });

  test("GET requests do not require a CSRF header", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
  });
});

describe("Login", () => {
  test("rejects unknown username with generic error", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent.post("/api/admin/login").set("X-CSRF-Token", token).send({
      username: "no-such-user",
      password: "whatever123!"
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });

  test("rejects wrong password with generic error", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent.post("/api/admin/login").set("X-CSRF-Token", token).send({
      username: env.adminUsername,
      password: "wrong-password-1!"
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });

  test("succeeds with correct credentials", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent.post("/api/admin/login").set("X-CSRF-Token", token).send({
      username: env.adminUsername,
      password: env.adminPassword
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("SQL-injection-style username does not bypass auth", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent.post("/api/admin/login").set("X-CSRF-Token", token).send({
      username: "admin' OR '1'='1",
      password: "irrelevant"
    });
    expect(res.status).toBe(401);
  });
});

describe("requireAuth", () => {
  test("admin endpoints reject unauthenticated requests", async () => {
    const res = await request(app).get("/api/admin/products");
    expect(res.status).toBe(401);
  });

  test("admin endpoints work after login", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    await agent.post("/api/admin/login").set("X-CSRF-Token", token).send({
      username: env.adminUsername,
      password: env.adminPassword
    });
    const res = await agent.get("/api/admin/products");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// NOTE: this must run last — it intentionally locks the shared admin
// account for the lockout window, which would break later tests that log
// in with correct credentials.
describe("Brute-force lockout (run last)", () => {
  test("locks the account after 5 failed attempts, blocking even the correct password", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await agent
        .post("/api/admin/login")
        .set("X-CSRF-Token", token)
        .send({ username: env.adminUsername, password: "wrong-password-1!" });
    }

    const lockedRes = await agent
      .post("/api/admin/login")
      .set("X-CSRF-Token", token)
      .send({ username: env.adminUsername, password: env.adminPassword });

    expect(lockedRes.status).toBe(423);
  });
});
