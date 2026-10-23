let products = [...(window.RELAXBD_PRODUCTS || [])];

const defaultCategories = [
  { slug: "t-shirts", name: "T-shirts", image: "" },
  { slug: "shirts", name: "Shirts", image: "" },
  { slug: "bottoms", name: "Bottoms", image: "" },
  { slug: "accessories", name: "Accessories", image: "" }
];
const defaultStore = {
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
  contact_phone: "+8801305827996",
  contact_email: "hello@ornix.com.bd",
  brand_logo_url: "",
  brand_color: "#d4f33c",
  facebook_url: "",
  bkash_number: "",
  whatsapp_number: "",
  faqs: [
    { question: "How long does delivery take?", answer: "Orders usually arrive in 1–2 business days in Dhaka and 3–5 business days elsewhere in Bangladesh. Our team will share delivery updates with you." },
    { question: "Can I exchange an item?", answer: "Yes. We accept exchanges within 7 days of delivery for sizing issues or manufacturing defects. Items must be unworn and have their original tags." },
    { question: "What payment methods do you accept?", answer: "Pay with bKash, Nagad, or cash on delivery in eligible areas. Any advance delivery fee will be confirmed with you when placing your order." }
  ]
};
const supabaseConfig = window.RELAXBD_CONFIG;
const supabaseClient = supabaseConfig?.supabaseUrl && supabaseConfig?.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.supabaseUrl, supabaseConfig.supabaseAnonKey)
  : null;
const formatPrice = (price) => `৳${price.toLocaleString("en-BD")}`;
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const safeImageURL = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const distributeStock = (stock) => {
  const total = Math.max(0, Number(stock) || 0);
  const base = Math.floor(total / 3);
  const remainder = total % 3;
  return { M: base + (remainder > 0 ? 1 : 0), L: base + (remainder > 1 ? 1 : 0), XL: base };
};
const defaultProductDetails = (product) => {
  const detail = (window.RELAXBD_PRODUCTS || []).find((item) => item.id === product.id || (item.name === product.name && item.category === product.category));
  return {
    ...detail,
    ...product,
    code: product.code || detail?.code || String(product.id).slice(0, 8).toUpperCase(),
    images: Array.isArray(product.images) && product.images.length ? product.images : (detail?.images || [product.image]),
    sizeStock: product.size_stock && Object.keys(product.size_stock).length
      ? product.size_stock
      : (detail?.sizeStock || distributeStock(product.stock)),
    sizeChart: product.size_chart || detail?.sizeChart || { chest: { M: 40, L: 42, XL: 44 }, length: { M: 28, L: 29, XL: 30 } }
  };
};
const grid = document.querySelector("#product-grid");
const countLabel = document.querySelector(".product-count");
const emptyState = document.querySelector(".empty-state");
const searchInput = document.querySelector("#product-search");
const overlay = document.querySelector(".overlay");
const cartPanel = document.querySelector(".cart-panel");
const checkoutPanel = document.querySelector(".checkout-panel");
const searchPanel = document.querySelector(".search-panel");
const cart = new Map();
let categories = defaultCategories;
let store = { ...defaultStore };
let activeCategory = new URLSearchParams(window.location.search).get("category") || "all";
let activeQuery = "";
let sortOrder = "featured";
let appliedPromotion = null;
let toastTimer;

function persistCart() {
  try {
    localStorage.setItem("relaxbd-cart", JSON.stringify([...cart.values()]));
    localStorage.removeItem("ornix-cart");
  } catch (error) {
    console.warn("The shopping bag could not be saved on this device.", error);
  }
}

function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("relaxbd-cart") || localStorage.getItem("ornix-cart") || "[]");
    if (!Array.isArray(saved)) return;
    saved.forEach((item) => {
      if (item?.product?.id && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20) {
        const size = ["M", "L", "XL"].includes(item.size) ? item.size : "";
        const key = `${item.product.id}:${size}`;
        cart.set(key, { product: item.product, quantity: item.quantity, size });
      }
    });
  } catch (error) {
    console.warn("The saved shopping bag is invalid and was ignored.", error);
  }
}

