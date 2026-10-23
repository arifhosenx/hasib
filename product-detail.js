const detailConfig = window.RELAXBD_CONFIG;
const detailSupabase = detailConfig?.supabaseUrl && detailConfig?.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(detailConfig.supabaseUrl, detailConfig.supabaseAnonKey)
  : null;
const detailQuery = new URLSearchParams(window.location.search);
const productId = detailQuery.get("id");
const productRoot = document.querySelector("#product-detail");
const detailStatus = document.querySelector("#detail-status");
const detailProducts = window.RELAXBD_PRODUCTS || [];
const sizes = ["M", "L", "XL"];
let currentProduct;
let currentImageIndex = 0;
let selectedSize = "";
let quantity = 1;
let whatsappNumber = "";

const formatDetailPrice = (amount) => `৳${Number(amount || 0).toLocaleString("en-BD")}`;
const escapeDetailHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const safeDetailImage = (value) => {
  try {
    const url = new URL(value, window.location.href);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const fallbackSizeStock = (stock) => {
  const base = Math.floor(Math.max(0, Number(stock) || 0) / 3);
  const remainder = Math.max(0, Number(stock) || 0) % 3;
  return { M: base + (remainder > 0 ? 1 : 0), L: base + (remainder > 1 ? 1 : 0), XL: base };
};
const categoryName = (category) => ({
  "t-shirts": "T-shirts",
  shirts: "Shirts",
  bottoms: "Bottoms",
  accessories: "Accessories"
}[category] || String(category || "RELAXBD ORIGINALS").replace(/-/g, " "));

function showDetailStatus(message, isError = false) {
  detailStatus.hidden = false;
  detailStatus.classList.toggle("error", isError);
  detailStatus.textContent = message;
}

function getTotalStock(product = currentProduct) {
  return sizes.reduce((total, size) => total + Math.max(0, Number(product?.sizeStock?.[size]) || 0), 0);
}

function setImage(index) {
  const images = currentProduct.images;
  currentImageIndex = (index + images.length) % images.length;
  const image = document.querySelector("#main-image");
  image.src = images[currentImageIndex];
  image.alt = currentProduct.alt || currentProduct.name;
  document.querySelector("#gallery-dots").innerHTML = images.map((_, dotIndex) => `
    <button class="gallery-dot ${dotIndex === currentImageIndex ? "active" : ""}" data-image-index="${dotIndex}" type="button" aria-label="Show product image ${dotIndex + 1}" aria-pressed="${dotIndex === currentImageIndex}"></button>
  `).join("");
  document.querySelector("#thumbnail-list").innerHTML = images.map((src, thumbIndex) => `
    <button class="thumbnail ${thumbIndex === currentImageIndex ? "active" : ""}" data-image-index="${thumbIndex}" type="button" aria-label="Show product image ${thumbIndex + 1}" aria-pressed="${thumbIndex === currentImageIndex}">
      <img src="${escapeDetailHTML(src)}" alt="" loading="lazy" />
    </button>
  `).join("");
  document.querySelector("#previous-image").disabled = images.length < 2;
  document.querySelector("#next-image").disabled = images.length < 2;
}

function renderSizeOptions() {
  const totalStock = getTotalStock();
  document.querySelector("#total-stock").textContent = `${totalStock} in stock`;
  document.querySelector("#size-options").innerHTML = sizes.map((size) => {
    const stock = Math.max(0, Number(currentProduct.sizeStock?.[size]) || 0);
    return `<button class="size-option ${selectedSize === size ? "selected" : ""}" type="button" data-size="${size}" aria-pressed="${selectedSize === size}" ${stock < 1 ? "disabled" : ""}><strong>${size}</strong><small>${stock} left</small></button>`;
  }).join("");
  const chart = currentProduct.sizeChart || {};
  sizes.forEach((size) => {
    document.querySelector(`#chart-chest-${size}`).textContent = chart.chest?.[size] || "—";
    document.querySelector(`#chart-length-${size}`).textContent = chart.length?.[size] || "—";
  });
  if (selectedSize && !Number(currentProduct.sizeStock?.[selectedSize])) selectedSize = "";
  const available = selectedSize ? Number(currentProduct.sizeStock[selectedSize]) || 0 : 0;
  if (available) quantity = Math.min(quantity, available);
  else quantity = 1;
  document.querySelector("#available-stock").textContent = selectedSize ? `${available} available in stock` : "Choose a size to see availability";
  document.querySelector("#quantity-value").textContent = quantity;
  document.querySelector("#quantity-minus").disabled = !selectedSize || quantity <= 1;
  document.querySelector("#quantity-plus").disabled = !selectedSize || quantity >= available;
  document.querySelector("#buy-now-total").textContent = formatDetailPrice(currentProduct.price * quantity);
  document.querySelector("#buy-now").disabled = totalStock < 1;
  document.querySelector("#add-to-cart").disabled = totalStock < 1;
}

function showProduct(product) {
  currentProduct = {
    ...product,
    image: safeDetailImage(product.image),
    images: (Array.isArray(product.images) && product.images.length ? product.images : [product.image])
      .map(safeDetailImage).filter(Boolean),
    sizeStock: product.sizeStock && Object.keys(product.sizeStock).length
      ? product.sizeStock
      : fallbackSizeStock(product.stock),
    sizeChart: product.sizeChart || product.size_chart || { chest: { M: 40, L: 42, XL: 44 }, length: { M: 28, L: 29, XL: 30 } }
  };
  if (!currentProduct.images.length) currentProduct.images = [currentProduct.image];
  currentProduct.stock = getTotalStock();
  document.title = `${currentProduct.name} — RELAXBD`;
  document.querySelector('meta[name="description"]').content = `${currentProduct.name} — ${currentProduct.subtitle || categoryName(currentProduct.category)} from RELAXBD.`;
  document.querySelector("#breadcrumb-product").textContent = currentProduct.name;
  document.querySelector("#product-code").textContent = currentProduct.code || String(currentProduct.id).slice(0, 10).toUpperCase();
  document.querySelector("#product-category").textContent = categoryName(currentProduct.category);
  document.querySelector("#product-subtitle").textContent = currentProduct.subtitle || "";
  document.querySelector("#product-title").textContent = currentProduct.name;
  document.querySelector("#product-price").textContent = formatDetailPrice(currentProduct.price);
  document.querySelector(".size-guide-heading").hidden = currentProduct.category === "accessories";
  document.querySelector(".size-chart").hidden = currentProduct.category === "accessories";
  productRoot.hidden = false;
  detailStatus.hidden = true;
  setImage(0);
  renderSizeOptions();
}

function renderBrand(store = {}) {
  if (/^#[\da-f]{6}$/i.test(store.brand_color || "")) {
    document.documentElement.style.setProperty("--detail-gold", store.brand_color);
  }
  const logoURL = safeDetailImage(store.brand_logo_url);
  const logo = document.querySelector("#brand-logo");
  const wordmark = document.querySelector("#brand-wordmark");
  if (logoURL) {
    logo.src = logoURL;
    logo.hidden = false;
    wordmark.hidden = true;
    logo.onerror = () => {
      logo.hidden = true;
      wordmark.hidden = false;
    };
  }
  whatsappNumber = String(store.whatsapp_number || "").replace(/\D/g, "");
}

function validatePurchase() {
  const feedback = document.querySelector("#action-feedback");
  const sizeFeedback = document.querySelector("#size-feedback");
  if (!selectedSize) {
    sizeFeedback.textContent = "Select a size first.";
    feedback.textContent = "Please select a size before continuing.";
    return false;
  }
  const available = Number(currentProduct.sizeStock[selectedSize]) || 0;
  if (!available || quantity > available) {
    sizeFeedback.textContent = "That size is out of stock.";
    feedback.textContent = "Choose a size currently in stock.";
    return false;
  }
  sizeFeedback.textContent = "";
  feedback.textContent = "";
  return true;
}

function addVariantToBag() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("relaxbd-cart") || "[]");
  } catch (error) {
    console.error("Could not read the saved shopping bag.", error);
    document.querySelector("#action-feedback").textContent = "Your saved bag could not be read. Please clear the browser's saved RELAXBD cart and try again.";
    return false;
  }
  if (!Array.isArray(saved)) {
    document.querySelector("#action-feedback").textContent = "Your saved bag has an invalid format. Please clear the browser's saved RELAXBD cart and try again.";
    return false;
  }
  const key = `${currentProduct.id}:${selectedSize}`;
  const match = saved.find((item) => item.key === key || (item.product?.id === currentProduct.id && item.size === selectedSize));
  if (match) {
    if (match.quantity + quantity > Number(currentProduct.sizeStock[selectedSize])) {
      document.querySelector("#action-feedback").textContent = `Only ${currentProduct.sizeStock[selectedSize]} of size ${selectedSize} are available.`;
      return false;
    }
    match.quantity += quantity;
    match.key = key;
  } else {
    saved.push({ key, product: currentProduct, size: selectedSize, quantity });
  }
  try {
    localStorage.setItem("relaxbd-cart", JSON.stringify(saved));
  } catch (error) {
    console.error("Could not save the shopping bag.", error);
    document.querySelector("#action-feedback").textContent = "Could not save your bag in this browser. Check available storage and try again.";
    return false;
  }
  return true;
}

