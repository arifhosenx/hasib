const settingsDefaults = {
  announcement: "Made for the streets. Built in Bangladesh.",
  announcement_detail: "Free delivery on orders over ৳2,500",
  free_shipping_threshold: 2500,
  delivery_fee: 150,
  hero_eyebrow: "Drop 04 — The everyday edit",
  hero_line_1: "FRESH",
  hero_line_2: "OFF THE",
  hero_line_3: "STREET.",
  hero_description: "New energy for your everyday rotation. Thoughtful fits, heavyweight feel, made to move with you.",
  hero_image: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=1400&q=85",
  hero_image_alt: "Model wearing a relaxed streetwear outfit",
  collection_line_1: "THE NEW",
  collection_line_2: "ROTATION.",
  collection_description: "Good things don't stay new for long. Get into the latest RELAXBD pieces before they find their people.",
  story_kicker: "FROM HERE, FOR EVERYWHERE",
  story_line_1: "LOCAL",
  story_line_2: "ROOTS.",
  story_line_3: "LOUDER",
  story_line_4: "FUTURE.",
  story_description: "We make clothes for real life, right here in Bangladesh. Better fabrics, considered fits, and a little more room to be yourself.",
  story_image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85",
  story_image_alt: "Streetwear look photographed outdoors",
  contact_phone: "+8801305827996",
  contact_email: "hello@ornix.com.bd",
  facebook_url: "",
  bkash_number: "",
  whatsapp_number: "",
  faqs: [
    { question: "How long does delivery take?", answer: "Orders usually arrive in 1–2 business days in Dhaka and 3–5 business days elsewhere in Bangladesh. Our team will share delivery updates with you." },
    { question: "Can I exchange an item?", answer: "Yes. We accept exchanges within 7 days of delivery for sizing issues or manufacturing defects. Items must be unworn and have their original tags." },
    { question: "What payment methods do you accept?", answer: "Pay with bKash, Nagad, or cash on delivery in eligible areas. Any advance delivery fee will be confirmed with you when placing your order." }
  ]
};

const config = window.RELAXBD_CONFIG;
const supabaseClient = config?.supabaseUrl && config?.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;
const loginScreen = document.querySelector("#login-screen");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const alertBox = document.querySelector("#admin-alert");
let products = [];
let categories = [];
let orders = [];
let activeOrderFilter = "all";
const pageSize = 30;
let productPage = 0;
let productCount = 0;
let activeProductCount = 0;
let orderPage = 0;
let orderCount = 0;
let customerPage = 0;
let customerCount = 0;
let toastTimer;
let demoPreviewActive = false;
let demoControlStates = [];
let productImagePreviewUrl = "";

const html = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const money = (value) => `৳${(Number(value) || 0).toLocaleString("en-BD")}`;
const safeImage = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const dateTime = (value) => value ? new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium", timeStyle: "short"
}).format(new Date(value)) : "—";
const statusLabel = (value) => ({
  payment_review: "Payment review",
  pending: "New",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  submitted: "TxnID submitted",
  verified: "Verified",
  rejected: "Rejected",
  cash_on_delivery: "Cash on delivery"
}[value] || value);
const statusColor = (value) => ({
  payment_review: "yellow", pending: "blue", processing: "blue",
  shipped: "blue", delivered: "green", cancelled: "red",
  submitted: "yellow", verified: "green", rejected: "red"
}[value] || "");

function notify(message, type = "success") {
  alertBox.textContent = message;
  alertBox.className = `admin-alert ${type}`;
  alertBox.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { alertBox.hidden = true; }, 4500);
}

function showLoginError(message) {
  document.querySelector("#login-error").textContent = message;
}

async function authorizeUser(user) {
  if (!user) return false;
  const { data, error } = await supabaseClient.from("admin_users")
    .select("user_id,display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Could not verify the store administrator.", error);
    showLoginError("Could not verify admin access. Check your database setup and try again.");
    return false;
  }
  if (!data) {
    await supabaseClient.auth.signOut();
    showLoginError("This account is not approved for store administration.");
    return false;
  }
  loginScreen.hidden = true;
  adminApp.hidden = false;
  document.querySelector("#admin-email").textContent = data.display_name || user.email || "Store admin";
  await loadOverview();
  return true;
}

async function verifyExistingSession() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error("Could not read the existing admin session.", error);
    showLoginError("Could not restore your session. Please sign in again.");
    return;
  }
  if (data.session?.user) await authorizeUser(data.session.user);
}

async function handleLogin(event) {
  event.preventDefault();
  showLoginError("");
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const values = new FormData(loginForm);
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: String(values.get("email")).trim(),
    password: String(values.get("password"))
  });
  button.disabled = false;
  if (error) {
    console.error("Admin sign-in failed.", error);
    showLoginError(error.message);
    return;
  }
  await authorizeUser(data.user);
}

async function signOut() {
  if (demoPreviewActive) {
    demoPreviewActive = false;
    adminApp.classList.remove("demo-preview");
    demoControlStates.forEach(([control, disabled]) => { control.disabled = disabled; });
    demoControlStates = [];
    document.querySelectorAll(".view").forEach((view) => { view.hidden = false; });
    document.querySelector("#admin-alert").hidden = true;
    adminApp.hidden = true;
    loginScreen.hidden = false;
    return;
  }
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error("Admin sign-out failed.", error);
    notify(error.message, "error");
    return;
  }
  adminApp.hidden = true;
  loginScreen.hidden = false;
  loginForm.reset();
}