function renderCategories() {
  const filterList = document.querySelector(".filter-list");
  const homeCategoryGrid = document.querySelector("#home-category-grid");
  const collectionsMenu = document.querySelector("#collections-menu");
  const categoryCounts = categories.map((category) => ({
    ...category,
    count: products.filter((product) => product.category === category.slug).length
  }));
  filterList.innerHTML = `
    <button class="filter-button ${activeCategory === "all" ? "selected" : ""}" type="button" data-category="all" aria-pressed="${activeCategory === "all"}">All pieces <span>${String(products.length).padStart(2, "0")}</span></button>
    ${categoryCounts.map((category) => `
      <button class="filter-button ${activeCategory === category.slug ? "selected" : ""}" type="button" data-category="${escapeHTML(category.slug)}" aria-pressed="${activeCategory === category.slug}">${escapeHTML(category.name)} <span>${category.count}</span></button>
    `).join("")}
  `;
  if (homeCategoryGrid) {
    homeCategoryGrid.innerHTML = categoryCounts.length
      ? categoryCounts.map((category, index) => {
        const image = safeImageURL(category.image) || safeImageURL(products.find((product) => product.category === category.slug)?.image);
        return `
          <a class="home-category-card" href="/category.html?slug=${encodeURIComponent(category.slug)}">
            <span class="home-category-image">${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" />` : `<span aria-hidden="true">✳</span>`}</span>
            <span class="home-category-number">${String(index + 1).padStart(2, "0")}</span>
            <span class="home-category-name">${escapeHTML(category.name)}</span>
            <span class="home-category-arrow" aria-hidden="true">↗</span>
          </a>`;
      }).join("")
      : `<p class="category-empty">কোনো ক্যাটাগরি এখনো যোগ করা হয়নি।</p>`;
  }
  if (collectionsMenu) {
    collectionsMenu.innerHTML = `
      <a href="/category.html?view=all">ALL CATEGORIES <span aria-hidden="true">↗</span></a>
      ${categoryCounts.map((category) => `<a href="/category.html?slug=${encodeURIComponent(category.slug)}">${escapeHTML(category.name)} <span>${category.count}</span></a>`).join("")}
    `;
  }
}

function selectCategory(category, { updateHistory = true, scroll = true } = {}) {
  if (category !== "all" && !categories.some((item) => item.slug === category)) return;
  activeCategory = category;
  renderCategories();
  renderProducts();

  const url = new URL(window.location.href);
  if (category === "all") url.searchParams.delete("category");
  else url.searchParams.set("category", category);
  if (url.searchParams.has("bag")) url.searchParams.delete("bag");
  url.hash = "new-drops";
  if (updateHistory) window.history.pushState({ category }, "", url);
  else window.history.replaceState({ category }, "", url);
  if (scroll) document.querySelector("#new-drops").scrollIntoView({ behavior: "smooth" });
}

function applyStoreContent(settings = {}) {
  store = { ...defaultStore, ...settings };
  const logoURL = safeImageURL(store.brand_logo_url);
  [document.querySelector("#header-brand-logo"), document.querySelector("#footer-brand-logo")].forEach((logo) => {
    if (!logo) return;
    const wordmark = logo.closest(".wordmark");
    const wordmarkText = wordmark.querySelector(".wordmark-text");
    logo.onerror = () => {
      logo.hidden = true;
      wordmarkText.hidden = false;
    };
    logo.hidden = !logoURL;
    wordmarkText.hidden = Boolean(logoURL);
    if (logoURL) logo.src = logoURL;
    else logo.removeAttribute("src");
  });
  if (/^#[\da-f]{6}$/i.test(store.brand_color)) {
    document.documentElement.style.setProperty("--acid", store.brand_color);
    const channels = store.brand_color.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const luminance = channels.map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
    document.documentElement.style.setProperty("--accent-ink", luminance > .179 ? "#171916" : "#fffefb");
  }
  [
    ["announcement-text", "announcement"],
    ["announcement-detail-text", "announcement_detail"],
    ["hero-eyebrow-text", "hero_eyebrow"],
    ["hero-description", "hero_description"],
    ["collection-description", "collection_description"],
    ["story-kicker", "story_kicker"],
    ["story-description", "story_description"]
  ].forEach(([elementId, key]) => {
    const element = document.getElementById(elementId);
    if (element) element.textContent = store[key] ?? "";
  });
  [
    ["hero-title .hero-line-1", "hero_line_1"],
    ["hero-title .hero-line-2", "hero_line_2"],
    ["hero-title .hero-line-3", "hero_line_3"],
    ["collection-title .collection-line-1", "collection_line_1"],
    ["collection-title .collection-line-2", "collection_line_2"],
    [".story-copy h2 .story-line-1", "story_line_1"],
    [".story-copy h2 .story-line-2", "story_line_2"],
    [".story-copy h2 .story-line-3", "story_line_3"],
    [".story-copy h2 .story-line-4", "story_line_4"]
  ].forEach(([selector, key]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = store[key] ?? "";
  });
  const phone = String(store.contact_phone || "").replace(/[^\d+]/g, "");
  const phoneLink = document.querySelector("#contact-phone-link");
  phoneLink.href = `tel:${phone}`;
  phoneLink.textContent = store.contact_phone;
  const footerPhone = document.querySelector("#footer-phone");
  footerPhone.href = `tel:${phone}`;
  footerPhone.textContent = store.contact_phone;
  const emailLink = document.querySelector("#footer-email");
  emailLink.href = `mailto:${store.contact_email}`;
  emailLink.textContent = store.contact_email;
  const facebookURL = safeFacebookURL(store.facebook_url);
  const facebookLink = document.querySelector("#facebook-contact");
  facebookLink.hidden = !facebookURL;
  if (facebookURL) facebookLink.href = facebookURL;
  const whatsappURL = safeWhatsAppURL(store.whatsapp_number);
  [document.querySelector("#whatsapp-contact"), document.querySelector("#whatsapp-float")].forEach((link) => {
    link.hidden = !whatsappURL;
    if (whatsappURL) link.href = whatsappURL;
  });
  const heroImage = document.querySelector("#hero-image");
  heroImage.src = safeImageURL(store.hero_image);
  heroImage.alt = store.hero_image_alt || "";
  const storyImage = document.querySelector("#story-image");
  storyImage.src = safeImageURL(store.story_image);
  storyImage.alt = store.story_image_alt || "";
  document.querySelector("#checkout-bkash-number").textContent = store.bkash_number || "Add a bKash number in store settings";
  document.querySelector("#faq-list").innerHTML = (Array.isArray(store.faqs) ? store.faqs : defaultStore.faqs)
    .map((faq, index) => `
      <details>
        <summary><span>${String(index + 1).padStart(2, "0")}</span> ${escapeHTML(faq.question)}<span class="faq-plus" aria-hidden="true">+</span></summary>
        <p>${escapeHTML(faq.answer)}</p>
      </details>
    `).join("");
}

function safeFacebookURL(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return ["https:", "http:"].includes(url.protocol) && ["facebook.com", "fb.com"].includes(hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function safeWhatsAppURL(value) {
  const number = String(value || "").replace(/\D/g, "");
  return number.length >= 8 && number.length <= 15
    ? `https://wa.me/${number}?text=${encodeURIComponent("Hi RELAXBD! I have a question about your products.")}`
    : "";
}

async function loadStoreData() {
  if (!supabaseClient) {
    if (activeCategory !== "all" && !categories.some((category) => category.slug === activeCategory)) {
      activeCategory = "all";
      renderCategories();
      renderProducts();
    }
    return;
  }
  const [productResult, categoryResult, settingsResult] = await Promise.all([
    supabaseClient.from("products").select("id,name,subtitle,category,price,compare_at_price,badge,image,images,code,size_stock,size_chart,alt,stock,featured,created_at").eq("active", true).order("featured", { ascending: false }).order("created_at", { ascending: false }),
    supabaseClient.from("categories").select("slug,name,image").eq("active", true).order("name"),
    supabaseClient.from("site_settings").select("value").eq("key", "store").maybeSingle()
  ]);
  if (productResult.error) {
    console.error("Could not load the live catalog.", productResult.error);
    showToast("Live catalog unavailable. Showing preview products.");
  } else {
    products = productResult.data.map((product) => ({
      ...defaultProductDetails({ ...product, oldPrice: product.compare_at_price, image: safeImageURL(product.image) }),
      images: (Array.isArray(product.images) && product.images.length ? product.images : [product.image]).map(safeImageURL).filter(Boolean),
      sizeStock: product.size_stock && Object.keys(product.size_stock).length ? product.size_stock : distributeStock(product.stock),
      sizeChart: product.size_chart || (window.RELAXBD_PRODUCTS || []).find((item) => item.name === product.name)?.sizeChart || { chest: { M: 40, L: 42, XL: 44 }, length: { M: 28, L: 29, XL: 30 } }
    }));
    [...cart.entries()].forEach(([key, item]) => {
      const latest = products.find((product) => product.id === item.product.id);
      if (!latest) {
        cart.delete(key);
      } else {
        const size = item.size || "";
        const available = size
          ? Number(latest.sizeStock?.[size]) || 0
          : (Number.isInteger(latest.stock) ? latest.stock : 20);
        const nextKey = `${latest.id}:${size}`;
        cart.delete(key);
        if (available > 0) {
          cart.set(nextKey, { ...item, product: latest, quantity: Math.min(item.quantity, available, 20) });
        }
      }
    });
  }
  if (categoryResult.error) {
    console.error("Could not load the live categories.", categoryResult.error);
  } else {
    categories = categoryResult.data;
    if (activeCategory !== "all" && !categories.some((category) => category.slug === activeCategory)) {
      activeCategory = "all";
      selectCategory("all", { updateHistory: false, scroll: false });
    }
  }
  if (settingsResult.error) {
    console.error("Could not load the live store content.", settingsResult.error);
  } else if (settingsResult.data?.value) {
    applyStoreContent(settingsResult.data.value);
  }
  renderCategories();
  renderProducts();
  renderCart();
}

function visibleProducts() {
  const query = activeQuery.trim().toLowerCase();
  const matches = products.filter((product) => {
    const categoryMatches = activeCategory === "all" || product.category === activeCategory;
    const searchMatches = !query || `${product.name} ${product.subtitle} ${product.category}`.toLowerCase().includes(query);
    return categoryMatches && searchMatches;
  });

  if (sortOrder === "newest") return matches.reverse();
  if (sortOrder === "price-low") return matches.sort((a, b) => a.price - b.price);
  if (sortOrder === "price-high") return matches.sort((a, b) => b.price - a.price);
  return matches;
}

function renderProducts() {
  const visible = visibleProducts();
  countLabel.textContent = `${String(visible.length).padStart(2, "0")} ${visible.length === 1 ? "piece" : "pieces"}`;
  emptyState.hidden = visible.length !== 0;
  grid.innerHTML = visible.map((product) => `
    <article class="product-card">
      <a class="product-card-link" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHTML(product.name)}"></a>
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHTML(safeImageURL(product.image))}" alt="${escapeHTML(product.alt)}" loading="lazy" />
        <span class="product-badge ${product.oldPrice ? "sale" : ""}">${escapeHTML(product.badge)}</span>
        <button class="wishlist-button" type="button" aria-label="Add ${escapeHTML(product.name)} to wishlist" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.3-8.8 10-8.8 10s-8.8-4.7-8.8-10A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.7Z" /></svg>
        </button>
        <button class="quick-add" type="button" data-add="${escapeHTML(product.id)}" ${product.stock === 0 ? "disabled" : ""}><span>${product.stock === 0 ? "Sold out" : "Quick add to bag"}</span><span>＋</span></button>
      </div>
      <div class="product-info">
        <p class="product-name">${escapeHTML(product.name)}</p>
        <p class="product-price">${formatPrice(product.price)}${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ""}</p>
        <p class="product-subtitle">${escapeHTML(product.subtitle)}</p>
        <a class="product-buy-now" href="product.html?id=${encodeURIComponent(product.id)}">BUY NOW <span aria-hidden="true">↗</span></a>
      </div>
    </article>
  `).join("");
}

function cartQuantity() {
  return [...cart.values()].reduce((total, item) => total + item.quantity, 0);
}

function renderCart() {
  const items = [...cart.entries()];
  const itemCount = cartQuantity();
  document.querySelector(".cart-count").textContent = itemCount;
  document.querySelector(".panel-count").textContent = `(${itemCount})`;
  document.querySelector(".cart-empty").hidden = items.length > 0;
  document.querySelector(".cart-footer").hidden = items.length === 0;
  document.querySelector(".cart-items").innerHTML = items.map(([key, { product, quantity, size }]) => `
    <article class="cart-item">
      <img src="${escapeHTML(safeImageURL(product.image))}" alt="" />
      <div>
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.subtitle)}${size ? ` · Size ${escapeHTML(size)}` : ""}</p>
        <div class="quantity-control" aria-label="Quantity for ${escapeHTML(product.name)}">
          <button type="button" data-quantity="${escapeHTML(key)}" data-change="-1" aria-label="Remove one">−</button>
          <span>${quantity}</span>
          <button type="button" data-quantity="${escapeHTML(key)}" data-change="1" aria-label="Add one">+</button>
        </div>
      </div>
      <span class="cart-item-price">${formatPrice(product.price * quantity)}</span>
    </article>
  `).join("");
  const subtotal = items.reduce((sum, [, item]) => sum + item.product.price * item.quantity, 0);
  document.querySelector(".cart-subtotal").textContent = formatPrice(subtotal);
  persistCart();
  renderCheckoutTotals();
}

function cartSubtotal() {
  return [...cart.values()].reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}

function deliveryFeeFor(subtotal) {
  const freeShippingThreshold = Number(store.free_shipping_threshold) || 0;
  return freeShippingThreshold > 0 && subtotal >= freeShippingThreshold
    ? 0
    : Math.max(0, Number(store.delivery_fee) || 0);
}

function renderCheckoutTotals() {
  const subtotal = cartSubtotal();
  const discount = Math.min(subtotal, Number(appliedPromotion?.discount) || 0);
  const delivery = deliveryFeeFor(subtotal);
  document.querySelector("#checkout-subtotal").textContent = formatPrice(subtotal);
  document.querySelector("#checkout-discount").textContent = `−${formatPrice(discount)}`;
  document.querySelector("#checkout-delivery").textContent = formatPrice(delivery);
  document.querySelector("#checkout-total").textContent = formatPrice(subtotal - discount + delivery);
  document.querySelector("#checkout-items").innerHTML = [...cart.values()].map(({ product, quantity, size }) => `
    <div class="checkout-item"><span>${escapeHTML(product.name)}${size ? ` · ${escapeHTML(size)}` : ""} × ${quantity}</span><strong>${formatPrice(product.price * quantity)}</strong></div>
  `).join("");
}

async function applyPromoCode() {
  const codeInput = document.querySelector("#promo-code");
  const feedback = document.querySelector("#promo-feedback");
  const code = codeInput.value.trim().toUpperCase();
  if (!supabaseClient) {
    feedback.textContent = "Discount codes are available after the store database is connected.";
    return;
  }
  if (!code) {
    feedback.textContent = "Enter a discount code first.";
    return;
  }
  const button = document.querySelector("#apply-promo");
  button.disabled = true;
  feedback.textContent = "Checking code…";
  try {
    const { data, error } = await supabaseClient.rpc("validate_promotion", {
      p_code: code,
      p_subtotal: cartSubtotal()
    });
    if (error) {
      appliedPromotion = null;
      feedback.textContent = error.message;
    } else {
      appliedPromotion = data;
      feedback.textContent = `${data.code} applied — ${formatPrice(data.discount)} off`;
    }
  } catch (error) {
    console.error("Could not validate the discount code.", error);
    appliedPromotion = null;
    feedback.textContent = "Could not verify the discount code. Please try again.";
  } finally {
    button.disabled = false;
  }
  renderCheckoutTotals();
}

async function placeOrder(event) {
  event.preventDefault();
  const errorMessage = document.querySelector("#checkout-error");
  const submitButton = document.querySelector(".checkout-submit");
  errorMessage.textContent = "";
  if (!supabaseClient) {
    errorMessage.textContent = "Live checkout is not set up yet. Please contact the store to place your order.";
    return;
  }
  if (cart.size === 0) {
    errorMessage.textContent = "Your bag is empty.";
    return;
  }
  const formData = new FormData(event.currentTarget);
  const paymentMethod = String(formData.get("paymentMethod"));
  if (paymentMethod === "bkash" && !store.bkash_number) {
    errorMessage.textContent = "The store hasn't added a bKash payment number yet. Please choose cash on delivery or contact the store.";
    return;
  }
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Sending…";
  try {
    const { data, error } = await supabaseClient.rpc("place_order", {
      p_customer_name: String(formData.get("customerName")),
      p_phone: String(formData.get("phone")),
      p_address: String(formData.get("address")),
      p_payment_method: paymentMethod,
      p_transaction_id: String(formData.get("transactionId") || ""),
      p_items: [...cart.values()].map(({ product, quantity, size }) => ({
        product_id: product.id,
        size: size || null,
        quantity
      })),
      p_promo_code: appliedPromotion?.code || null,
      p_customer_note: String(formData.get("customerNote") || "")
    });
    if (error) {
      errorMessage.textContent = error.message;
      return;
    }
    const orderNumber = data?.order_number;
    if (!orderNumber) {
      errorMessage.textContent = "The order confirmation was incomplete. Please contact the store before retrying.";
      console.error("The order RPC returned no order number.", data);
      return;
    }
    cart.clear();
    appliedPromotion = null;
    persistCart();
    renderCart();
    event.currentTarget.reset();
    document.querySelector("#promo-feedback").textContent = "";
    closePanels();
    showToast(`Order ${orderNumber} placed. We'll verify your payment shortly.`);
    loadStoreData();
  } catch (error) {
    console.error("Could not submit the order.", error);
    errorMessage.textContent = "Could not connect to the store. Your order was not submitted; please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "↗";
  }
}

function updatePaymentMethod() {
  const isBkash = document.querySelector("#checkout-payment").value === "bkash";
  document.querySelector("#payment-instructions").hidden = !isBkash;
  document.querySelector("#transaction-field").hidden = !isBkash;
  document.querySelector("#transaction-id").required = isBkash;
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2400);
}

function closePanels() {
  overlay.hidden = true;
  cartPanel.classList.remove("open");
  checkoutPanel.classList.remove("open");
  searchPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden", "true");
  checkoutPanel.setAttribute("aria-hidden", "true");
  searchPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
}

function openPanel(panel) {
  closePanels();
  overlay.hidden = false;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  if (panel === searchPanel) window.setTimeout(() => searchInput.focus(), 250);
}

function addToCart(productId, size = "") {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const key = `${productId}:${size}`;
  const existing = cart.get(key);
  const availableStock = size ? Number(product.sizeStock?.[size]) || 0 : (Number.isInteger(product.stock) ? product.stock : 20);
  if (availableStock < 1) {
    showToast(`${product.name} is currently sold out`);
    return;
  }
  if ((existing?.quantity || 0) >= Math.min(availableStock, 20)) {
    showToast(`Only ${availableStock} available for ${product.name}`);
    return;
  }
  cart.set(key, { product, quantity: existing ? existing.quantity + 1 : 1, size });
  renderCart();
  showToast(`${product.name} added to your bag`);
}

document.querySelector(".filter-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectCategory(button.dataset.category);
});

