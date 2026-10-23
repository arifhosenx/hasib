const fallbackCategories = [
  { slug: "t-shirts", name: "T-shirts", image: "" },
  { slug: "shirts", name: "Shirts", image: "" },
  { slug: "bottoms", name: "Bottoms", image: "" },
  { slug: "accessories", name: "Accessories", image: "" }
];
const config = window.RELAXBD_CONFIG;
const client = config?.supabaseUrl && config?.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;
let categories = fallbackCategories;
let products = [...(window.RELAXBD_PRODUCTS || [])];
const params = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split("/").filter(Boolean);
const decodePathPart = (value) => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return "";
  }
};
const selectedSlug = params.get("slug") || (pathParts[0] === "category" ? decodePathPart(pathParts[1]) : "");
const isAllCategories = params.get("view") === "all" || pathParts[0] === "categories" || !selectedSlug;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const imageURL = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const formattedPrice = (price) => `৳${Number(price || 0).toLocaleString("en-BD")}`;

function categoryImage(category) {
  return imageURL(category.image) || imageURL(products.find((product) => product.category === category.slug)?.image);
}

function renderNavigation() {
  const menu = document.querySelector("#category-chips");
  menu.innerHTML = `
    <a class="category-chip ${isAllCategories ? "selected" : ""}" href="/category.html?view=all">All categories</a>
    ${categories.map((category) => `<a class="category-chip ${category.slug === selectedSlug ? "selected" : ""}" href="/category.html?slug=${encodeURIComponent(category.slug)}">${esc(category.name)}</a>`).join("")}
  `;
  const dropdown = document.querySelector("#category-collections-menu");
  if (dropdown) {
    dropdown.innerHTML = `
      <a href="/category.html?view=all">ALL CATEGORIES <span aria-hidden="true">↗</span></a>
      ${categories.map((category) => `<a href="/category.html?slug=${encodeURIComponent(category.slug)}">${esc(category.name)}</a>`).join("")}
    `;
  }
}

function renderCategoryCards() {
  const grid = document.querySelector("#category-card-grid");
  grid.innerHTML = categories.map((category, index) => {
    const count = products.filter((product) => product.category === category.slug).length;
    const image = categoryImage(category);
    return `<a class="category-list-card" href="/category.html?slug=${encodeURIComponent(category.slug)}">
      <span class="category-list-image">${image ? `<img src="${esc(image)}" alt="" loading="lazy" />` : `<span aria-hidden="true">✳</span>`}</span>
      <span class="category-list-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="category-list-name">${esc(category.name)}</span>
      <span class="category-list-count">${count} ${count === 1 ? "product" : "products"}</span>
      <span class="category-list-arrow" aria-hidden="true">↗</span>
    </a>`;
  }).join("");
}

function renderProducts(category) {
  const grid = document.querySelector("#category-product-grid");
  const toolbar = document.querySelector("#category-products-toolbar");
  const categoryCards = document.querySelector("#category-card-grid");
  const empty = document.querySelector("#category-empty-state");
  categoryCards.hidden = true;
  toolbar.hidden = false;
  const sort = document.querySelector("#category-sort").value;
  const selectedProducts = products.filter((product) => product.category === category.slug);
  if (sort === "newest") selectedProducts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (sort === "price-low") selectedProducts.sort((a, b) => a.price - b.price);
  if (sort === "price-high") selectedProducts.sort((a, b) => b.price - a.price);
  document.querySelector("#category-count").textContent = `${selectedProducts.length}টি প্রোডাক্ট`;
  grid.hidden = selectedProducts.length === 0;
  empty.hidden = selectedProducts.length !== 0;
  grid.innerHTML = selectedProducts.map((product) => {
    const outOfStock = Number(product.stock) <= 0;
    return `<article class="product-card category-product-card">
      <a class="product-card-link" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${esc(product.name)}"></a>
      <div class="product-image-wrap">
        <img class="product-image" src="${esc(imageURL(product.image))}" alt="${esc(product.alt || product.name)}" loading="lazy" />
        ${outOfStock ? `<span class="product-badge category-stock-badge">স্টক শেষ</span>` : `<span class="product-badge">${esc(product.badge || "")}</span>`}
        <a class="quick-add category-buy-button" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="Buy ${esc(product.name)}">BUY NOW <span>↗</span></a>
      </div>
      <div class="product-info"><p class="product-name">${esc(product.name)}</p><p class="product-price">${formattedPrice(product.price)}</p><p class="product-subtitle">${esc(product.subtitle || "")}</p></div>
    </article>`;
  }).join("");
}