function showDemoPreview() {
  demoPreviewActive = true;
  loginScreen.hidden = true;
  adminApp.hidden = false;
  adminApp.classList.add("demo-preview");
  document.querySelector("#admin-email").textContent = "Demo preview";
  document.querySelectorAll(".view").forEach((view) => { view.hidden = false; });
  const alert = document.querySelector("#admin-alert");
  alert.textContent = "DEMO PREVIEW — Sample data only. This dashboard is not connected to a store, and nothing can be saved.";
  alert.className = "admin-alert demo-notice";
  alert.hidden = false;

  document.querySelector("#metric-sales").textContent = money(48650);
  document.querySelector("#metric-orders").textContent = "24";
  document.querySelector("#metric-pending").textContent = "3 waiting for attention";
  document.querySelector("#metric-payments").textContent = "2";
  document.querySelector("#metric-products").textContent = "3";
  document.querySelector("#metric-stock").textContent = "3 sample products";
  document.querySelector("#nav-order-count").textContent = "3";
  const now = new Date().toISOString();
  categories = [
    { slug: "t-shirts", name: "T-shirts", active: true },
    { slug: "shirts", name: "Shirts", active: true },
    { slug: "bottoms", name: "Bottoms", active: true },
    { slug: "accessories", name: "Accessories", active: true }
  ];
  renderCategories();
  products = [
    { id: "demo-product-1", name: "Core heavyweight tee", subtitle: "Black · Relaxed fit", category: "t-shirts", price: 1290, compare_at_price: 1590, stock: 2, active: true, featured: true, badge: "Best seller", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=120&q=80", alt: "Black heavyweight t-shirt" },
    { id: "demo-product-2", name: "Everyday relaxed shirt", subtitle: "Natural · Boxy fit", category: "shirts", price: 1890, stock: 4, active: true, featured: false, badge: "Just in", image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=120&q=80", alt: "Relaxed fit shirt" },
    { id: "demo-product-3", name: "Utility straight trouser", subtitle: "Olive · Straight fit", category: "bottoms", price: 2490, stock: 12, active: true, featured: true, badge: "New", image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=120&q=80", alt: "Olive utility trousers" }
  ];
  orders = [
    { id: "demo-order-1048", order_number: "DEMO-1048", status: "pending", payment_method: "bkash", payment_status: "verified", bkash_transaction_id: "DEMO-TXN-1048", subtotal: 2580, discount: 0, delivery_fee: 0, total: 2580, customer_note: "", created_at: now, customers: { full_name: "Sample customer", phone: "01XXXXXXXXX", address: "Sample address, Dhaka" }, order_items: [{ product_name: "Core heavyweight tee", quantity: 2 }] },
    { id: "demo-order-1047", order_number: "DEMO-1047", status: "processing", payment_method: "cash_on_delivery", payment_status: "cash_on_delivery", bkash_transaction_id: "", subtotal: 1290, discount: 0, delivery_fee: 150, total: 1440, customer_note: "", created_at: now, customers: { full_name: "Sample customer", phone: "01XXXXXXXXX", address: "Sample address, Chattogram" }, order_items: [{ product_name: "Everyday relaxed shirt", quantity: 1 }] },
    { id: "demo-order-1046", order_number: "DEMO-1046", status: "payment_review", payment_method: "bkash", payment_status: "submitted", bkash_transaction_id: "DEMO-TXN-1046", subtotal: 1690, discount: 0, delivery_fee: 150, total: 1840, customer_note: "Please call before delivery.", created_at: now, customers: { full_name: "Sample customer", phone: "01XXXXXXXXX", address: "Sample address, Sylhet" }, order_items: [{ product_name: "Utility straight trouser", quantity: 1 }] }
  ];
  const store = { ...settingsDefaults, contact_phone: "01XXXXXXXXX", contact_email: "hello@example.com", bkash_number: "01XXXXXXXXX", whatsapp_number: "8801XXXXXXXXX", facebook_url: "https://www.facebook.com/your-page" };
  fillForm(document.querySelector("#content-form"), store);
  fillForm(document.querySelector("#settings-form"), store);
  renderFaqFields(store.faqs);
  document.querySelector("#product-form select[name=category]").innerHTML = categories
    .map((category) => `<option value="${html(category.slug)}">${html(category.name)}</option>`).join("");
  renderProducts();
  renderOrders();
  document.querySelector("#customers-table").innerHTML = `<table class="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Delivery address</th><th>Orders</th><th>Customer since</th></tr></thead><tbody>
    <tr><td class="table-primary">Sample customer</td><td>01XXXXXXXXX</td><td>Sample address, Dhaka</td><td>3</td><td>${dateTime(now)}</td></tr>
    <tr><td class="table-primary">Another sample</td><td>01XXXXXXXXX</td><td>Sample address, Chattogram</td><td>1</td><td>${dateTime(now)}</td></tr>
  </tbody></table>`;
  document.querySelector("#promotions-list").innerHTML = `<table class="data-table"><thead><tr><th>Code</th><th>Discount</th><th>Minimum spend</th><th>Used</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>
    <tr><td><span class="table-primary">WELCOME10</span><div class="table-muted">A little welcome gift</div></td><td>10%</td><td>${money(1500)}</td><td>12 / 100</td><td><span class="status-pill green">Live</span></td><td><button class="row-action" type="button" disabled>Pause</button></td></tr>
    <tr><td><span class="table-primary">FREESHIP</span><div class="table-muted">Free delivery on your next order</div></td><td>${money(150)}</td><td>${money(2500)}</td><td>7 / ∞</td><td><span class="status-pill">Paused</span></td><td><button class="row-action" type="button" disabled>Activate</button></td></tr>
  </tbody></table>`;
  for (const id of ["products-pagination", "orders-pagination", "customers-pagination"]) {
    document.getElementById(id).textContent = "";
  }
  renderRecentOrders();
  renderLowStock();
  demoControlStates = [...adminApp.querySelectorAll("input, select, textarea, button:not(.nav-item):not([data-go]):not(#sign-out):not(#mobile-menu-button):not(#add-product):not([data-close-product])")]
    .map((control) => [control, control.disabled]);
  demoControlStates.forEach(([control]) => { control.disabled = true; });
}

function openDemoProductEditor() {
  openProductEditor();
  const sample = products[0];
  const form = document.querySelector("#product-form");
  form.elements.name.value = "New RELAXBD product";
  form.elements.subtitle.value = "Stone · Relaxed fit";
  form.elements.price.value = "1890";
  form.elements.compare_at_price.value = "";
  form.elements.stock.value = "12";
  form.elements.badge.value = "Just in";
  form.elements.image.value = sample?.image || "";
  form.elements.alt.value = sample?.alt || "New RELAXBD product";
  setProductImagePreview(sample?.image || "", "New RELAXBD product");
  document.querySelector("#image-upload-status").textContent = "Photo upload is disabled in the sample preview.";
  form.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (control.type !== "hidden" && !control.matches("[data-close-product]")) control.disabled = true;
  });
}

function emptyTable(message) {
  return `<table class="data-table"><tbody><tr><td class="empty-table">${html(message)}</td></tr></tbody></table>`;
}

function renderPagination(rootId, page, count, type) {
  const root = document.getElementById(rootId);
  const pages = Math.ceil(count / pageSize);
  root.innerHTML = count > pageSize ? `
    <span>Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, count)} of ${count}</span>
    <div><button type="button" data-page-type="${type}" data-page-step="-1" ${page === 0 ? "disabled" : ""}>← Previous</button><button type="button" data-page-type="${type}" data-page-step="1" ${page >= pages - 1 ? "disabled" : ""}>Next →</button></div>
  ` : (count ? `<span>${count} ${count === 1 ? "item" : "items"}</span>` : "");
}

function productCell(product) {
  return `<div class="table-product"><img src="${html(safeImage(product.image))}" alt="" /><div><span class="table-primary">${html(product.name)}</span><div class="table-muted">${html(product.subtitle)}</div></div></div>`;
}

async function loadProducts() {
  const [totals, activeTotals] = await Promise.all([
    supabaseClient.from("products").select("id", { count: "exact", head: true }),
    supabaseClient.from("products").select("id", { count: "exact", head: true }).eq("active", true)
  ]);
  if (totals.error || activeTotals.error) {
    const error = totals.error || activeTotals.error;
    console.error("Could not count products.", error);
    notify(`Couldn't load products: ${error.message}`, "error");
    return;
  }
  productCount = totals.count ?? 0;
  activeProductCount = activeTotals.count ?? 0;
  if (productPage * pageSize >= productCount && productPage > 0) {
    productPage = Math.max(0, Math.ceil(productCount / pageSize) - 1);
    return loadProducts();
  }
  const paged = await supabaseClient.from("products")
    .select("id,name,subtitle,category,price,compare_at_price,badge,image,alt,stock,active,featured,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(productPage * pageSize, productPage * pageSize + pageSize - 1);
  if (paged.error) {
    console.error("Could not load this page of products.", paged.error);
    notify(`Couldn't load products: ${paged.error.message}`, "error");
    return;
  }
  products = paged.data;
  document.querySelector("#nav-product-count").textContent = activeProductCount;
  document.querySelector("#metric-products").textContent = activeProductCount;
  renderProducts();
  renderPagination("products-pagination", productPage, productCount, "products");
  renderLowStock();
}

function renderProducts() {
  const root = document.querySelector("#products-table");
  if (!products.length) {
    root.innerHTML = emptyTable("Nothing in the catalog yet. Add your first product above.");
    return;
  }
  root.innerHTML = `<table class="data-table"><thead><tr><th>Product</th><th>Price</th><th>In stock</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>
    ${products.map((product) => `
      <tr>
        <td>${productCell(product)}</td>
        <td>${money(product.price)}${product.compare_at_price ? `<div class="table-muted">Was ${money(product.compare_at_price)}</div>` : ""}</td>
        <td><span class="status-pill ${product.stock < 5 ? "yellow" : "green"}">${product.stock}</span></td>
        <td><span class="status-pill ${product.active ? "green" : ""}">${product.active ? "Live" : "Archived"}</span></td>
        <td><div class="row-actions"><button class="row-action" data-edit-product="${html(product.id)}" type="button">Edit</button><button class="row-action ${product.active ? "danger" : ""}" data-toggle-product="${html(product.id)}" data-active="${product.active}" type="button">${product.active ? "Archive" : "Publish"}</button></div></td>
      </tr>
    `).join("")}
  </tbody></table>`;
}

function renderLowStock() {
  const low = products.filter((product) => product.active && product.stock < 5);
  const root = document.querySelector("#low-stock-list");
  if (!low.length) {
    root.innerHTML = `<p class="table-muted">You’re in good shape — no products running low.</p>`;
    return;
  }
  root.innerHTML = `<div class="low-stock-list">${low.map((product) => `
    <article class="low-stock-item"><img src="${html(safeImage(product.image))}" alt="" /><div><strong>${html(product.name)}</strong><span>${product.stock === 0 ? "Out of stock" : `Only ${product.stock} left`}</span></div></article>
  `).join("")}</div>`;
}

async function loadCategories() {
  const { data, error } = await supabaseClient.from("categories")
    .select("slug,name,active")
    .order("name");
  if (error) {
    console.error("Could not load categories.", error);
    notify(`Couldn't load categories: ${error.message}`, "error");
    return;
  }
  categories = data;
  renderCategories();
}

function renderCategories() {
  const categoryCount = document.querySelector("#category-count");
  if (categoryCount) categoryCount.textContent = `${categories.length} ${categories.length === 1 ? "category" : "categories"}`;
  document.querySelector("#categories-list").innerHTML = categories.length
    ? categories.map((category) => `
      <article class="category-item ${category.active ? "" : "archived"}"><span>${html(category.name)}${category.active ? "" : "<small>Archived</small>"}</span><button type="button" data-toggle-category="${html(category.slug)}" data-active="${category.active}" aria-label="${category.active ? "Archive" : "Publish"} ${html(category.name)}">${category.active ? "×" : "↗"}</button></article>
    `).join("")
    : `<p class="table-muted">No categories yet.</p>`;
  const select = document.querySelector("#product-form select[name=category]");
  const selected = select.value;
  select.innerHTML = categories.filter((category) => category.active)
    .map((category) => `<option value="${html(category.slug)}">${html(category.name)}</option>`).join("");
  if (categories.some((category) => category.slug === selected && category.active)) select.value = selected;
}

function openProductEditor(product = null) {
  const editor = document.querySelector("#product-editor");
  const form = document.querySelector("#product-form");
  clearProductImagePreview();
  form.reset();
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.subtitle.value = product?.subtitle || "";
  form.elements.category.value = product?.category || categories.find((category) => category.active)?.slug || "";
  form.elements.price.value = product?.price ?? "";
  form.elements.compare_at_price.value = product?.compare_at_price ?? "";
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.badge.value = product?.badge || "Just in";
  form.elements.image.value = product?.image || "";
  form.elements.alt.value = product?.alt || "";
  form.elements.active.checked = product?.active ?? true;
  form.elements.featured.checked = product?.featured ?? false;
  document.querySelector("#product-image-file").value = "";
  document.querySelector("#image-upload-status").textContent = "Upload directly from your device, or paste an image URL.";
  setProductImagePreview(product?.image || "", product?.name || "");
  document.querySelector("#product-form-title").textContent = product ? "Edit a product" : "Add a product";
  document.querySelector("#product-form-error").textContent = "";
  editor.hidden = false;
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearProductImagePreview() {
  if (productImagePreviewUrl) URL.revokeObjectURL(productImagePreviewUrl);
  productImagePreviewUrl = "";
}

function setProductImagePreview(src, caption = "") {
  const image = document.querySelector("#product-image-preview");
  const empty = document.querySelector("#product-image-empty");
  const captionRoot = document.querySelector("#product-image-caption");
  image.onerror = () => {
    image.hidden = true;
    empty.hidden = false;
    captionRoot.textContent = "This image could not be previewed. Check the URL or choose another photo.";
  };
  if (!src) {
    image.removeAttribute("src");
    image.hidden = true;
    empty.hidden = false;
    captionRoot.textContent = "A clear, well-lit photo works best.";
    return;
  }
  image.src = src;
  image.alt = caption ? `${caption} preview` : "Product image preview";
  image.hidden = false;
  empty.hidden = true;
  captionRoot.textContent = caption || "Product image preview";
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const price = Number(values.get("price"));
  const compareAt = values.get("compare_at_price") === "" ? null : Number(values.get("compare_at_price"));
  const errorRoot = document.querySelector("#product-form-error");
  errorRoot.textContent = "";
  if (!Number.isSafeInteger(price) || price < 0 || (compareAt !== null && (!Number.isSafeInteger(compareAt) || compareAt <= price))) {
    errorRoot.textContent = "Enter a valid price. The compare-at price must be higher than the current price.";
    return;
  }
  const imageFile = form.elements.image_file.files[0];
  const imageUrl = imageFile ? "" : safeImage(values.get("image"));
  const product = {
    name: String(values.get("name")).trim(),
    category: String(values.get("category")),
    subtitle: String(values.get("subtitle") || "").trim(),
    price,
    compare_at_price: compareAt,
    stock: Number(values.get("stock")),
    badge: String(values.get("badge") || "Just in").trim(),
    image: imageUrl,
    alt: String(values.get("alt") || "").trim(),
    active: values.has("active"),
    featured: values.has("featured")
  };
  if (!imageFile && !product.image) {
    errorRoot.textContent = "Upload a product photo or add a valid image URL beginning with https:// or http://.";
    return;
  }
  if (imageFile && (!imageFile.type.startsWith("image/") || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(imageFile.type))) {
    errorRoot.textContent = "Choose a JPG, PNG, WebP or AVIF image.";
    return;
  }
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    errorRoot.textContent = "Product photos must be 5 MB or smaller.";
    return;
  }
  const id = String(values.get("id") || "");
  let uploadedImagePath = "";
  if (imageFile) {
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[imageFile.type];
    uploadedImagePath = `products/${crypto.randomUUID()}.${extension}`;
    document.querySelector("#image-upload-status").textContent = "Uploading your photo…";
    const { error: uploadError } = await supabaseClient.storage.from("product-images").upload(uploadedImagePath, imageFile, {
      cacheControl: "31536000",
      contentType: imageFile.type,
      upsert: false
    });
    if (uploadError) {
      console.error("Could not upload product image.", uploadError);
      document.querySelector("#image-upload-status").textContent = "Photo upload failed.";
      errorRoot.textContent = `Could not upload the photo: ${uploadError.message}. Confirm the product-images storage bucket is set up from supabase/schema.sql.`;
      return;
    }
    product.image = supabaseClient.storage.from("product-images").getPublicUrl(uploadedImagePath).data.publicUrl;
  }
  const result = id
    ? await supabaseClient.from("products").update(product).eq("id", id)
    : await supabaseClient.from("products").insert(product);
  if (result.error) {
    console.error("Could not save product.", result.error);
    if (uploadedImagePath) {
      const { error: cleanupError } = await supabaseClient.storage.from("product-images").remove([uploadedImagePath]);
      if (cleanupError) console.error("Could not remove the image uploaded for the failed product save.", cleanupError);
    }
    errorRoot.textContent = `${result.error.message}${uploadedImagePath ? " The uploaded image was not attached to a product." : ""}`;
    return;
  }
  clearProductImagePreview();
  document.querySelector("#product-editor").hidden = true;
  notify(id ? "Product updated." : "Product added.");
  await loadProducts();
}

async function toggleProduct(productId, currentlyActive) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const action = currentlyActive ? "archive" : "publish";
  const accepted = await confirmAction(
    `${currentlyActive ? "Archive" : "Publish"} ${product.name}?`,
    currentlyActive ? "Archived products disappear from the storefront. Existing orders remain unchanged." : "This product will be visible on your public storefront."
  );
  if (!accepted) return;
  const { error } = await supabaseClient.from("products").update({ active: !currentlyActive }).eq("id", productId);
  if (error) {
    console.error(`Could not ${action} product.`, error);
    notify(error.message, "error");
    return;
  }
  notify(`Product ${currentlyActive ? "archived" : "published"}.`);
  await loadProducts();
}

async function addCategory(event) {
  event.preventDefault();
  const input = document.querySelector("#category-name");
  const name = input.value.trim();
  const baseSlug = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = baseSlug || `category-${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await supabaseClient.from("categories").insert({ slug, name });
  if (error) {
    console.error("Could not add category.", error);
    notify(error.message.includes("duplicate") ? "A category with that name already exists." : error.message, "error");
    return;
  }
  input.value = "";
  notify("Category added.");
  await loadCategories();
}

async function toggleCategory(slug, currentlyActive) {
  const category = categories.find((item) => item.slug === slug);
  if (!category) return;
  if (currentlyActive) {
    const { count, error } = await supabaseClient.from("products")
      .select("id", { count: "exact", head: true })
      .eq("category", slug)
      .eq("active", true);
    if (error) {
      console.error("Could not check products in this category.", error);
      notify(error.message, "error");
      return;
    }
    if (count) {
      notify("Move or archive the active products in this category before archiving the category.", "error");
      return;
    }
  }
  const { error } = await supabaseClient.from("categories").update({ active: !currentlyActive }).eq("slug", slug);
  if (error) {
    console.error("Could not update the category.", error);
    notify(error.message, "error");
    return;
  }
  notify(`Category ${currentlyActive ? "archived" : "published"}.`);
  await Promise.all([loadCategories(), loadProducts()]);
}

async function loadOverview() {
  const [ordersResult, productsResult] = await Promise.all([
    supabaseClient.from("orders").select("id,order_number,status,payment_status,total,created_at,customers(full_name,phone)").order("created_at", { ascending: false }).limit(8),
    supabaseClient.from("products").select("id,name,subtitle,image,price,stock,active").eq("active", true).lt("stock", 5).order("stock")
  ]);
  if (ordersResult.error) {
    console.error("Could not load dashboard orders.", ordersResult.error);
    notify(`Couldn't load dashboard orders: ${ordersResult.error.message}`, "error");
    return;
  }
  const summaryResult = await supabaseClient.rpc("admin_dashboard_summary");
  if (summaryResult.error) {
    console.error("Could not load dashboard totals.", summaryResult.error);
    notify(`Couldn't load dashboard totals: ${summaryResult.error.message}`, "error");
    return;
  }
  if (productsResult.error) {
    console.error("Could not load dashboard products.", productsResult.error);
    notify(`Couldn't load dashboard products: ${productsResult.error.message}`, "error");
    return;
  }
  orders = ordersResult.data;
  products = productsResult.data;
  const summary = summaryResult.data;
  document.querySelector("#metric-sales").textContent = money(summary.sales);
  document.querySelector("#metric-orders").textContent = summary.orders_count;
  document.querySelector("#metric-pending").textContent = summary.pending_count ? `${summary.pending_count} waiting for attention` : "All caught up";
  document.querySelector("#metric-payments").textContent = summary.payment_review_count;
  document.querySelector("#nav-order-count").textContent = summary.pending_count || "";
  document.querySelector("#metric-products").textContent = summary.products_count;
  document.querySelector("#metric-stock").textContent = `${summary.products_count} live in your catalog`;
  renderRecentOrders();
  renderLowStock();
}