window.addEventListener("popstate", () => {
  const category = new URLSearchParams(window.location.search).get("category") || "all";
  selectCategory(category, { updateHistory: false, scroll: false });
});

document.querySelector("#sort-select").addEventListener("change", (event) => {
  sortOrder = event.target.value;
  renderProducts();
});

grid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    addToCart(addButton.dataset.add);
    return;
  }
  const wishlistButton = event.target.closest(".wishlist-button");
  if (wishlistButton) {
    const saved = wishlistButton.getAttribute("aria-pressed") !== "true";
    wishlistButton.setAttribute("aria-pressed", String(saved));
    showToast(saved ? "Saved to your wishlist" : "Removed from your wishlist");
  }
});

document.querySelector(".cart-items").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quantity]");
  if (!button) return;
  const key = button.dataset.quantity;
  const item = cart.get(key);
  if (!item) return;
  const quantity = item.quantity + Number(button.dataset.change);
  if (quantity <= 0) cart.delete(key);
  else {
    const stockLimit = item.size ? Number(item.product.sizeStock?.[item.size]) || 0 : (Number.isInteger(item.product.stock) ? Math.min(20, item.product.stock) : 20);
    if (quantity > stockLimit) {
      showToast(`Only ${stockLimit} available for ${item.product.name}`);
      return;
    }
    cart.set(key, { ...item, quantity });
  }
  renderCart();
});