async function saveCurrentImage() {
  const button = document.querySelector("#save-image");
  const feedback = document.querySelector("#action-feedback");
  button.disabled = true;
  try {
    const response = await fetch(currentProduct.images[currentImageIndex], { mode: "cors" });
    if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectURL;
    anchor.download = `${String(currentProduct.code || currentProduct.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${currentImageIndex + 1}.jpg`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    feedback.textContent = "Image saved.";
  } catch (error) {
    console.error("Could not save the product image.", error);
    feedback.textContent = "Could not download this image. Try opening the image in a new tab.";
  } finally {
    button.disabled = false;
  }
}

async function loadProduct() {
  if (!productId) {
    showDetailStatus("No product was selected. Return to the drop and choose a product.", true);
    return;
  }
  let product = detailProducts.find((item) => String(item.id) === productId);
  if (detailSupabase) {
    const settingsPromise = detailSupabase.from("site_settings").select("value").eq("key", "store").maybeSingle();
    const hasDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId);
    const productPromise = hasDatabaseId
      ? detailSupabase.from("products").select("id,name,subtitle,category,price,compare_at_price,badge,image,images,code,size_stock,size_chart,alt,stock").eq("id", productId).eq("active", true).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [productResult, settingsResult] = await Promise.all([productPromise, settingsPromise]);
    if (settingsResult.error) console.error("Could not load store branding and WhatsApp settings.", settingsResult.error);
    renderBrand(settingsResult.data?.value || {});
    if (hasDatabaseId && productResult.error) {
      console.error("Could not load product details.", productResult.error);
      showDetailStatus("Product details could not be loaded. Please try again or return to the shop.", true);
      return;
    }
    if (hasDatabaseId) {
      if (productResult.data) {
        const productDetails = detailProducts.find((item) => item.name === productResult.data.name && item.category === productResult.data.category);
        product = {
          ...productDetails,
          ...productResult.data,
          oldPrice: productResult.data.compare_at_price,
          images: productResult.data.images?.length ? productResult.data.images : productDetails?.images,
          sizeStock: productResult.data.size_stock,
          sizeChart: productResult.data.size_chart || productDetails?.sizeChart
        };
      } else {
        product = null;
      }
    }
  }
  if (!product) {
    showDetailStatus("This product is no longer available. Browse the latest drop to find something else.", true);
    return;
  }
  if (!detailSupabase) renderBrand();
  showProduct(product);
}