function renderRecentOrders() {
  const recent = orders.slice(0, 8);
  document.querySelector("#recent-orders").innerHTML = recent.length
    ? `<table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>${recent.map((order) => `
      <tr><td><span class="table-primary">${html(order.order_number)}</span></td><td>${html(order.customers?.full_name || "Customer")}<div class="table-muted">${html(order.customers?.phone || "")}</div></td><td>${dateTime(order.created_at)}</td><td>${money(order.total)}</td><td><span class="status-pill ${statusColor(order.status)}">${html(statusLabel(order.status))}</span></td></tr>
    `).join("")}</tbody></table>`
    : emptyTable("No orders yet. Your first order will show up here.");
}

async function loadOrders() {
  let query = supabaseClient.from("orders")
    .select("id,order_number,status,payment_method,payment_status,bkash_transaction_id,subtotal,discount,delivery_fee,total,customer_note,created_at,customers(full_name,phone,address),order_items(product_name,quantity)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (activeOrderFilter !== "all") query = query.eq("status", activeOrderFilter);
  const { data, error, count } = await query.range(orderPage * pageSize, orderPage * pageSize + pageSize - 1);
  if (error) {
    console.error("Could not load orders.", error);
    notify(`Couldn't load orders: ${error.message}`, "error");
    return;
  }
  orderCount = count ?? data.length;
  if (orderPage * pageSize >= orderCount && orderPage > 0) {
    orderPage = Math.max(0, Math.ceil(orderCount / pageSize) - 1);
    return loadOrders();
  }
  orders = data;
  renderOrders();
  renderPagination("orders-pagination", orderPage, orderCount, "orders");
}

function renderOrders() {
  const visible = orders;
  const root = document.querySelector("#orders-table");
  if (!visible.length) {
    root.innerHTML = emptyTable("No orders match this filter.");
    return;
  }
  const statusOptions = ["payment_review", "pending", "processing", "shipped", "delivered", "cancelled"];
  const paymentOptions = ["submitted", "verified", "rejected", "cash_on_delivery"];
  root.innerHTML = `<table class="data-table"><thead><tr><th>Order / items</th><th>Customer</th><th>Payment</th><th>Total</th><th>Order status</th><th>Actions</th></tr></thead><tbody>${visible.map((order) => `
    <tr data-order-row="${html(order.id)}">
      <td><span class="table-primary">${html(order.order_number)}</span><div class="table-muted">${dateTime(order.created_at)}</div>${(order.order_items || []).map((item) => `<div class="table-muted">${html(item.product_name)} × ${item.quantity}</div>`).join("")}</td>
      <td>${html(order.customers?.full_name || "Customer")}<div class="table-muted">${html(order.customers?.phone || "")}</div><div class="table-muted">${html(order.customers?.address || "")}</div></td>
      <td><span class="status-pill ${statusColor(order.payment_status)}">${html(statusLabel(order.payment_status))}</span>${order.bkash_transaction_id ? `<div class="txn-id"><span>TxnID</span><strong>${html(order.bkash_transaction_id)}</strong></div>` : ""}${order.customer_note ? `<div class="table-muted">Note: ${html(order.customer_note)}</div>` : ""}</td>
      <td>${money(order.total)}<div class="table-muted">${order.payment_method === "bkash" ? "bKash" : "Cash on delivery"}</div></td>
      <td><select class="order-status-select" aria-label="Order status for ${html(order.order_number)}" ${order.status === "cancelled" ? "disabled" : ""}>${statusOptions.map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${html(statusLabel(status))}</option>`).join("")}</select><select class="payment-status-select" aria-label="Payment status for ${html(order.order_number)}" ${order.payment_method !== "bkash" ? "disabled" : ""}>${paymentOptions.filter((status) => status !== "cash_on_delivery" || order.payment_method === "cash_on_delivery").map((status) => `<option value="${status}" ${status === order.payment_status ? "selected" : ""}>${html(statusLabel(status))}</option>`).join("")}</select></td>
      <td><button class="row-action" data-save-order="${html(order.id)}" type="button" ${order.status === "cancelled" ? "disabled" : ""}>Save changes</button></td>
    </tr>
  `).join("")}</tbody></table>`;
}

async function saveOrder(orderId) {
  const row = document.querySelector(`[data-order-row="${CSS.escape(orderId)}"]`);
  const existing = orders.find((order) => order.id === orderId);
  if (!row || !existing) return;
  const status = row.querySelector(".order-status-select").value;
  const paymentStatus = row.querySelector(".payment-status-select").value;
  if (existing.payment_method === "bkash" && paymentStatus === "verified" && !existing.bkash_transaction_id) {
    notify("This order has no bKash TxnID to verify.", "error");
    return;
  }
  const { error } = await supabaseClient.from("orders").update({
    status: paymentStatus === "verified" && status === "payment_review" ? "pending" : status,
    payment_status: paymentStatus
  }).eq("id", orderId);
  if (error) {
    console.error("Could not update order status.", error);
    notify(error.message, "error");
    return;
  }
  notify("Order and payment status updated.");
  await Promise.all([loadOrders(), loadOverview()]);
}

async function loadCustomers() {
  const { data, error, count } = await supabaseClient.from("customers")
    .select("id,full_name,phone,address,created_at,orders(order_number,total,created_at)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(customerPage * pageSize, customerPage * pageSize + pageSize - 1);
  if (error) {
    console.error("Could not load customers.", error);
    notify(`Couldn't load customers: ${error.message}`, "error");
    return;
  }
  customerCount = count ?? data.length;
  document.querySelector("#customers-table").innerHTML = data.length
    ? `<table class="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Delivery address</th><th>Orders</th><th>Customer since</th></tr></thead><tbody>${data.map((customer) => `
      <tr><td class="table-primary">${html(customer.full_name)}</td><td><a href="tel:${html(customer.phone)}">${html(customer.phone)}</a></td><td>${html(customer.address)}</td><td>${customer.orders?.length || 0}</td><td>${dateTime(customer.created_at)}</td></tr>
    `).join("")}</tbody></table>`
    : emptyTable("Customers appear here after their first order.");
  renderPagination("customers-pagination", customerPage, customerCount, "customers");
}

