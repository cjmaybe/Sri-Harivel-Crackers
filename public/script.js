var PRODUCTS = [];
var CATEGORIES = [];
var SETTINGS = {};
var WHATSAPP_NUMBER = "919095043444";
var MIN_ORDER_TN = 3000;
var MIN_ORDER_OTHER = 5000;

var cart = {}; // productId -> qty
var activeCat = "All";
var currentSort = "default";

var PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9f2"/><stop offset="1" stop-color="#fdf3d7"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><g fill="none" stroke="#c51494" stroke-width="4" stroke-linecap="round"><path d="M150 70v40M150 190v40M70 150h40M190 150h40"/><path d="M95 95l28 28M177 177l28 28M177 95l-28 28M95 177l28-28"/></g><circle cx="150" cy="150" r="10" fill="#f5a800" stroke="none"/></svg>'
);

function inr(n){
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}
function discountPct(p){
  var off = Math.round((1 - p.price / p.orig) * 100);
  return off > 0 ? off + "% OFF" : "";
}
function esc(s){
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ---------- Apply settings to the page ---------- */
function applySettings(){
  WHATSAPP_NUMBER = SETTINGS.whatsapp_number || WHATSAPP_NUMBER;
  MIN_ORDER_TN = parseInt(SETTINGS.min_order_tn, 10) || MIN_ORDER_TN;
  MIN_ORDER_OTHER = parseInt(SETTINGS.min_order_other, 10) || MIN_ORDER_OTHER;

  var wa1 = "https://wa.me/" + WHATSAPP_NUMBER;
  var wa2 = SETTINGS.whatsapp_number_2 ? "https://wa.me/" + SETTINGS.whatsapp_number_2 : wa1;

  setHref("pricelistLink", SETTINGS.pricelist_url);
  setHref("pricelistLinkFoot", SETTINGS.pricelist_url);
  setHref("waSocialLink", wa1);
  setHref("instaLink", SETTINGS.instagram_url);
  setHref("ytLink", SETTINGS.youtube_url);
  setHref("fbLink", SETTINGS.facebook_url);
  setHref("waFootLink1", wa1);
  setText("waFootLink1", SETTINGS.phone_1);
  setHref("waFootLink2", wa2);
  setText("waFootLink2", SETTINGS.phone_2);
  setHref("telFootLink", "tel:" + (SETTINGS.phone_1 || "").replace(/\s+/g, ""));
  setText("telFootLink", "Call: " + (SETTINGS.phone_1 || ""));
  setHref("emailFootLink", "mailto:" + SETTINGS.email);
  setText("emailFootLink", SETTINGS.email);
  setHref("phone1Link", "tel:" + (SETTINGS.phone_1 || "").replace(/\s+/g, ""));
  setText("phone1Link", SETTINGS.phone_1);
  setHref("phone2Link", "tel:" + (SETTINGS.phone_2 || "").replace(/\s+/g, ""));
  setText("phone2Link", SETTINGS.phone_2);
  setHref("emailLink", "mailto:" + SETTINGS.email);
  setText("emailLink", SETTINGS.email);
  setText("addrText", SETTINGS.address);

  var strip = document.getElementById("minOrderStrip");
  if (strip) {
    strip.innerHTML = "Minimum Order — Tamil Nadu &amp; Puducherry: " + inr(MIN_ORDER_TN) + " &nbsp;•&nbsp; Other States: " + inr(MIN_ORDER_OTHER);
  }
  document.title = (SETTINGS.site_name || "Jallikattu Crackers") + " — " + (SETTINGS.tagline || "Best Crackers Shop in Sivakasi");
}
function setHref(id, val){
  var el = document.getElementById(id);
  if (el && val) el.setAttribute("href", val);
}
function setText(id, val){
  var el = document.getElementById(id);
  if (el && val) el.textContent = val;
}

/* ---------- Render category chips ---------- */
function renderChips(){
  var counts = {};
  PRODUCTS.forEach(function(p){ counts[p.cat] = (counts[p.cat] || 0) + 1; });
  var html = '<button class="chip' + (activeCat === "All" ? " active" : "") + '" data-cat="All">All <span class="n">' + PRODUCTS.length + '</span></button>';
  CATEGORIES.forEach(function(c){
    if (!counts[c]) return;
    html += '<button class="chip' + (activeCat === c ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + ' <span class="n">' + counts[c] + '</span></button>';
  });
  document.getElementById("chips").innerHTML = html;
}

/* ---------- Filtering ---------- */
function visibleProducts(){
  var q = (document.getElementById("search").value || "").trim().toLowerCase();
  var list = PRODUCTS.filter(function(p){
    if (activeCat !== "All" && p.cat !== activeCat) return false;
    if (!q) return true;
    return (p.name + " " + p.pack + " " + p.cat).toLowerCase().indexOf(q) !== -1;
  });
  if (currentSort === "low") list.sort(function(a,b){ return a.price - b.price; });
  else if (currentSort === "high") list.sort(function(a,b){ return b.price - a.price; });
  else if (currentSort === "a-z") list.sort(function(a,b){ return a.name.localeCompare(b.name); });
  return list;
}

/* ---------- Render products ---------- */
function renderGrid(){
  var list = visibleProducts();
  var grid = document.getElementById("grid");
  if (!list.length){
    grid.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg><p>No crackers found. Try a different search or category.</p></div>';
  } else {
    var html = "";
    list.forEach(function(p){
      var off = discountPct(p);
      var inCart = !!cart[p.id];
      html += '<article class="card' + (inCart ? " in-cart" : "") + '" data-id="' + p.id + '">'
        + '<div class="card-img">'
        + '<img src="' + esc(p.img || PLACEHOLDER) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.onerror=null;this.src=PLACEHOLDER;">'
        + (off ? '<span class="off-badge' + (p.price < 50 ? " gold" : "") + '">' + off + '</span>' : "")
        + '</div>'
        + '<div class="card-body">'
        + (p.pack ? '<span class="card-pack">' + esc(p.pack) + '</span>' : "")
        + '<h3 class="card-title">' + esc(p.name) + '</h3>'
        + '<div class="price-row"><span class="price-now">' + inr(p.price) + '</span>'
        + (p.orig > p.price ? '<span class="price-old">' + inr(p.orig) + '</span>' : "")
        + '</div>'
        + '<div class="add-row">'
        + '<button class="btn-add">+ Add</button>'
        + '<div class="stepper"><button class="st-minus" aria-label="Decrease">−</button><span class="q">' + (cart[p.id] || 0) + '</span><button class="st-plus" aria-label="Increase">+</button></div>'
        + '</div>'
        + '</div></article>';
    });
    grid.innerHTML = html;
  }
  document.getElementById("resultCount").textContent = list.length + " items";
}

/* ---------- Cart helpers ---------- */
function cartArray(){
  return Object.keys(cart).map(function(id){
    var p = PRODUCTS.find(function(x){ return x.id === id; });
    return p ? { p: p, qty: cart[id] } : null;
  }).filter(Boolean);
}
function grandTotal(){
  return cartArray().reduce(function(s, it){ return s + it.p.price * it.qty; }, 0);
}
function saveCart(){
  try { localStorage.setItem("jallikattu-cart", JSON.stringify(cart)); } catch(e){}
}
function loadCart(){
  try {
    var s = localStorage.getItem("jallikattu-cart");
    if (s) cart = JSON.parse(s);
  } catch(e){ cart = {}; }
}

function updateCartUI(){
  var count = cartArray().reduce(function(s, it){ return s + it.qty; }, 0);
  var badges = [document.getElementById("cartCount"), document.getElementById("fabCount")];
  badges.forEach(function(b){
    b.textContent = count;
    b.classList.toggle("show", count > 0);
  });
  document.getElementById("cartFab").classList.toggle("fab-visible", count > 0);
  renderCartDrawer();
  renderGrid();
}

function renderCartDrawer(){
  var body = document.getElementById("cartBody");
  var items = cartArray();
  if (!items.length){
    body.innerHTML = '<div class="cart-empty">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
      + '<p>Your cart is empty.</p>'
      + '<a href="#products" class="btn btn-primary">Browse Products</a>'
      + '</div>';
    return;
  }
  var html = "";
  items.forEach(function(it){
    html += '<div class="cart-item" data-id="' + it.p.id + '">'
      + '<img src="' + esc(it.p.img || PLACEHOLDER) + '" alt="" onerror="this.onerror=null;this.src=PLACEHOLDER;">'
      + '<div class="cart-item-info">'
      + '<b>' + esc(it.p.name) + '</b>'
      + (it.p.pack ? '<span class="pack">' + esc(it.p.pack) + '</span>' : "")
      + '<div class="cart-item-line">'
      + '<button class="qty-btn dec" aria-label="Decrease">−</button>'
      + '<span class="q">' + it.qty + '</span>'
      + '<button class="qty-btn inc" aria-label="Increase">+</button>'
      + '</div>'
      + '</div>'
      + '<div class="cart-item-price"><div class="now">' + inr(it.p.price * it.qty) + '</div>'
      + (it.p.orig > it.p.price ? '<div class="old">' + inr(it.p.orig * it.qty) + '</div>' : "")
      + '</div>'
      + '<button class="cart-item-remove" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
      + '</div>';
  });
  body.innerHTML = html;
}

function renderCartFoot(){
  var total = grandTotal();
  var count = cartArray().reduce(function(s, it){ return s + it.qty; }, 0);
  document.getElementById("itemCount").textContent = count + (count === 1 ? " item" : " items");
  document.getElementById("grandTotal").textContent = inr(total);
  var note = document.getElementById("minNote");
  var txt = document.getElementById("minNoteText");
  if (total > 0 && total < MIN_ORDER_TN){
    note.classList.add("show");
    txt.textContent = "Minimum order is " + inr(MIN_ORDER_TN) + " for Tamil Nadu & Puducherry. Orders below this will be treated as an enquiry.";
    document.getElementById("orderWaLabel").textContent = "Send Enquiry on WhatsApp";
  } else if (total >= MIN_ORDER_TN && total < MIN_ORDER_OTHER){
    note.classList.add("show");
    txt.textContent = "For orders to states other than TN/Puducherry, the minimum is " + inr(MIN_ORDER_OTHER) + ".";
    document.getElementById("orderWaLabel").textContent = "Order on WhatsApp";
  } else {
    note.classList.remove("show");
    document.getElementById("orderWaLabel").textContent = "Order on WhatsApp";
  }
}

/* ---------- Place order + WhatsApp ---------- */
function openWhatsApp(){
  var items = cartArray();
  if (!items.length){ toast("Your cart is empty. Add some crackers first."); openCart(); return; }
  var name = document.getElementById("custName").value.trim();
  var mobile = document.getElementById("custMobile").value.trim();
  var addr = document.getElementById("custAddress").value.trim();

  var lines = [];
  lines.push("*New Order — " + (SETTINGS.site_name || "Jallikattu Crackers") + "*");
  lines.push("*Sivakasi, Tamil Nadu*");
  lines.push("");
  items.forEach(function(it){
    lines.push("*" + it.qty + " ×* " + it.p.name + (it.p.pack ? " (" + it.p.pack + ")" : "") + " = " + inr(it.p.price * it.qty));
  });
  lines.push("");
  lines.push("*Grand Total: " + inr(grandTotal()) + "*");
  if (name) lines.push("*Name:* " + name);
  if (mobile) lines.push("*Mobile:* " + mobile);
  if (addr) lines.push("*Address:* " + addr);
  lines.push("");
  lines.push("Please confirm my order. Thank you!");
  var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(lines.join("\n"));

  // Save the order to the shop database (best-effort — WhatsApp still opens even if this fails).
  // Note: the server recomputes prices/total from its own database and ignores
  // the price/total values sent here — they're informational only for the
  // WhatsApp message text above.
  ensureCsrfToken().then(function(token){
    return fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({
        custName: name,
        custMobile: mobile,
        custAddress: addr,
        items: items.map(function(it){ return { id: it.p.id, qty: it.qty }; })
      })
    });
  }).catch(function(){ /* ignore — order still goes to WhatsApp */ });

  window.open(url, "_blank", "noopener");
  closeCart();
}

