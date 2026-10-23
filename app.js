const products = [
  {
    id: "core-tee-black",
    name: "Core heavyweight tee",
    subtitle: "Black · Relaxed fit",
    category: "t-shirts",
    price: 1290,
    badge: "Bestseller",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85",
    alt: "White heavyweight cotton t-shirt"
  },
  {
    id: "daybreak-shirt",
    name: "Daybreak overshirt",
    subtitle: "Natural · Boxy fit",
    category: "shirts",
    price: 2190,
    badge: "Just in",
    image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=85",
    alt: "Neutral overshirt on a hanger"
  },
  {
    id: "after-hours-tee",
    name: "After hours graphic tee",
    subtitle: "Charcoal · Relaxed fit",
    category: "t-shirts",
    price: 1490,
    badge: "Just in",
    image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=85",
    alt: "Dark graphic t-shirt styled for the street"
  },
  {
    id: "utility-cargo",
    name: "Everyday utility cargo",
    subtitle: "Olive · Straight leg",
    category: "bottoms",
    price: 2890,
    badge: "Limited",
    image: "https://images.unsplash.com/photo-1517445312882-bc9910d016b7?auto=format&fit=crop&w=900&q=85",
    alt: "Olive utility trousers"
  },
  {
    id: "form-shirt",
    name: "Form camp-collar shirt",
    subtitle: "Stone · Easy fit",
    category: "shirts",
    price: 1990,
    badge: "Just in",
    image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=85",
    alt: "Casual short-sleeve shirt"
  },
  {
    id: "weekend-tote",
    name: "Weekend carryall tote",
    subtitle: "Natural · Heavy canvas",
    category: "accessories",
    price: 790,
    badge: "Small batch",
    image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85",
    alt: "Everyday canvas carryall bag"
  },
  {
    id: "studio-tee",
    name: "Studio boxy tee",
    subtitle: "Off-white · Boxy fit",
    category: "t-shirts",
    price: 1390,
    badge: "Just in",
    image: "https://images.unsplash.com/photo-1527719327859-c6ce80353573?auto=format&fit=crop&w=900&q=85",
    alt: "Off-white boxy cotton t-shirt"
  },
  {
    id: "weekender-short",
    name: "Weekender easy short",
    subtitle: "Washed black · Easy fit",
    category: "bottoms",
    price: 1590,
    oldPrice: 1890,
    badge: "−16%",
    image: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=900&q=85",
    alt: "Relaxed everyday shorts"
  }
];

const formatPrice = (price) => `৳${price.toLocaleString("en-BD")}`;
const grid = document.querySelector("#product-grid");
const countLabel = document.querySelector(".product-count");
const emptyState = document.querySelector(".empty-state");
const searchInput = document.querySelector("#product-search");
const overlay = document.querySelector(".overlay");
const cartPanel = document.querySelector(".cart-panel");
const searchPanel = document.querySelector(".search-panel");
const cart = new Map();
let activeCategory = "all";
let activeQuery = "";
let sortOrder = "featured";
let toastTimer;

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
      <div class="product-image-wrap">
        <img class="product-image" src="${product.image}" alt="${product.alt}" loading="lazy" />
        <span class="product-badge ${product.oldPrice ? "sale" : ""}">${product.badge}</span>
        <button class="wishlist-button" type="button" aria-label="Add ${product.name} to wishlist" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.3-8.8 10-8.8 10s-8.8-4.7-8.8-10A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.7Z" /></svg>
        </button>
        <button class="quick-add" type="button" data-add="${product.id}"><span>Quick add to bag</span><span>＋</span></button>
      </div>
      <div class="product-info">
        <p class="product-name">${product.name}</p>
        <p class="product-price">${formatPrice(product.price)}${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ""}</p>
        <p class="product-subtitle">${product.subtitle}</p>
      </div>
    </article>
  `).join("");
}

function cartQuantity() {
  return [...cart.values()].reduce((total, item) => total + item.quantity, 0);
}

function renderCart() {
  const items = [...cart.values()];
  const itemCount = cartQuantity();
  document.querySelector(".cart-count").textContent = itemCount;
  document.querySelector(".panel-count").textContent = `(${itemCount})`;
  document.querySelector(".cart-empty").hidden = items.length > 0;
  document.querySelector(".cart-footer").hidden = items.length === 0;
  document.querySelector(".cart-items").innerHTML = items.map(({ product, quantity }) => `
    <article class="cart-item">
      <img src="${product.image}" alt="" />
      <div>
        <h3>${product.name}</h3>
        <p>${product.subtitle}</p>
        <div class="quantity-control" aria-label="Quantity for ${product.name}">
          <button type="button" data-quantity="${product.id}" data-change="-1" aria-label="Remove one">−</button>
          <span>${quantity}</span>
          <button type="button" data-quantity="${product.id}" data-change="1" aria-label="Add one">+</button>
        </div>
      </div>
      <span class="cart-item-price">${formatPrice(product.price * quantity)}</span>
    </article>
  `).join("");
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  document.querySelector(".cart-subtotal").textContent = formatPrice(subtotal);
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
  searchPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden", "true");
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

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const existing = cart.get(productId);
  cart.set(productId, { product, quantity: existing ? existing.quantity + 1 : 1 });
  renderCart();
  showToast(`${product.name} added to your bag`);
}

document.querySelector(".filter-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll(".filter-button").forEach((filter) => filter.classList.toggle("selected", filter === button));
  renderProducts();
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
  const item = cart.get(button.dataset.quantity);
  if (!item) return;
  const quantity = item.quantity + Number(button.dataset.change);
  if (quantity <= 0) cart.delete(button.dataset.quantity);
  else cart.set(button.dataset.quantity, { ...item, quantity });
  renderCart();
});

document.querySelector(".cart-button").addEventListener("click", () => openPanel(cartPanel));
document.querySelector(".search-open").addEventListener("click", () => openPanel(searchPanel));
document.querySelector(".panel-close").addEventListener("click", closePanels);
document.querySelector(".search-close").addEventListener("click", closePanels);
overlay.addEventListener("click", closePanels);
document.querySelector(".continue-shopping").addEventListener("click", closePanels);
document.querySelector(".checkout-button").addEventListener("click", () => {
  showToast("Checkout is coming soon. Message us to place your order.");
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

renderProducts();
renderCart();
