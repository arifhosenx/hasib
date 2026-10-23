const checkoutConfig = window.RELAXBD_CONFIG;
const checkoutSupabase = checkoutConfig?.supabaseUrl && checkoutConfig?.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(checkoutConfig.supabaseUrl, checkoutConfig.supabaseAnonKey)
  : null;
const checkoutForm = document.querySelector("#checkout-form");
const checkoutQuery = new URLSearchParams(window.location.search);
const isBuyNow = checkoutQuery.get("mode") === "buy";
const locations = window.RELAXBD_LOCATIONS || [];
const checkoutSessionKey = "relaxbd-checkout-state";
const buyNowSessionKey = "relaxbd-buy-now";
const deliveryMethods = ["standard"];
const bnDigits = "০১২৩৪৫৬৭৮৯";
const dhakaCitySubdistricts = new Set([
  "Adabor", "Badda", "Bangshal", "Biman Bandar", "Cantonment", "Chak Bazar", "Dakshinkhan",
  "Darus Salam", "Demra", "Dhanmondi", "Gendaria", "Gulshan", "Hazaribagh", "Jatrabari",
  "Kadamtali", "Kafrul", "Kalabagan", "Kamrangir Char", "Khilgaon", "Khilkhet", "Kotwali",
  "Lalbagh", "Mirpur", "Mohammadpur", "Motijheel", "New Market", "Pallabi", "Paltan", "Ramna",
  "Rampura", "Sabujbag", "Shah Ali", "Shahbagh", "Sher-e-Bangla Nagar", "Shyampur", "Sutrapur",
  "Tejgaon", "Tejgaon Industrial Area", "Turag", "Uttar Khan", "Uttara", "Shahjahanpur"
]);
const defaultCheckoutSettings = { dhaka_delivery_fee: 70, outside_dhaka_delivery_fee: 130, free_shipping_threshold: 2500 };
let checkoutSettings = { ...defaultCheckoutSettings };
let orderItems = [];
let currentStep = 1;
let discount = null;
let selectedWallet = "bkash";
let submittingOrder = false;
let orderCreated = false;
let districtOptionsByName = new Map();

const checkoutPrice = (value) => `৳${Number(value || 0).toLocaleString("en-BD")}`;
const escapeCheckoutHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const toEnglishDigits = (value) => String(value || "").replace(/[০-৯]/g, (digit) => String(bnDigits.indexOf(digit)));
const sanitizePlainText = (value) => String(value ?? "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const safeCheckoutImage = (value) => {
  try {
    const url = new URL(value, window.location.href);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

function readSessionState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(checkoutSessionKey) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    console.error("Could not restore checkout form data.", error);
    return {};
  }
}

function persistSessionState() {
  const values = Object.fromEntries(new FormData(checkoutForm).entries());
  const state = { ...values, walletProvider: selectedWallet, step: currentStep, couponCode: document.querySelector("#coupon-code").value };
  try {
    sessionStorage.setItem(checkoutSessionKey, JSON.stringify(state));
  } catch (error) {
    console.error("Could not preserve checkout form data for this session.", error);
  }
}

function initializeDistrictOptions(selectedDistrict = "") {
  const select = document.querySelector("#customer-district");
  districtOptionsByName = new Map(locations.map((district) => [district.name, district]));
  select.innerHTML = `<option value="">জেলা নির্বাচন করুন</option>${locations.map((district) =>
    `<option value="${escapeCheckoutHTML(district.name)}">${escapeCheckoutHTML(district.bnName)}</option>`
  ).join("")}`;
  if (districtOptionsByName.has(selectedDistrict)) select.value = selectedDistrict;
  updateSubdistrictOptions(select.value, "");
}