/* ---------- Drawer ---------- */
function openCart(){ document.getElementById("drawer").classList.add("show"); document.getElementById("overlay").classList.add("show"); renderCartDrawer(); renderCartFoot(); }
function closeCart(){ document.getElementById("drawer").classList.remove("show"); document.getElementById("overlay").classList.remove("show"); }

/* ---------- Toast ---------- */
var toastTimer;
function toast(msg){
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2200);
}

/* ---------- Events ---------- */
document.addEventListener("click", function(e){
  var addBtn = e.target.closest(".btn-add");
  if (addBtn){
    var id = addBtn.closest(".card").dataset.id;
    cart[id] = (cart[id] || 0) + 1;
    saveCart(); updateCartUI();
    return;
  }
  var plus = e.target.closest(".st-plus");
  if (plus){
    var id1 = plus.closest(".card").dataset.id;
    cart[id1] = (cart[id1] || 0) + 1;
    saveCart(); updateCartUI();
    return;
  }
  var minus = e.target.closest(".st-minus");
  if (minus){
    var id2 = minus.closest(".card").dataset.id;
    if (cart[id2] > 1) cart[id2]--; else delete cart[id2];
    saveCart(); updateCartUI();
    return;
  }
  var inc = e.target.closest(".cart-item .inc");
  if (inc){
    var id3 = inc.closest(".cart-item").dataset.id;
    cart[id3] = (cart[id3] || 0) + 1;
    saveCart(); updateCartUI(); renderCartFoot();
    return;
  }
  var dec = e.target.closest(".cart-item .dec");
  if (dec){
    var id4 = dec.closest(".cart-item").dataset.id;
    if (cart[id4] > 1) cart[id4]--; else delete cart[id4];
    saveCart(); updateCartUI(); renderCartFoot();
    return;
  }
  var rm = e.target.closest(".cart-item-remove");
  if (rm){
    delete cart[rm.closest(".cart-item").dataset.id];
    saveCart(); updateCartUI(); renderCartFoot();
    return;
  }
  var chip = e.target.closest(".chip");
  if (chip){
    activeCat = chip.dataset.cat;
    renderChips(); renderGrid();
    return;
  }
  var orderNow = e.target.closest(".order-now");
  if (orderNow){
    e.preventDefault();
    openCart();
    return;
  }
});

