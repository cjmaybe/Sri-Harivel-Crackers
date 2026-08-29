var STATE = {
  products: [],
  categories: [],
  orders: [],
  settings: {}
};

/* ---------- helpers ---------- */
function $(sel, root){ return (root || document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function inr(n){ return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

function toast(msg){
  var t = $("#adminToast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.classList.remove("show"); }, 2400);
}

/* ---------- CSRF token handling ----------
   Fetched once from the server and attached to every state-changing
   request so it can be verified against the csrf_token cookie
   (double-submit pattern). See middleware/csrf.js on the server. */
var CSRF_TOKEN = null;
function ensureCsrfToken(){
  if (CSRF_TOKEN) return Promise.resolve(CSRF_TOKEN);
  return fetch("/api/csrf-token").then(function(r){ return r.json(); }).then(function(d){
    CSRF_TOKEN = d.csrfToken;
    return CSRF_TOKEN;
  });
}
ensureCsrfToken();

function api(url, opts){
  opts = opts || {};
  var method = (opts.method || "GET").toUpperCase();
  var needsCsrf = method !== "GET" && method !== "HEAD";
  var run = function(){
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (needsCsrf && CSRF_TOKEN) opts.headers["X-CSRF-Token"] = CSRF_TOKEN;
    return fetch(url, opts).then(function(r){
      if (r.status === 401){
        showLogin();
        throw new Error("Not authenticated");
      }
      return r.json().then(function(data){
        if (!r.ok) throw new Error(data.error || "Request failed");
        return data;
      });
    });
  };
  return needsCsrf ? ensureCsrfToken().then(run) : run();
}

/* ============================================================
   AUTH
   ============================================================ */
function showLogin(){
  $("#loginScreen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
function showApp(username){
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#whoami").textContent = username ? "Signed in as " + username : "";
}

function checkAuth(){
  fetch("/api/admin/me").then(function(r){ return r.json(); }).then(function(data){
    if (data.loggedIn){
      showApp(data.username);
      initDashboard();
    } else {
      showLogin();
    }
  });
}

$("#loginForm").addEventListener("submit", function(e){
  e.preventDefault();
  var username = $("#loginUsername").value.trim();
  var password = $("#loginPassword").value;
  $("#loginError").textContent = "";
  api("/api/admin/login", { method: "POST", body: JSON.stringify({ username: username, password: password }) })
    .then(function(data){
      showApp(data.username);
      initDashboard();
    })
    .catch(function(err){ $("#loginError").textContent = err.message; });
});

$("#logoutBtn").addEventListener("click", function(){
  api("/api/admin/logout", { method: "POST" }).then(function(){ showLogin(); });
});

/* ============================================================
   NAVIGATION
   ============================================================ */
$all(".nav-link").forEach(function(btn){
  btn.addEventListener("click", function(){
    $all(".nav-link").forEach(function(b){ b.classList.remove("active"); });
    btn.classList.add("active");
    $all(".view").forEach(function(v){ v.classList.add("hidden"); });
    var view = btn.dataset.view;
    $("#view-" + view).classList.remove("hidden");
    $("#viewTitle").textContent = btn.textContent.trim();
    if (view === "dashboard") loadDashboardStats();
    if (view === "products") loadProducts();
    if (view === "categories") loadCategories();
    if (view === "orders") loadOrders();
    if (view === "settings") loadSettings();
  });
});

function initDashboard(){
  loadDashboardStats();
  loadCategoriesForFilters();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function loadDashboardStats(){
  api("/api/admin/stats").then(function(s){
    $("#statProducts").textContent = s.totalProducts;
    $("#statOrders").textContent = s.totalOrders;
    $("#statNewOrders").textContent = s.newOrders;
    $("#statRevenue").textContent = inr(s.revenue);
  });
  api("/api/admin/orders").then(function(orders){
    var recent = orders.slice(0, 8);
    $("#recentOrdersTable tbody").innerHTML = recent.map(function(o){
      return "<tr><td>#" + o.id + "</td><td>" + esc(o.cust_name || "—") + "</td><td>" + esc(o.cust_mobile || "—") + "</td><td>" + inr(o.total) + "</td><td>" + statusBadge(o.status) + "</td><td>" + esc(o.created_at) + "</td></tr>";
    }).join("") || "<tr><td colspan='6' style='text-align:center;color:#999;'>No orders yet</td></tr>";
  });
}

function statusBadge(status){
  var labels = { new: "New", confirmed: "Confirmed", delivered: "Delivered", cancelled: "Cancelled" };
  return '<span class="badge badge-' + status + '">' + (labels[status] || status) + '</span>';
}

/* ============================================================
   PRODUCTS
   ============================================================ */
function loadProducts(){
  api("/api/admin/products").then(function(products){
    STATE.products = products;
    renderProductsTable();
  });
}

function renderProductsTable(){
  var q = ($("#productSearch").value || "").toLowerCase();
  var cat = $("#productCatFilter").value;
  var list = STATE.products.filter(function(p){
    if (cat && p.category !== cat) return false;
    if (q && (p.name + " " + p.category).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  $("#productsTable tbody").innerHTML = list.map(function(p){
    return "<tr>"
      + "<td><img class='prod-thumb' src='" + esc(p.img || "") + "' onerror=\"this.style.visibility='hidden'\"></td>"
      + "<td class='wrap'>" + esc(p.name) + "</td>"
      + "<td>" + esc(p.category) + "</td>"
      + "<td>" + esc(p.pack) + "</td>"
      + "<td>" + inr(p.price) + "</td>"
      + "<td>" + inr(p.orig) + "</td>"
      + "<td>" + (p.active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Hidden</span>') + "</td>"
      + "<td class='row-actions'>"
      + "<button class='btn btn-sm btn-ghost' data-edit='" + p.id + "'>Edit</button>"
      + "<button class='btn btn-sm btn-danger' data-del='" + p.id + "'>Delete</button>"
      + "</td></tr>";
  }).join("") || "<tr><td colspan='8' style='text-align:center;color:#999;'>No products found</td></tr>";
}

$("#productSearch").addEventListener("input", renderProductsTable);
$("#productCatFilter").addEventListener("change", renderProductsTable);

$("#productsTable").addEventListener("click", function(e){
  var editId = e.target.dataset.edit;
  var delId = e.target.dataset.del;
  if (editId) openProductModal(STATE.products.find(function(p){ return String(p.id) === editId; }));
  if (delId){
    if (confirm("Delete this product? This cannot be undone.")){
      api("/api/admin/products/" + delId, { method: "DELETE" }).then(function(){
        toast("Product deleted");
        loadProducts();
      });
    }
  }
});

$("#addProductBtn").addEventListener("click", function(){ openProductModal(null); });
$("#productCancelBtn").addEventListener("click", closeProductModal);

function openProductModal(product){
  var form = $("#productForm");
  form.reset();
  $("#productImgPreview").classList.add("hidden");
  $("#productModalTitle").textContent = product ? "Edit Product" : "Add Product";
  form.id.value = product ? product.id : "";
  if (product){
    form.name.value = product.name;
    form.category.value = product.category;
    form.pack.value = product.pack || "";
    form.price.value = product.price;
    form.orig.value = product.orig;
    form.active.checked = !!product.active;
    if (product.img){
      $("#productImgPreview").src = product.img;
      $("#productImgPreview").classList.remove("hidden");
    }
    form.dataset.currentImg = product.img || "";
  } else {
    form.active.checked = true;
    form.dataset.currentImg = "";
  }
  $("#categoryList").innerHTML = STATE.categories.map(function(c){ return "<option value='" + esc(c.name) + "'>"; }).join("");
  $("#productModal").classList.remove("hidden");
}
function closeProductModal(){ $("#productModal").classList.add("hidden"); }

$("#productForm").addEventListener("submit", function(e){
  e.preventDefault();
  var form = e.target;
  var id = form.id.value;
  var file = form.imageFile.files[0];

  function saveProduct(imgUrl){
    var payload = {
      name: form.name.value.trim(),
      category: form.category.value.trim(),
      pack: form.pack.value.trim(),
      price: Number(form.price.value),
      orig: Number(form.orig.value),
      active: form.active.checked,
      img: imgUrl != null ? imgUrl : form.dataset.currentImg
    };
    var req = id
      ? api("/api/admin/products/" + id, { method: "PUT", body: JSON.stringify(payload) })
      : api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
    req.then(function(){
      toast(id ? "Product updated" : "Product added");
      closeProductModal();
      loadProducts();
      loadCategoriesForFilters();
    }).catch(function(err){ toast(err.message); });
  }

  if (file){
    var fd = new FormData();
    fd.append("image", file);
    ensureCsrfToken().then(function(token){
      return fetch("/api/admin/upload", { method: "POST", body: fd, headers: { "X-CSRF-Token": token } });
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.error) throw new Error(data.error);
        saveProduct(data.url);
      })
      .catch(function(err){ toast(err.message); });
  } else {
    saveProduct();
  }
});

$("#productForm input[name=imageFile]").addEventListener("change", function(e){
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev){
    $("#productImgPreview").src = ev.target.result;
    $("#productImgPreview").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

/* ============================================================
   CATEGORIES
   ============================================================ */
function loadCategories(){
  api("/api/admin/categories").then(function(cats){
    STATE.categories = cats;
    var counts = {};
    STATE.products.forEach(function(p){ counts[p.category] = (counts[p.category] || 0) + 1; });
    api("/api/admin/products").then(function(products){
      STATE.products = products;
      products.forEach(function(p){ counts[p.category] = (counts[p.category] || 0) + 1; });
      $("#categoriesTable tbody").innerHTML = cats.map(function(c){
        return "<tr><td>" + esc(c.name) + "</td><td>" + (counts[c.name] || 0) + "</td>"
          + "<td class='row-actions'>"
          + "<button class='btn btn-sm btn-ghost' data-rename='" + c.id + "'>Rename</button>"
          + "<button class='btn btn-sm btn-danger' data-delcat='" + c.id + "'>Delete</button>"
          + "</td></tr>";
      }).join("");
    });
  });
}

function loadCategoriesForFilters(){
  api("/api/admin/categories").then(function(cats){
    STATE.categories = cats;
    $("#productCatFilter").innerHTML = "<option value=''>All categories</option>" + cats.map(function(c){
      return "<option value='" + esc(c.name) + "'>" + esc(c.name) + "</option>";
    }).join("");
  });
}

$("#addCategoryBtn").addEventListener("click", function(){
  var name = $("#newCategoryName").value.trim();
  if (!name) return;
  api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: name }) })
    .then(function(){
      $("#newCategoryName").value = "";
      toast("Category added");
      loadCategories();
      loadCategoriesForFilters();
    })
    .catch(function(err){ toast(err.message); });
});

$("#categoriesTable").addEventListener("click", function(e){
  var renameId = e.target.dataset.rename;
  var delId = e.target.dataset.delcat;
  if (renameId){
    var current = STATE.categories.find(function(c){ return String(c.id) === renameId; });
    var name = prompt("Rename category", current ? current.name : "");
    if (name && name.trim()){
      api("/api/admin/categories/" + renameId, { method: "PUT", body: JSON.stringify({ name: name.trim() }) })
        .then(function(){ toast("Category renamed"); loadCategories(); loadCategoriesForFilters(); loadProducts(); })
        .catch(function(err){ toast(err.message); });
    }
  }
  if (delId){
    if (confirm("Delete this category?")){
      api("/api/admin/categories/" + delId, { method: "DELETE" })
        .then(function(){ toast("Category deleted"); loadCategories(); loadCategoriesForFilters(); })
        .catch(function(err){ toast(err.message); });
    }
  }
});

/* ============================================================
   ORDERS
   ============================================================ */
function loadOrders(){
  api("/api/admin/orders").then(function(orders){
    STATE.orders = orders;
    renderOrdersTable();
  });
}

function renderOrdersTable(){
  var q = ($("#orderSearch").value || "").toLowerCase();
  var status = $("#orderStatusFilter").value;
  var list = STATE.orders.filter(function(o){
    if (status && o.status !== status) return false;
    if (q && ((o.cust_name || "") + " " + (o.cust_mobile || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  $("#ordersTable tbody").innerHTML = list.map(function(o){
    var itemCount = o.items.reduce(function(s, it){ return s + it.qty; }, 0);
    return "<tr>"
      + "<td>#" + o.id + "</td>"
      + "<td>" + esc(o.cust_name || "—") + "</td>"
      + "<td>" + esc(o.cust_mobile || "—") + "</td>"
      + "<td class='wrap'>" + esc(o.cust_address || "—") + "</td>"
      + "<td><a href='#' data-view-order='" + o.id + "'>" + itemCount + " item(s)</a></td>"
      + "<td>" + inr(o.total) + "</td>"
      + "<td>" + statusSelect(o) + "</td>"
      + "<td>" + esc(o.created_at) + "</td>"
      + "<td class='row-actions'><button class='btn btn-sm btn-danger' data-delorder='" + o.id + "'>Delete</button></td>"
      + "</tr>";
  }).join("") || "<tr><td colspan='9' style='text-align:center;color:#999;'>No orders found</td></tr>";
}

function statusSelect(o){
  var statuses = ["new", "confirmed", "delivered", "cancelled"];
  return "<select class='status-select' data-status-for='" + o.id + "'>" + statuses.map(function(s){
    return "<option value='" + s + "'" + (s === o.status ? " selected" : "") + ">" + s.charAt(0).toUpperCase() + s.slice(1) + "</option>";
  }).join("") + "</select>";
}

$("#orderSearch").addEventListener("input", renderOrdersTable);
$("#orderStatusFilter").addEventListener("change", renderOrdersTable);

$("#ordersTable").addEventListener("change", function(e){
  var orderId = e.target.dataset.statusFor;
  if (orderId){
    api("/api/admin/orders/" + orderId, { method: "PUT", body: JSON.stringify({ status: e.target.value }) })
      .then(function(){ toast("Order status updated"); loadOrders(); });
  }
});

$("#ordersTable").addEventListener("click", function(e){
  var viewId = e.target.dataset.viewOrder;
  var delId = e.target.dataset.delorder;
  if (viewId){
    e.preventDefault();
    openOrderModal(STATE.orders.find(function(o){ return String(o.id) === viewId; }));
  }
  if (delId){
    if (confirm("Delete this order permanently?")){
      api("/api/admin/orders/" + delId, { method: "DELETE" }).then(function(){ toast("Order deleted"); loadOrders(); });
    }
  }
});

function openOrderModal(order){
  if (!order) return;
  var itemsHtml = order.items.map(function(it){
    return "<div class='order-item-line'><span>" + it.qty + " × " + esc(it.name) + (it.pack ? " (" + esc(it.pack) + ")" : "") + "</span><span>" + inr(it.price * it.qty) + "</span></div>";
  }).join("");
  $("#orderModalBody").innerHTML =
    "<div class='order-meta'>"
    + "<div><b>Name:</b> " + esc(order.cust_name || "—") + "</div>"
    + "<div><b>Mobile:</b> " + esc(order.cust_mobile || "—") + "</div>"
    + "<div><b>Address:</b> " + esc(order.cust_address || "—") + "</div>"
    + "<div><b>Placed:</b> " + esc(order.created_at) + "</div>"
    + "</div>"
    + itemsHtml
    + "<div class='order-total'><span>Grand Total</span><span>" + inr(order.total) + "</span></div>";
  $("#orderModal").classList.remove("hidden");
}
$("#orderCloseBtn").addEventListener("click", function(){ $("#orderModal").classList.add("hidden"); });

/* ============================================================
   SETTINGS
   ============================================================ */
function loadSettings(){
  api("/api/admin/settings").then(function(settings){
    STATE.settings = settings;
    var form = $("#settingsForm");
    Object.keys(settings).forEach(function(key){
      var field = form.elements[key];
      if (field) field.value = settings[key];
    });
  });
}

$("#settingsForm").addEventListener("submit", function(e){
  e.preventDefault();
  var form = e.target;
  var payload = {};
  $all("input, textarea", form).forEach(function(el){
    if (el.name) payload[el.name] = el.value;
  });
  api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) }).then(function(){
    $("#settingsSaved").textContent = "Saved ✓";
    setTimeout(function(){ $("#settingsSaved").textContent = ""; }, 2500);
  });
});

/* ============================================================
   ACCOUNT / PASSWORD
   ============================================================ */
$("#passwordForm").addEventListener("submit", function(e){
  e.preventDefault();
  var form = e.target;
  api("/api/admin/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: form.currentPassword.value, newPassword: form.newPassword.value })
  }).then(function(){
    $("#passwordSaved").textContent = "Password updated ✓";
    form.reset();
    setTimeout(function(){ $("#passwordSaved").textContent = ""; }, 2500);
  }).catch(function(err){
    $("#passwordSaved").textContent = err.message;
    $("#passwordSaved").style.color = "#d64545";
  });
});

/* ============================================================
   MODAL OVERLAY DISMISS
   ============================================================ */
$all(".modal-overlay").forEach(function(overlay){
  overlay.addEventListener("click", function(e){
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

/* ---------- init ---------- */
checkAuth();