function updateSubdistrictOptions(districtName, selectedSubdistrict = "") {
  const select = document.querySelector("#customer-subdistrict");
  const district = districtOptionsByName.get(districtName);
  const options = district?.upazilas || [];
  select.disabled = !district || options.length === 0;
  select.innerHTML = !district
    ? `<option value="">আগে জেলা নির্বাচন করুন</option>`
    : options.length
      ? `<option value="">থানা / উপজেলা নির্বাচন করুন</option>${options.map((upazila) =>
        `<option value="${escapeCheckoutHTML(upazila.name)}">${escapeCheckoutHTML(upazila.bnName)}</option>`
      ).join("")}`
      : `<option value="">এই জেলায় তালিকা পাওয়া যায়নি</option>`;
  if (options.some((upazila) => upazila.name === selectedSubdistrict)) select.value = selectedSubdistrict;
  else select.value = "";
  renderOrderSummary();
}

function checkoutSubtotal() {
  return orderItems.reduce((total, item) => total + Number(item.product.price || 0) * item.quantity, 0);
}

function selectedDistrict() {
  return districtOptionsByName.get(document.querySelector("#customer-district").value);
}

function selectedSubdistrict() {
  const district = selectedDistrict();
  return district?.upazilas.find((item) => item.name === document.querySelector("#customer-subdistrict").value);
}

function getShippingFee() {
  const district = selectedDistrict();
  if (!district) return 0;
  const threshold = Number(checkoutSettings.free_shipping_threshold) || 0;
  if (threshold > 0 && checkoutSubtotal() >= threshold) return 0;
  const isDhakaCity = district.name === "Dhaka" && dhakaCitySubdistricts.has(selectedSubdistrict()?.name);
  const setting = isDhakaCity ? checkoutSettings.dhaka_delivery_fee : checkoutSettings.outside_dhaka_delivery_fee;
  const defaultFee = isDhakaCity ? defaultCheckoutSettings.dhaka_delivery_fee : defaultCheckoutSettings.outside_dhaka_delivery_fee;
  const configuredFee = setting === "" || setting === null || setting === undefined ? defaultFee : Number(setting);
  return Math.max(0, Number.isFinite(configuredFee) ? configuredFee : defaultFee);
}

function renderOrderSummary() {
  const count = orderItems.reduce((total, item) => total + item.quantity, 0);
  const subtotal = checkoutSubtotal();
  const shipping = getShippingFee();
  const appliedDiscount = Math.min(subtotal, Number(discount?.discount) || 0);
  const total = subtotal - appliedDiscount + shipping;
  const shippingPlan = document.querySelector("#payment-shipping");
  const freeDeliverySelected = Boolean(selectedDistrict() && shipping === 0);
  shippingPlan.disabled = freeDeliverySelected;
  if (freeDeliverySelected && shippingPlan.checked) document.querySelector("#payment-full").checked = true;
  const advance = document.querySelector('input[name="paymentPlan"]:checked')?.value === "full_advance" ? total : shipping;
  document.querySelector("#header-item-count").textContent = count;
  document.querySelector("#summary-count").textContent = `${count} পণ্য`;
  document.querySelector("#summary-items").innerHTML = orderItems.map(({ product, quantity, size }) => {
    const image = safeCheckoutImage(product.image);
    return `<article class="summary-item">
      <img src="${escapeCheckoutHTML(image)}" alt="${escapeCheckoutHTML(product.name)}" />
      <div class="summary-item-info"><strong>${escapeCheckoutHTML(product.name)}</strong><small>${escapeCheckoutHTML(product.code || String(product.id).slice(0, 10).toUpperCase())} · সাইজ ${escapeCheckoutHTML(size || "—")} · ${quantity} টি</small></div>
      <span class="summary-item-price">${checkoutPrice(product.price * quantity)}</span>
    </article>`;
  }).join("");
  document.querySelector("#summary-subtotal").textContent = checkoutPrice(subtotal);
  document.querySelector("#summary-discount").textContent = `−${checkoutPrice(appliedDiscount)}`;
  document.querySelector("#summary-shipping").textContent = checkoutPrice(shipping);
  document.querySelector("#summary-total").textContent = checkoutPrice(total);
  document.querySelector("#delivery-option-price").textContent = shipping ? checkoutPrice(shipping) : "ফ্রি";
  document.querySelector("#advance-amount").textContent = checkoutPrice(advance);
  document.querySelector("#cash-due-amount").textContent = checkoutPrice(total - advance);
  document.querySelector("#shipping-hint").textContent = !selectedDistrict()
    ? "জেলা নির্বাচন করলে শিপিং চার্জ দেখানো হবে।"
    : shipping === 0 && checkoutSubtotal() > 0
      ? "আপনার অর্ডারে ফ্রি ডেলিভারি প্রযোজ্য।"
      : `${selectedDistrict().bnName} জেলায় কুরিয়ার চার্জ ${checkoutPrice(shipping)}।`;
  updateWalletDisplay();
}