document.querySelector("#previous-image").addEventListener("click", () => setImage(currentImageIndex - 1));
document.querySelector("#next-image").addEventListener("click", () => setImage(currentImageIndex + 1));
document.querySelector("#thumbnail-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-image-index]");
  if (button) setImage(Number(button.dataset.imageIndex));
});
document.querySelector("#gallery-dots").addEventListener("click", (event) => {
  const button = event.target.closest("[data-image-index]");
  if (button) setImage(Number(button.dataset.imageIndex));
});
document.querySelector("#size-options").addEventListener("click", (event) => {
  const button = event.target.closest("[data-size]");
  if (!button || button.disabled) return;
  selectedSize = button.dataset.size;
  document.querySelector("#size-feedback").textContent = "";
  document.querySelector("#action-feedback").textContent = "";
  quantity = 1;
  renderSizeOptions();
});
document.querySelector("#quantity-minus").addEventListener("click", () => {
  quantity = Math.max(1, quantity - 1);
  renderSizeOptions();
});
document.querySelector("#quantity-plus").addEventListener("click", () => {
  const available = Number(currentProduct?.sizeStock?.[selectedSize]) || 0;
  quantity = Math.min(available, quantity + 1);
  renderSizeOptions();
});
document.querySelector("#buy-now").addEventListener("click", () => {
  if (!validatePurchase() || !addVariantToBag()) return;
  window.location.href = "index.html?checkout=1";
});
document.querySelector("#add-to-cart").addEventListener("click", () => {
  if (!validatePurchase() || !addVariantToBag()) return;
  document.querySelector("#action-feedback").textContent = `${currentProduct.name} · size ${selectedSize} added to your bag.`;
});
document.querySelector("#whatsapp-order").addEventListener("click", () => {
  if (!validatePurchase()) return;
  if (whatsappNumber.length < 8 || whatsappNumber.length > 15) {
    document.querySelector("#action-feedback").textContent = "WhatsApp ordering is not configured yet. Please contact the store.";
    return;
  }
  const total = currentProduct.price * quantity;
  const message = `Hi RELAXBD! I want to order:\n${currentProduct.name}\nSize: ${selectedSize}\nQuantity: ${quantity}\nTotal: ${formatDetailPrice(total)}`;
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
});
document.querySelector("#save-image").addEventListener("click", saveCurrentImage);
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" && currentProduct?.images.length > 1) setImage(currentImageIndex - 1);
  if (event.key === "ArrowRight" && currentProduct?.images.length > 1) setImage(currentImageIndex + 1);
});

loadProduct();
