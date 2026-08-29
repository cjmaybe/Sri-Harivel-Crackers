const { setupTestEnv } = require("./helpers");
const env = setupTestEnv();
const request = require("supertest");
const app = require("../server");

afterAll(env.cleanup);

async function loginAgent() {
  const agent = request.agent(app);
  const csrfRes = await agent.get("/api/csrf-token");
  const token = csrfRes.body.csrfToken;
  await agent.post("/api/admin/login").set("X-CSRF-Token", token).send({
    username: env.adminUsername,
    password: env.adminPassword
  });
  return { agent, token };
}

describe("Security headers", () => {
  test("Helmet security headers are present", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toMatch(/default-src 'self'/);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Settings validation", () => {
  test("rejects an unknown settings key", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent.put("/api/admin/settings").set("X-CSRF-Token", token).send({ not_a_real_key: "x" });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid phone number in settings", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .put("/api/admin/settings")
      .set("X-CSRF-Token", token)
      .send({ whatsapp_number: "not-a-phone" });
    expect(res.status).toBe(400);
  });

  test("accepts and persists a valid settings update", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .put("/api/admin/settings")
      .set("X-CSRF-Token", token)
      .send({ site_name: "Updated Shop Name" });
    expect(res.status).toBe(200);
    expect(res.body.site_name).toBe("Updated Shop Name");
  });

  test("rejects a javascript: URI in a URL setting", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .put("/api/admin/settings")
      .set("X-CSRF-Token", token)
      .send({ instagram_url: "javascript:alert(1)" });
    expect(res.status).toBe(200);
    expect(res.body.instagram_url).toBe("");
  });
});

describe("File upload signature validation", () => {
  test("rejects a non-image file disguised with a .jpg extension", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .post("/api/admin/upload")
      .set("X-CSRF-Token", token)
      .attach("image", Buffer.from("not really an image, just plain text"), {
        filename: "fake.jpg",
        contentType: "image/jpeg"
      });
    expect(res.status).toBe(400);
  });

  test("accepts a real PNG", async () => {
    const { agent, token } = await loginAgent();
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const res = await agent
      .post("/api/admin/upload")
      .set("X-CSRF-Token", token)
      .attach("image", pngBuffer, { filename: "real.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
  });
});

describe("Password policy", () => {
  test("rejects a weak new password on change-password", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .post("/api/admin/change-password")
      .set("X-CSRF-Token", token)
      .send({ currentPassword: env.adminPassword, newPassword: "weak" });
    expect(res.status).toBe(400);
  });

  test("rejects change-password with wrong current password", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .post("/api/admin/change-password")
      .set("X-CSRF-Token", token)
      .send({ currentPassword: "wrong-current-pw", newPassword: "NewStrongPassw0rd!" });
    expect(res.status).toBe(401);
  });
});