document.querySelector(".cart-button").addEventListener("click", () => openPanel(cartPanel));
document.querySelector(".search-open").addEventListener("click", () => openPanel(searchPanel));
document.querySelector(".panel-close").addEventListener("click", closePanels);
document.querySelector(".checkout-close").addEventListener("click", closePanels);
document.querySelector(".search-close").addEventListener("click", closePanels);
overlay.addEventListener("click", closePanels);
document.querySelector(".continue-shopping").addEventListener("click", closePanels);
document.querySelector(".checkout-button").addEventListener("click", () => {
  if (cart.size === 0) {
    showToast("Your bag is empty.");
    return;
  }
  window.location.href = "checkout.html";
});
document.querySelector("#checkout-form").addEventListener("submit", (event) => {
  event.preventDefault();
  window.location.href = "checkout.html";
});
document.querySelector("#checkout-payment").addEventListener("change", updatePaymentMethod);
document.querySelector("#apply-promo").addEventListener("click", applyPromoCode);
document.querySelector("#promo-code").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyPromoCode();
  }
});
document.querySelector("#promo-code").addEventListener("input", () => {
  if (!appliedPromotion) return;
  appliedPromotion = null;
  document.querySelector("#promo-feedback").textContent = "";
  renderCheckoutTotals();
});

searchInput.addEventListener("input", () => {
  activeQuery = searchInput.value;
  renderProducts();
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    closePanels();
    document.querySelector("#new-drops").scrollIntoView({ behavior: "smooth" });
  }
});

document.querySelector(".menu-toggle").addEventListener("click", (event) => {
  const menu = document.querySelector(".main-nav");
  const expanded = event.currentTarget.getAttribute("aria-expanded") !== "true";
  event.currentTarget.setAttribute("aria-expanded", String(expanded));
  menu.classList.toggle("open", expanded);
});
document.querySelectorAll(".main-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelector(".main-nav").classList.remove("open");
    document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  });
});
document.querySelector(".newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector(".newsletter-feedback").textContent = "You're on the list. See you at the next drop.";
  event.currentTarget.reset();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePanels();
});
const cartMode = new URLSearchParams(window.location.search);
if (cartMode.get("checkout") === "1") {
  window.location.replace("checkout.html");
} else if (cartMode.get("bag") === "open") {
  window.addEventListener("load", () => {
    if (!cart.size) return;
    openPanel(cartPanel);
  }, { once: true });
}

renderProducts();
renderCategories();
applyStoreContent();
restoreCart();
renderCart();
updatePaymentMethod();
loadStoreData();