async function loadPromotions() {
  const { data, error } = await supabaseClient.from("promotions")
    .select("id,code,description,discount_type,discount_value,min_subtotal,usage_limit,used_count,active,starts_at,ends_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Could not load promotions.", error);
    notify(`Couldn't load promotions: ${error.message}`, "error");
    return;
  }
  document.querySelector("#promotions-list").innerHTML = data.length
    ? `<table class="data-table"><thead><tr><th>Code</th><th>Discount</th><th>Minimum spend</th><th>Used</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${data.map((promotion) => `
      <tr><td><span class="table-primary">${html(promotion.code)}</span><div class="table-muted">${html(promotion.description)}</div></td><td>${promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : money(promotion.discount_value)}</td><td>${money(promotion.min_subtotal)}</td><td>${promotion.used_count}${promotion.usage_limit ? ` / ${promotion.usage_limit}` : " / ∞"}</td><td><span class="status-pill ${promotion.active ? "green" : ""}">${promotion.active ? "Live" : "Paused"}</span></td><td><button class="row-action" data-toggle-promotion="${html(promotion.id)}" data-active="${promotion.active}" type="button">${promotion.active ? "Pause" : "Activate"}</button></td></tr>
    `).join("")}</tbody></table>`
    : emptyTable("No discount codes yet. Create one above.");
}