function updatePage(category) {
  const title = document.querySelector("#category-title");
  const breadcrumb = document.querySelector("#breadcrumb-current");
  const missingCategory = !isAllCategories && !category;
  const heading = category ? category.name : (missingCategory ? "Category not found" : "ALL COLLECTIONS");
  const productsForCategory = category ? products.filter((product) => product.category === category.slug) : [];
  document.title = category ? `${heading} — RELAXBD` : (missingCategory ? "Category not found — RELAXBD" : "All Categories — RELAXBD");
  document.querySelector('meta[name="description"]').content = category
    ? `Shop ${heading} at RELAXBD. Explore ${productsForCategory.length} pieces from this collection, made in Bangladesh.`
    : missingCategory
      ? "This RELAXBD category could not be found. Browse all available collections."
      : "Browse every RELAXBD category and discover new everyday essentials, designed in Bangladesh.";
  title.innerHTML = category
    ? esc(heading.toUpperCase())
    : (missingCategory ? "CATEGORY<br /><span>NOT FOUND.</span>" : "ALL<br /><span>COLLECTIONS.</span>");
  breadcrumb.textContent = category ? category.name : (missingCategory ? "Category not found" : "All collections");
  document.querySelector("#category-eyebrow").textContent = category
    ? "EXPLORE THE COLLECTION"
    : (missingCategory ? "COLLECTION NOT FOUND" : "THE RELAXBD EDIT");
  document.querySelector("#category-description").textContent = category
    ? `Explore ${heading} from RELAXBD. Find your fit and discover your next everyday favourite.`
    : missingCategory
      ? "The category link may be outdated. Browse all current RELAXBD collections."
      : "Find your fit. Explore every RELAXBD collection, made for everyday wear.";
  document.querySelector("#category-title").classList.toggle("category-title-small", Boolean(category));
  renderNavigation();
  if (isAllCategories) {
    document.querySelector("#category-count").textContent = `${categories.length}টি ক্যাটাগরি`;
    document.querySelector("#category-card-grid").hidden = false;
    document.querySelector("#category-products-toolbar").hidden = true;
    document.querySelector("#category-product-grid").hidden = true;
    document.querySelector("#category-empty-state").hidden = categories.length !== 0;
    renderCategoryCards();
    return;
  }
  if (!category) {
    document.querySelector("#category-count").textContent = "0টি প্রোডাক্ট";
    document.querySelector("#category-card-grid").hidden = true;
    document.querySelector("#category-products-toolbar").hidden = true;
    document.querySelector("#category-product-grid").hidden = true;
    document.querySelector("#category-empty-state").hidden = false;
    return;
  }
  renderProducts(category);
}

async function loadCatalog() {
  if (client) {
    const [categoryResult, productResult] = await Promise.all([
      client.from("categories").select("slug,name,image").eq("active", true).order("name"),
      client.from("products").select("id,name,subtitle,category,price,compare_at_price,badge,image,alt,stock,created_at").eq("active", true)
    ]);
    if (categoryResult.error) {
      console.error("Could not load category data.", categoryResult.error);
    } else {
      categories = categoryResult.data;
    }
    if (productResult.error) {
      console.error("Could not load category products.", productResult.error);
    } else {
      products = productResult.data.map((product) => ({
        ...product,
        oldPrice: product.compare_at_price,
        image: imageURL(product.image)
      }));
    }
  }
  updatePage(categories.find((category) => category.slug === selectedSlug) || null);
}

document.querySelector("#category-sort").addEventListener("change", () => {
  const category = categories.find((item) => item.slug === selectedSlug);
  if (category && !isAllCategories) renderProducts(category);
});
document.querySelector(".menu-toggle").addEventListener("click", (event) => {
  const menu = document.querySelector(".main-nav");
  const expanded = event.currentTarget.getAttribute("aria-expanded") !== "true";
  event.currentTarget.setAttribute("aria-expanded", String(expanded));
  menu.classList.toggle("open", expanded);
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const productLink = event.target.closest('a[href^="/product.html?id="]');
  if (productLink) {
    try {
      sessionStorage.setItem(`category-scroll:${window.location.pathname}${window.location.search}`, String(window.scrollY));
    } catch (error) {
      console.warn("Category scroll position could not be saved.", error);
    }
  }
});

loadCatalog().then(() => {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation?.type === "back_forward") {
    const key = `category-scroll:${window.location.pathname}${window.location.search}`;
    try {
      const savedScroll = sessionStorage.getItem(key);
      if (savedScroll !== null) {
        requestAnimationFrame(() => window.scrollTo(0, Number(savedScroll)));
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.warn("Category scroll position could not be restored.", error);
    }
  }
});