function getField(name) {
  return checkoutForm.elements.namedItem(name);
}

function setFieldError(name, message = "") {
  const field = getField(name);
  const label = field.closest(".form-field");
  const feedback = document.querySelector(`[data-error-for="${name}"]`);
  label.classList.toggle("invalid", Boolean(message));
  field.setAttribute("aria-invalid", String(Boolean(message)));
  feedback.textContent = message;
}

function validateAddressStep() {
  const values = new FormData(checkoutForm);
  const phone = toEnglishDigits(values.get("phone")).replace(/[\s-]/g, "");
  getField("phone").value = phone;
  const errors = {
    customerName: String(values.get("customerName") || "").trim() ? "" : "আপনার পুরো নাম লিখুন।",
    phone: /^01\d{9}$/.test(phone) ? "" : "সঠিক ১১ ডিজিটের মোবাইল নম্বর লিখুন (01XXXXXXXXX)।",
    district: String(values.get("district") || "") ? "" : "আপনার জেলা নির্বাচন করুন।",
    subdistrict: String(values.get("subdistrict") || "") ? "" : "আপনার থানা / উপজেলা নির্বাচন করুন।",
    address: String(values.get("address") || "").trim() ? "" : "আপনার বিস্তারিত ডেলিভারি ঠিকানা লিখুন।"
  };
  Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
  const valid = Object.values(errors).every((message) => !message);
  document.querySelector("#address-step-error").textContent = valid ? "" : "সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।";
  if (!valid) {
    checkoutForm.querySelector(".form-field.invalid input, .form-field.invalid select, .form-field.invalid textarea")?.focus();
  }
  return valid;
}

function validateDeliveryStep() {
  const selected = checkoutForm.querySelector('input[name="deliveryMethod"]:checked');
  const valid = Boolean(selected && deliveryMethods.includes(selected.value) && selectedDistrict() && selectedSubdistrict());
  document.querySelector("#delivery-step-error").textContent = valid ? "" : "ডেলিভারি পদ্ধতি ও ঠিকানা নিশ্চিত করুন।";
  return valid;
}

function validatePaymentStep() {
  const payerPhone = toEnglishDigits(getField("payerPhone").value).replace(/[\s-]/g, "");
  getField("payerPhone").value = payerPhone;
  const transaction = String(getField("transactionId").value || "").trim().toUpperCase();
  getField("transactionId").value = transaction;
  const phoneValid = /^01\d{9}$/.test(payerPhone);
  const transactionValid = /^[A-Z0-9]{8,12}$/.test(transaction);
  const termsAccepted = document.querySelector("#checkout-terms").checked;
  setFieldError("payerPhone", phoneValid ? "" : "সঠিক ১১ ডিজিটের বিকাশ/নগদ নম্বর লিখুন (01XXXXXXXXX)।");
  setFieldError("transactionId", transactionValid ? "" : "TrxID ৮–১২টি ইংরেজি বড় হাতের অক্ষর বা সংখ্যা হতে হবে।");
  document.querySelector("#terms-error").textContent = termsAccepted ? "" : "অর্ডার নিশ্চিত করতে শর্তাবলী ও গোপনীয়তা নীতিতে সম্মতি দিন।";
  const validPlan = ["shipping_advance", "full_advance"].includes(checkoutForm.querySelector('input[name="paymentPlan"]:checked')?.value);
  const walletNumber = selectedWallet === "bkash" ? checkoutConfig?.bkashPersonalNumber : checkoutConfig?.nagadPersonalNumber;
  document.querySelector("#payment-step-error").textContent = walletNumber ? "" : `${selectedWallet === "bkash" ? "বিকাশ" : "নগদ"} পার্সোনাল নম্বর config.js-এ যোগ করুন।`;
  const valid = phoneValid && transactionValid && termsAccepted && validPlan && Boolean(walletNumber);
  if (!phoneValid) getField("payerPhone").focus();
  else if (!transactionValid) getField("transactionId").focus();
  else if (!termsAccepted) document.querySelector("#checkout-terms").focus();
  else if (!validPlan || !walletNumber) document.querySelector("#payment-step-error").focus();
  return valid;
}