async function createPromotion(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const value = Number(values.get("discount_value"));
  const type = String(values.get("discount_type"));
  const errorRoot = document.querySelector("#promotion-form-error");
  errorRoot.textContent = "";
  if (!Number.isInteger(value) || value < 1 || (type === "percentage" && value > 100)) {
    errorRoot.textContent = type === "percentage" ? "Percentage discounts must be between 1% and 100%." : "Enter a fixed discount amount greater than zero.";
    return;
  }
  const promotion = {
    code: String(values.get("code")).trim().toUpperCase(),
    description: String(values.get("description") || "").trim(),
    discount_type: type,
    discount_value: value,
    min_subtotal: Number(values.get("min_subtotal") || 0),
    usage_limit: values.get("usage_limit") ? Number(values.get("usage_limit")) : null
  };
  const { error } = await supabaseClient.from("promotions").insert(promotion);
  if (error) {
    console.error("Could not create promotion.", error);
    errorRoot.textContent = error.message;
    return;
  }
  form.reset();
  form.elements.min_subtotal.value = 0;
  notify(`${promotion.code} is ready for the storefront.`);
  await loadPromotions();
}

async function togglePromotion(promotionId, currentlyActive) {
  const { error } = await supabaseClient.from("promotions")
    .update({ active: !currentlyActive })
    .eq("id", promotionId);
  if (error) {
    console.error("Could not update promotion.", error);
    notify(error.message, "error");
    return;
  }
  notify(`Promotion ${currentlyActive ? "paused" : "activated"}.`);
  await loadPromotions();
}

