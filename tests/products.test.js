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

describe("Public catalog", () => {
  test("GET /api/products returns the seeded catalog", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("price");
  });

  test("GET /api/categories returns a list of names", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /api/settings returns shop settings", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("site_name");
  });
});

describe("Admin product CRUD", () => {
  test("create, read, update, delete a product", async () => {
    const { agent, token } = await loginAgent();

    const created = await agent
      .post("/api/admin/products")
      .set("X-CSRF-Token", token)
      .send({ name: "Test Sparkler", category: "Test Category", pack: "1 pkt", price: 50, orig: 100 });
    expect(created.status).toBe(200);
    expect(created.body.name).toBe("Test Sparkler");
    const id = created.body.id;

    const updated = await agent
      .put(`/api/admin/products/${id}`)
      .set("X-CSRF-Token", token)
      .send({ name: "Updated Sparkler", category: "Test Category", pack: "1 pkt", price: 60, orig: 100 });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated Sparkler");
    expect(updated.body.price).toBe(60);

    const deleted = await agent.delete(`/api/admin/products/${id}`).set("X-CSRF-Token", token);
    expect(deleted.status).toBe(200);
  });

  test("rejects invalid price (negative)", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .post("/api/admin/products")
      .set("X-CSRF-Token", token)
      .send({ name: "Bad Product", category: "Test", price: -5, orig: 10 });
    expect(res.status).toBe(400);
  });

  test("rejects missing required fields", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent.post("/api/admin/products").set("X-CSRF-Token", token).send({ price: 10, orig: 20 });
    expect(res.status).toBe(400);
  });

  test("strips HTML/script content from product name (stored XSS defense)", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .post("/api/admin/products")
      .set("X-CSRF-Token", token)
      .send({ name: '<script>alert(1)</script>Evil', category: "Test", price: 10, orig: 20 });
    expect(res.status).toBe(200);
    expect(res.body.name).not.toMatch(/<script>/i);
  });

  test("rejects javascript: URI in image field", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent
      .post("/api/admin/products")
      .set("X-CSRF-Token", token)
      .send({ name: "Test", category: "Test", price: 10, orig: 20, img: "javascript:alert(1)" });
    expect(res.status).toBe(200);
    expect(res.body.img).toBe("");
  });
});

describe("Admin category CRUD", () => {
  test("cannot delete a category that's still in use by products", async () => {
    const { agent, token } = await loginAgent();
    const cat = await agent.post("/api/admin/categories").set("X-CSRF-Token", token).send({ name: "InUseCategory" });
    await agent
      .post("/api/admin/products")
      .set("X-CSRF-Token", token)
      .send({ name: "Product In Category", category: "InUseCategory", price: 10, orig: 20 });

    const del = await agent.delete(`/api/admin/categories/${cat.body.id}`).set("X-CSRF-Token", token);
    expect(del.status).toBe(400);
  });
});