function validateStep(step) {
  if (step === 1) return validateAddressStep();
  if (step === 2) return validateDeliveryStep();
  return validatePaymentStep();
}

function showStep(step) {
  currentStep = step;
  document.querySelectorAll(".checkout-step").forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== currentStep;
  });
  document.querySelectorAll(".step-tab").forEach((tab) => {
    const tabStep = Number(tab.dataset.stepTab);
    tab.classList.toggle("active", tabStep === currentStep);
    tab.classList.toggle("completed", tabStep < currentStep);
    if (tabStep === currentStep) tab.setAttribute("aria-current", "step");
    else tab.removeAttribute("aria-current");
    tab.disabled = tabStep >= currentStep;
  });
  persistSessionState();
  window.scrollTo(0, 0);
}

function advanceStep(step) {
  if (!validateStep(step)) return;
  if (step === 1) updateDeliveryPreview();
  if (step === 2) renderOrderSummary();
  showStep(Math.min(3, step + 1));
}

function updateDeliveryPreview() {
  const district = selectedDistrict();
  const subdistrict = selectedSubdistrict();
  document.querySelector("#delivery-recipient").textContent = `${getField("customerName").value.trim()} · ${toEnglishDigits(getField("phone").value)}`;
  document.querySelector("#delivery-address-preview").textContent = [
    district?.bnName,
    subdistrict?.bnName,
    getField("address").value.trim()
  ].filter(Boolean).join(" · ");
  document.querySelector("#delivery-step-error").textContent = "";
}