function fillForm(form, values) {
  Object.entries(values).forEach(([name, value]) => {
    const element = form.elements.namedItem(name);
    if (element) element.value = value ?? "";
  });
}

async function loadStoreContent() {
  const { data, error } = await supabaseClient.from("site_settings")
    .select("value")
    .eq("key", "store")
    .maybeSingle();
  if (error) {
    console.error("Could not load website content.", error);
    notify(`Couldn't load website content: ${error.message}`, "error");
    return;
  }
  const store = { ...settingsDefaults, ...(data?.value || {}) };
  fillForm(document.querySelector("#content-form"), store);
  fillForm(document.querySelector("#settings-form"), store);
  renderFaqFields(store.faqs);
}

function renderFaqFields(faqs = []) {
  const root = document.querySelector("#faq-fields");
  root.innerHTML = faqs.map((faq, index) => `
    <div class="faq-item">
      <label>Question ${index + 1}<input data-faq-question value="${html(faq.question)}" maxlength="180" required /></label>
      <label>Answer<input data-faq-answer value="${html(faq.answer)}" maxlength="600" required /></label>
      <button type="button" data-remove-faq aria-label="Remove question ${index + 1}">×</button>
    </div>
  `).join("");
}

function collectFaqFields() {
  return [...document.querySelectorAll(".faq-item")].map((row) => ({
    question: row.querySelector("[data-faq-question]").value.trim(),
    answer: row.querySelector("[data-faq-answer]").value.trim()
  }));
}

