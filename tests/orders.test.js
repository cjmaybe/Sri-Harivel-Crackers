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

async function getCsrf(agent) {
  const res = await agent.get("/api/csrf-token");
  return res.body.csrfToken;
}

describe("Order placement", () => {
  test("ignores a tampered client-supplied price and recomputes from the DB", async () => {
    const products = await request(app).get("/api/products");
    const product = products.body[0];
    const realPrice = product.price;

    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent
      .post("/api/orders")
      .set("X-CSRF-Token", token)
      .send({
        custMobile: "9876543210",
        items: [{ id: Number(product.id), qty: 3, price: 1 }] // attacker sends price: 1
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(realPrice * 3);
  });

  test("rejects an order referencing a non-existent product id", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent
      .post("/api/orders")
      .set("X-CSRF-Token", token)
      .send({ items: [{ id: 999999, qty: 1 }] });
    expect(res.status).toBe(400);
  });

  test("rejects an empty cart", async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent.post("/api/orders").set("X-CSRF-Token", token).send({ items: [] });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid mobile number", async () => {
    const products = await request(app).get("/api/products");
    const product = products.body[0];
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const res = await agent
      .post("/api/orders")
      .set("X-CSRF-Token", token)
      .send({ custMobile: "abc", items: [{ id: Number(product.id), qty: 1 }] });
    expect(res.status).toBe(400);
  });

  test("strips script tags from customer name before storing", async () => {
    const products = await request(app).get("/api/products");
    const product = products.body[0];
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const orderRes = await agent
      .post("/api/orders")
      .set("X-CSRF-Token", token)
      .send({
        custName: "<script>alert(1)</script>Rahul",
        items: [{ id: Number(product.id), qty: 1 }]
      });
    expect(orderRes.status).toBe(200);

    const { agent: adminAgent } = await loginAgent();
    const listRes = await adminAgent.get("/api/admin/orders");
    const placed = listRes.body.find((o) => o.id === orderRes.body.orderId);
    expect(placed.cust_name).not.toMatch(/<script>/i);
    expect(placed.cust_name).toContain("Rahul");
  });

  test("rejects order placement without a CSRF token", async () => {
    const products = await request(app).get("/api/products");
    const product = products.body[0];
    const agent = request.agent(app);
    await agent.get("/api/csrf-token"); // sets cookie but we won't send header
    const res = await agent.post("/api/orders").send({ items: [{ id: Number(product.id), qty: 1 }] });
    expect(res.status).toBe(403);
  });
});

describe("Admin order management", () => {
  test("can update order status to a valid value", async () => {
    const products = await request(app).get("/api/products");
    const product = products.body[0];
    const agent = request.agent(app);
    const token = await getCsrf(agent);
    const orderRes = await agent
      .post("/api/orders")
      .set("X-CSRF-Token", token)
      .send({ items: [{ id: Number(product.id), qty: 1 }] });

    const { agent: adminAgent, token: adminToken } = await loginAgent();
    const update = await adminAgent
      .put(`/api/admin/orders/${orderRes.body.orderId}`)
      .set("X-CSRF-Token", adminToken)
      .send({ status: "confirmed" });
    expect(update.status).toBe(200);
  });

  test("rejects an invalid status value", async () => {
    const { agent, token } = await loginAgent();
    const res = await agent.put("/api/admin/orders/1").set("X-CSRF-Token", token).send({ status: "hacked" });
    expect(res.status).toBe(400);
  });
});