function updateWalletDisplay() {
  const isBkash = selectedWallet === "bkash";
  const walletNumber = isBkash ? checkoutConfig?.bkashPersonalNumber : checkoutConfig?.nagadPersonalNumber;
  const label = isBkash ? "বিকাশ" : "নগদ";
  document.querySelectorAll("[data-wallet-tab]").forEach((tab) => {
    const active = tab.dataset.walletTab === selectedWallet;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const instructions = document.querySelector("#wallet-instructions");
  instructions.classList.toggle("bkash-wallet", isBkash);
  instructions.classList.toggle("nagad-wallet", !isBkash);
  document.querySelector("#wallet-title").textContent = `${label} পার্সোনাল নম্বরে Send Money করুন`;
  document.querySelector("#wallet-number").textContent = String(walletNumber || "").trim() || `config.js-এ ${label} নম্বর সেট করুন`;
  document.querySelector("#wallet-howto").textContent = `এখন পাঠাবেন অংশে দেখানো ${checkoutPrice(Number(document.querySelector("#advance-amount").textContent.replace(/[^\d]/g, "")))} ${label} Send Money করে TrxID দিন।`;
  document.querySelector("#transaction-field > span").innerHTML = `${label} TrxID <i>*</i>`;
}

function restoreSessionData() {
  const saved = readSessionState();
  ["customerName", "phone", "address", "payerPhone", "transactionId"].forEach((name) => {
    if (saved[name] && getField(name)) getField(name).value = name === "phone" ? toEnglishDigits(saved[name]) : saved[name];
  });
  document.querySelector("#coupon-code").value = saved.couponCode || "";
  document.querySelector("#apply-coupon").disabled = !document.querySelector("#coupon-code").value.trim();
  if (saved.district) {
    initializeDistrictOptions(saved.district);
    updateSubdistrictOptions(saved.district, saved.subdistrict || "");
  } else {
    initializeDistrictOptions();
  }
  if (saved.deliveryMethod && deliveryMethods.includes(saved.deliveryMethod)) {
    checkoutForm.querySelector(`input[name="deliveryMethod"][value="${saved.deliveryMethod}"]`).checked = true;
  }
  if (["shipping_advance", "full_advance"].includes(saved.paymentPlan)) {
    checkoutForm.querySelector(`input[name="paymentPlan"][value="${saved.paymentPlan}"]`).checked = true;
  }
  if (["bkash", "nagad"].includes(saved.walletProvider)) selectedWallet = saved.walletProvider;
  document.querySelector("#checkout-terms").checked = saved.termsAccepted === "on";
  updateWalletDisplay();
  const restoreStep = Number(saved.step);
  currentStep = restoreStep >= 1 && restoreStep <= 3 ? restoreStep : 1;
  if (currentStep > 1 && !validateStep(1)) currentStep = 1;
  if (currentStep > 2 && !validateStep(2)) currentStep = 2;
  updateDeliveryPreview();
  renderOrderSummary();
  showStep(currentStep);
}

function loadOrderItems() {
  if (isBuyNow) {
    try {
      const item = JSON.parse(sessionStorage.getItem(buyNowSessionKey) || "null");
      if (item?.product?.id && ["M", "L", "XL"].includes(item.size) && Number.isInteger(item.quantity) && item.quantity > 0) {
        orderItems = [{ ...item, product: { ...item.product, image: safeCheckoutImage(item.product.image) } }];
      }
    } catch (error) {
      console.error("Could not load the Buy Now product.", error);
    }
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem("relaxbd-cart") || "[]");
    if (Array.isArray(saved)) {
      orderItems = saved.filter((item) => item?.product?.id && Number.isInteger(item.quantity) && item.quantity > 0)
        .map((item) => ({ ...item, product: { ...item.product, image: safeCheckoutImage(item.product.image) } }));
    }
  } catch (error) {
    console.error("Could not load saved cart items for checkout.", error);
  }
}

async function loadStoreSettings() {
  updateWalletDisplay();
  if (!checkoutSupabase) return;
  const { data, error } = await checkoutSupabase.from("site_settings").select("value").eq("key", "store").maybeSingle();
  if (error) {
    console.error("Could not load delivery and payment settings.", error);
    return;
  }
  checkoutSettings = { ...checkoutSettings, ...(data?.value || {}) };
  renderOrderSummary();
  updateWalletDisplay();
}

async function applyCoupon() {
  const input = document.querySelector("#coupon-code");
  const feedback = document.querySelector("#coupon-feedback");
  const button = document.querySelector("#apply-coupon");
  const code = input.value.trim().toUpperCase();
  feedback.classList.remove("error");
  if (!code) return;
  if (!checkoutSupabase) {
    feedback.textContent = "কুপন যাচাই করতে স্টোরের ডাটাবেস সংযুক্ত থাকতে হবে।";
    feedback.classList.add("error");
    return;
  }
  button.disabled = true;
  feedback.textContent = "কুপন যাচাই করা হচ্ছে…";
  try {
    const { data, error } = await checkoutSupabase.rpc("validate_promotion", {
      p_code: code,
      p_subtotal: checkoutSubtotal()
    });
    if (error || !data?.code) {
      discount = null;
      feedback.textContent = "কুপন কোডটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।";
      feedback.classList.add("error");
    } else {
      discount = data;
      feedback.textContent = `${data.code} কুপনটি প্রয়োগ হয়েছে — ${checkoutPrice(data.discount)} ছাড়।`;
    }
  } catch (error) {
    console.error("Could not validate the coupon code.", error);
    discount = null;
    feedback.textContent = "কুপন যাচাই করা যায়নি। আবার চেষ্টা করুন।";
    feedback.classList.add("error");
  } finally {
    button.disabled = !input.value.trim();
  }
  renderOrderSummary();
  persistSessionState();
}

function localizeOrderError(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("already") || text.includes("duplicate") || text.includes("unique")) return "এই TrxID আগেই ব্যবহার হয়েছে। সঠিক TrxID দিয়ে আবার চেষ্টা করুন।";
  if (text.includes("stock")) return "দুঃখিত, এই পণ্যের নির্বাচিত সাইজে পর্যাপ্ত স্টক নেই।";
  if (text.includes("promotion") || text.includes("discount")) return "কুপন কোডটি আর প্রযোজ্য নয়। কুপন সরিয়ে আবার অর্ডার করুন।";
  if (text.includes("transaction") || text.includes("trx")) return "TrxID যাচাই করুন এবং আবার চেষ্টা করুন।";
  if (text.includes("payment")) return "পেমেন্টের তথ্য যাচাই করুন এবং আবার চেষ্টা করুন।";
  if (text.includes("total") || text.includes("delivery fee")) return "অর্ডারের হিসাব আপডেট হয়েছে। অর্ডারটি আবার দেখে নিশ্চিত করুন।";
  if (text.includes("html")) return "নাম বা ঠিকানায় HTML লেখা যাবে না। সাধারণ লেখা ব্যবহার করুন।";
  if (text.includes("phone")) return "মোবাইল নম্বরটি আবার যাচাই করুন।";
  if (text.includes("address")) return "ডেলিভারির ঠিকানাটি আবার যাচাই করুন।";
  if (text.includes("available") || text.includes("basket")) return "আপনার ব্যাগের একটি পণ্য আর পাওয়া যাচ্ছে না।";
  return "অর্ডারটি সম্পন্ন করা যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।";
}