async function saveStoreValues(values, errorId, successMessage) {
  const errorRoot = document.getElementById(errorId);
  errorRoot.textContent = "";
  const { error } = await supabaseClient.from("site_settings")
    .upsert({ key: "store", value: values }, { onConflict: "key" });
  if (error) {
    console.error("Could not save store settings.", error);
    errorRoot.textContent = error.message;
    return false;
  }
  notify(successMessage);
  return true;
}

async function saveContent(event) {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  const existing = await supabaseClient.from("site_settings")
    .select("value")
    .eq("key", "store")
    .maybeSingle();
  if (existing.error) {
    console.error("Could not load existing store content.", existing.error);
    document.querySelector("#content-form-error").textContent = existing.error.message;
    return;
  }
  const current = { ...settingsDefaults, ...(existing.data?.value || {}) };
  [...values.entries()].forEach(([key, value]) => { current[key] = String(value).trim(); });
  const imageKeys = ["hero_image", "story_image"];
  for (const key of imageKeys) {
    if (!safeImage(current[key])) {
      document.querySelector("#content-form-error").textContent = `${key === "hero_image" ? "Hero" : "Story"} photo must use a valid https:// or http:// URL.`;
      return;
    }
  }
  current.faqs = collectFaqFields();
  if (current.faqs.some((faq) => !faq.question || !faq.answer)) {
    document.querySelector("#content-form-error").textContent = "Each FAQ needs a question and an answer.";
    return;
  }
  if (await saveStoreValues(current, "content-form-error", "Website content saved.")) {
    renderFaqFields(current.faqs);
  }
}

async function saveStoreSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const values = { ...settingsDefaults };
  const existing = await supabaseClient.from("site_settings").select("value").eq("key", "store").maybeSingle();
  if (existing.error) {
    console.error("Could not load existing store settings.", existing.error);
    document.querySelector("#settings-form-error").textContent = existing.error.message;
    return;
  }
  Object.assign(values, existing.data?.value || {});
  values.contact_phone = String(form.get("contact_phone")).trim();
  values.contact_email = String(form.get("contact_email")).trim();
  values.facebook_url = String(form.get("facebook_url") || "").trim();
  values.bkash_number = String(form.get("bkash_number") || "").trim();
  values.whatsapp_number = String(form.get("whatsapp_number") || "").trim();
  values.delivery_fee = Number(form.get("delivery_fee"));
  values.free_shipping_threshold = Number(form.get("free_shipping_threshold"));
  if (![values.delivery_fee, values.free_shipping_threshold].every((number) => Number.isSafeInteger(number) && number >= 0)) {
    document.querySelector("#settings-form-error").textContent = "Delivery fee and free-delivery threshold must be whole numbers of zero or more.";
    return;
  }
  if (values.facebook_url) {
    try {
      const url = new URL(values.facebook_url);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!["https:", "http:"].includes(url.protocol) || !["facebook.com", "fb.com"].includes(host)) {
        throw new Error("Enter a valid public Facebook Page URL.");
      }
    } catch (error) {
      document.querySelector("#settings-form-error").textContent = error.message || "Enter a valid public Facebook Page URL.";
      return;
    }
  }
  const whatsappDigits = values.whatsapp_number.replace(/\D/g, "");
  if (values.whatsapp_number && (whatsappDigits.length < 8 || whatsappDigits.length > 15)) {
    document.querySelector("#settings-form-error").textContent = "Enter a valid WhatsApp number with country code, such as 8801XXXXXXXXX.";
    return;
  }
  values.whatsapp_number = whatsappDigits;
  if (await saveStoreValues(values, "settings-form-error", "Store settings saved.")) {
    await loadStoreContent();
  }
}