document.getElementById("search").addEventListener("input", function(){ renderGrid(); });
document.getElementById("sort").addEventListener("change", function(){ currentSort = this.value; renderGrid(); });
document.getElementById("cartBtn").addEventListener("click", openCart);
document.getElementById("cartFab").addEventListener("click", openCart);
document.getElementById("drawerClose").addEventListener("click", closeCart);
document.getElementById("overlay").addEventListener("click", closeCart);
document.getElementById("orderWa").addEventListener("click", openWhatsApp);

var topBtn = document.getElementById("toTop");
window.addEventListener("scroll", function(){
  if (window.scrollY > 600) topBtn.classList.add("show"); else topBtn.classList.remove("show");
});
topBtn.addEventListener("click", function(){ window.scrollTo({ top: 0, behavior: "smooth" }); });

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Init: load data from the API, then render ---------- */
function showLoadError(){
  document.getElementById("grid").innerHTML = '<div class="empty"><p>Could not load products. Please refresh the page, or make sure the shop server is running.</p></div>';
}

/* CSRF token for the one state-changing request this page makes (placing an order). */
var CSRF_TOKEN = null;
function ensureCsrfToken(){
  if (CSRF_TOKEN) return Promise.resolve(CSRF_TOKEN);
  return fetch("/api/csrf-token").then(function(r){ return r.json(); }).then(function(d){
    CSRF_TOKEN = d.csrfToken;
    return CSRF_TOKEN;
  });
}

Promise.all([
  fetch("/api/settings").then(function(r){ return r.json(); }),
  fetch("/api/categories").then(function(r){ return r.json(); }),
  fetch("/api/products").then(function(r){ return r.json(); }),
  ensureCsrfToken()
]).then(function(results){
  SETTINGS = results[0] || {};
  CATEGORIES = results[1] || [];
  PRODUCTS = results[2] || [];
  applySettings();
  loadCart();
  renderChips();
  renderGrid();
  updateCartUI();
  renderCartFoot();
}).catch(function(){
  showLoadError();
});