function renderInlineSuccess(order) {
  const items = order.items.map((item) =>
    `<li>${escapeCheckoutHTML(item.name)} · সাইজ ${escapeCheckoutHTML(item.size || "—")} · ${item.quantity} টি — ${checkoutPrice(item.unitPrice * item.quantity)}</li>`
  ).join("");
  document.querySelector(".checkout-layout").innerHTML = `<section class="order-success">
    <span aria-hidden="true">✓</span><p class="checkout-kicker">RELAXBD · ORDER CONFIRMED</p>
    <h2>ধন্যবাদ, আপনার অর্ডারটি নেওয়া হয়েছে।</h2><p>অর্ডার নম্বর: <strong>${escapeCheckoutHTML(order.orderNumber)}</strong></p>
    <ul>${items}</ul><p>মোট: ${checkoutPrice(order.total)} · পেমেন্ট স্ট্যাটাস: ${escapeCheckoutHTML(order.paymentStatus)}</p>
    <p>ডেলিভারির ঠিকানা: ${escapeCheckoutHTML(order.address)}</p>
    <a class="primary-action" href="index.html">শপিং চালিয়ে যান <span aria-hidden="true">→</span></a>
  </section>`;
}

async function submitOrder(event) {
  event.preventDefault();
  if (submittingOrder) return;
  if (currentStep < 3) {
    advanceStep(currentStep);
    return;
  }
  if (!validatePaymentStep()) return;
  if (!checkoutSupabase) {
    document.querySelector("#payment-step-error").textContent = "অর্ডার সম্পন্ন করতে স্টোরের ডাটাবেস সংযুক্ত থাকতে হবে।";
    return;
  }
  const district = selectedDistrict();
  const subdistrict = selectedSubdistrict();
  if (!district || !subdistrict || !orderItems.length) {
    document.querySelector("#payment-step-error").textContent = "অর্ডার বা ডেলিভারির তথ্য পাওয়া যায়নি।";
    return;
  }
  const formData = new FormData(checkoutForm);
  const paymentPlan = String(formData.get("paymentPlan"));
  const subtotal = checkoutSubtotal();
  const appliedDiscount = Math.min(subtotal, Number(discount?.discount) || 0);
  const shipping = getShippingFee();
  const total = subtotal - appliedDiscount + shipping;
  const advance = paymentPlan === "full_advance" ? total : shipping;
  const cashDue = total - advance;
  const button = document.querySelector("#place-order");
  submittingOrder = true;
  button.disabled = true;
  button.querySelector(".confirm-label").textContent = "অর্ডার পাঠানো হচ্ছে…";
  button.querySelector('[aria-hidden="true"]').textContent = "…";
  document.querySelector("#payment-step-error").textContent = "";
  try {
    const address = `${district.bnName}, ${subdistrict.bnName}\n${sanitizePlainText(formData.get("address"))}`;
    const { data, error } = await checkoutSupabase.rpc("place_order", {
      p_customer_name: sanitizePlainText(formData.get("customerName")),
      p_phone: toEnglishDigits(formData.get("phone")).replace(/[\s-]/g, ""),
      p_address: address,
      p_payment_provider: selectedWallet,
      p_payment_plan: paymentPlan,
      p_customer_payment_phone: toEnglishDigits(formData.get("payerPhone")).replace(/[\s-]/g, ""),
      p_transaction_id: String(formData.get("transactionId") || "").trim().toUpperCase(),
      p_items: orderItems.map(({ product, quantity, size }) => ({
        product_id: product.id,
        size: size || null,
        quantity
      })),
      p_delivery_district: district.name,
      p_delivery_subdistrict: subdistrict.name,
      p_promo_code: discount?.code || null,
      p_customer_note: "",
      p_expected_subtotal: subtotal,
      p_expected_discount: appliedDiscount,
      p_expected_delivery_fee: shipping,
      p_expected_total: total
    });
    if (error) {
      console.error("Could not place the order.", error);
      document.querySelector("#payment-step-error").textContent = localizeOrderError(error.message);
      return;
    }
    if (!data?.order_number) {
      console.error("The order RPC returned no order number.", data);
      document.querySelector("#payment-step-error").textContent = "অর্ডারের নিশ্চয়তা পাওয়া যায়নি। অনুগ্রহ করে স্টোরে যোগাযোগ করুন।";
      return;
    }
    orderCreated = true;
    try {
      if (isBuyNow) sessionStorage.removeItem(buyNowSessionKey);
      else localStorage.removeItem("relaxbd-cart");
      sessionStorage.removeItem(checkoutSessionKey);
    } catch (storageError) {
      console.error("Could not clear the completed checkout data.", storageError);
    }
    const success = {
      orderNumber: data.order_number,
      items: orderItems.map(({ product, size, quantity }) => ({
        name: sanitizePlainText(product.name),
        code: sanitizePlainText(product.code || ""),
        size,
        quantity,
        unitPrice: Number(product.price)
      })),
      subtotal: Number(data.subtotal),
      discount: Number(data.discount),
      shipping: Number(data.delivery_fee),
      total: Number(data.total),
      advance: Number(data.advance_amount),
      cashDue: Number(data.cash_due_amount),
      paymentStatus: "যাচাই চলছে",
      address: `${district.bnName}, ${subdistrict.bnName}, ${sanitizePlainText(formData.get("address"))}`
    };
    try {
      sessionStorage.setItem("relaxbd-order-success", JSON.stringify(success));
      window.location.href = "order-success.html";
    } catch (storageError) {
      console.error("Could not preserve the completed order summary.", storageError);
      renderInlineSuccess(success);
    }
  } catch (error) {
    console.error("Could not submit the order.", error);
    document.querySelector("#payment-step-error").textContent = "অর্ডার পাঠানো যায়নি। ইন্টারনেট সংযোগ যাচাই করে আবার চেষ্টা করুন।";
  } finally {
    if (document.body.contains(button) && !orderCreated) {
      submittingOrder = false;
      button.disabled = false;
      button.querySelector(".confirm-label").textContent = "অর্ডার নিশ্চিত করুন";
      button.querySelector('[aria-hidden="true"]').textContent = "↗";
    }
  }
}