async function showView(viewName) {
  const view = document.querySelector(`#view-${CSS.escape(viewName)}`);
  if (!view) return;
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item === view));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
  document.querySelector("#current-section-label").textContent = viewName.replace("-", " ").toUpperCase();
  document.querySelector("#workspace-title").textContent = ({
    overview: "Good to see you.",
    products: "A little something for the next drop.",
    categories: "Find everything its place.",
    orders: "Good things are on their way.",
    customers: "The people behind the drop.",
    promotions: "Make someone's day.",
    content: "Make the first impression yours.",
    settings: "Get the details right."
  })[viewName];
  document.querySelector("#sidebar").classList.remove("open");
  if (demoPreviewActive) return;
  if (viewName === "overview") await loadOverview();
  if (viewName === "products") await Promise.all([loadProducts(), loadCategories()]);
  if (viewName === "categories") await Promise.all([loadCategories(), loadProducts()]);
  if (viewName === "orders") await loadOrders();
  if (viewName === "customers") await loadCustomers();
  if (viewName === "promotions") await loadPromotions();
  if (viewName === "content" || viewName === "settings") await loadStoreContent();
}

let resolveConfirmation;
function confirmAction(title, message) {
  document.querySelector("#confirm-title").textContent = title;
  document.querySelector("#confirm-message").textContent = message;
  document.querySelector("#confirm-modal").hidden = false;
  return new Promise((resolve) => { resolveConfirmation = resolve; });
}

function resolveConfirm(value) {
  document.querySelector("#confirm-modal").hidden = true;
  resolveConfirmation?.(value);
  resolveConfirmation = null;
}

function bindAdminEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });
  document.querySelector("#mobile-menu-button").addEventListener("click", () => {
    document.querySelector("#sidebar").classList.toggle("open");
  });
  document.querySelector("#add-product").addEventListener("click", () => {
    if (demoPreviewActive) openDemoProductEditor();
    else openProductEditor();
  });
  document.querySelectorAll("[data-close-product]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#product-editor").hidden = true;
      clearProductImagePreview();
    });
  });
  document.querySelector("#product-image-file").addEventListener("change", (event) => {
    const file = event.currentTarget.files[0];
    if (!file) {
      document.querySelector("#image-upload-status").textContent = "Upload directly from your device, or paste an image URL.";
      return;
    }
    clearProductImagePreview();
    productImagePreviewUrl = URL.createObjectURL(file);
    document.querySelector("#image-upload-status").textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    setProductImagePreview(productImagePreviewUrl, file.name);
  });
  document.querySelector("#product-form").elements.image.addEventListener("input", (event) => {
    const fileInput = document.querySelector("#product-image-file");
    if (fileInput.files.length) fileInput.value = "";
    clearProductImagePreview();
    document.querySelector("#image-upload-status").textContent = "Using the image URL below.";
    setProductImagePreview(safeImage(event.currentTarget.value), "Product image");
  });
  document.querySelector("#product-form").addEventListener("submit", saveProduct);
  document.querySelector("#products-table").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-product]");
    const toggle = event.target.closest("[data-toggle-product]");
    if (edit) openProductEditor(products.find((product) => product.id === edit.dataset.editProduct));
    if (toggle) toggleProduct(toggle.dataset.toggleProduct, toggle.dataset.active === "true");
  });
  document.querySelector("#category-form").addEventListener("submit", addCategory);
  document.querySelector("#categories-list").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-category]");
    if (toggle) toggleCategory(toggle.dataset.toggleCategory, toggle.dataset.active === "true");
  });
  document.querySelector("#order-filter").addEventListener("change", (event) => {
    activeOrderFilter = event.target.value;
    orderPage = 0;
    renderOrders();
    loadOrders();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-type]");
    if (!button || button.disabled) return;
    const step = Number(button.dataset.pageStep);
    if (button.dataset.pageType === "products") productPage += step;
    if (button.dataset.pageType === "orders") orderPage += step;
    if (button.dataset.pageType === "customers") customerPage += step;
    if (button.dataset.pageType === "products") loadProducts();
    if (button.dataset.pageType === "orders") loadOrders();
    if (button.dataset.pageType === "customers") loadCustomers();
  });
  document.querySelector("#orders-table").addEventListener("click", (event) => {
    const save = event.target.closest("[data-save-order]");
    if (save) saveOrder(save.dataset.saveOrder);
  });
  document.querySelector("#promotion-form").addEventListener("submit", createPromotion);
  document.querySelector("#promotions-list").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-promotion]");
    if (toggle) togglePromotion(toggle.dataset.togglePromotion, toggle.dataset.active === "true");
  });
  document.querySelector("#content-form").addEventListener("submit", saveContent);
  document.querySelector("#settings-form").addEventListener("submit", saveStoreSettings);
  document.querySelector("#add-faq").addEventListener("click", () => {
    const faqs = collectFaqFields();
    faqs.push({ question: "", answer: "" });
    renderFaqFields(faqs);
  });
  document.querySelector("#faq-fields").addEventListener("click", (event) => {
    if (!event.target.closest("[data-remove-faq]")) return;
    const faqs = collectFaqFields();
    const index = [...document.querySelectorAll(".faq-item")].indexOf(event.target.closest(".faq-item"));
    faqs.splice(index, 1);
    renderFaqFields(faqs);
  });
  document.querySelector("#confirm-cancel").addEventListener("click", () => resolveConfirm(false));
  document.querySelector("#confirm-accept").addEventListener("click", () => resolveConfirm(true));
  document.querySelector("#confirm-modal").addEventListener("click", (event) => {
    if (event.target.id === "confirm-modal") resolveConfirm(false);
  });
  document.querySelector("#sign-out").addEventListener("click", signOut);
    document.querySelector("#demo-preview").addEventListener("click", showDemoPreview);
  }

if (!supabaseClient) {
  const setupMessage = document.querySelector("#setup-message");
  setupMessage.hidden = false;
  setupMessage.textContent = "Add your Supabase project URL and publishable anon key to config.js, then run the SQL in supabase/schema.sql to enable secure admin sign-in.";
  loginForm.querySelector('button[type="submit"]').disabled = true;
} else {
  loginForm.addEventListener("submit", handleLogin);
  verifyExistingSession();
}
bindAdminEvents();