document.querySelector("#customer-district").addEventListener("change", (event) => {
  updateSubdistrictOptions(event.currentTarget.value);
  renderOrderSummary();
  persistSessionState();
});
document.querySelector("#customer-subdistrict").addEventListener("change", () => {
  renderOrderSummary();
  persistSessionState();
});
document.querySelector("#customer-phone").addEventListener("input", (event) => {
  event.currentTarget.value = toEnglishDigits(event.currentTarget.value);
  setFieldError("phone");
  persistSessionState();
});
checkoutForm.addEventListener("input", (event) => {
  if (event.target.name === "payerPhone") event.target.value = toEnglishDigits(event.target.value);
  if (event.target.name === "transactionId") {
    event.target.value = event.target.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }
  if (["customerName", "district", "subdistrict", "address", "payerPhone", "transactionId"].includes(event.target.name)) {
    setFieldError(event.target.name);
    persistSessionState();
  }
});
checkoutForm.addEventListener("change", (event) => {
  if (event.target.name === "paymentPlan") {
    renderOrderSummary();
    updateWalletDisplay();
  }
  if (event.target.name === "termsAccepted") {
    document.querySelector("#terms-error").textContent = "";
  }
  persistSessionState();
});
document.querySelectorAll("[data-wallet-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectedWallet = tab.dataset.walletTab;
    updateWalletDisplay();
    persistSessionState();
  });
});
document.querySelector("#copy-wallet-number").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const number = String((selectedWallet === "bkash" ? checkoutConfig?.bkashPersonalNumber : checkoutConfig?.nagadPersonalNumber) || "").trim();
  const originalText = "কপি";
  if (!number) {
    button.textContent = "নম্বর নেই";
    window.setTimeout(() => { button.textContent = originalText; }, 2500);
    return;
  }
  try {
    await navigator.clipboard.writeText(number);
    button.textContent = "কপি হয়েছে ✓";
  } catch (error) {
    const fallback = document.createElement("textarea");
    fallback.value = number;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    if (copied) button.textContent = "কপি হয়েছে ✓";
    else {
      console.error("Could not copy the wallet number.", error);
      button.textContent = "কপি হয়নি";
    }
  }
  window.setTimeout(() => { button.textContent = originalText; }, 2500);
});
document.querySelectorAll("[data-continue]").forEach((button) => {
  button.addEventListener("click", () => advanceStep(Number(button.dataset.continue)));
});
document.querySelectorAll("[data-go-back]").forEach((button) => {
  button.addEventListener("click", () => showStep(Number(button.dataset.goBack)));
});
document.querySelectorAll("[data-step-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.stepTab);
    if (step < currentStep) showStep(step);
  });
});
document.querySelector("#coupon-code").addEventListener("input", (event) => {
  const button = document.querySelector("#apply-coupon");
  button.disabled = !event.currentTarget.value.trim();
  if (discount && event.currentTarget.value.trim().toUpperCase() !== discount.code) {
    discount = null;
    renderOrderSummary();
  }
  const feedback = document.querySelector("#coupon-feedback");
  feedback.textContent = "";
  feedback.classList.remove("error");
  persistSessionState();
});
document.querySelector("#apply-coupon").addEventListener("click", applyCoupon);
document.querySelector("#coupon-code").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyCoupon();
  }
});
checkoutForm.addEventListener("submit", submitOrder);

loadOrderItems();
if (!orderItems.length) {
  document.querySelector(".checkout-layout").innerHTML = `<section class="order-empty"><p class="checkout-kicker">RELAXBD · CHECKOUT</p><h2>আপনার ব্যাগে কোনো পণ্য নেই।</h2><p>চেকআউট করতে প্রথমে শপ থেকে পণ্য বেছে নিন।</p><a class="primary-action" href="index.html#new-drops">শপে ফিরে যান <span aria-hidden="true">→</span></a></section>`;
} else {
  restoreSessionData();
  if (document.querySelector("#coupon-code").value.trim()) applyCoupon();
  loadStoreSettings();
}
