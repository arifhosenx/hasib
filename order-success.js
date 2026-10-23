const successStorageKey = "relaxbd-order-success";
const successData = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(successStorageKey) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch (error) {
    console.error("Could not load the successful order summary.", error);
    return null;
  }
})();

if (!successData?.orderNumber) {
  document.querySelector("#order-success").innerHTML = `
    <p class="checkout-kicker">RELAXBD · CHECKOUT</p>
    <h1>অর্ডারের তথ্য পাওয়া যায়নি।</h1>
    <p>চেকআউট থেকে অর্ডার নিশ্চিত করে আবার এই পেজে আসুন।</p>
    <a class="primary-action" href="index.html">শপে ফিরে যান <span aria-hidden="true">→</span></a>`;
} else {
  const price = (amount) => `৳${Number(amount || 0).toLocaleString("en-BD")}`;
  document.querySelector("#success-order-number").textContent = successData.orderNumber;
  document.querySelector("#success-order-items").replaceChildren(...(Array.isArray(successData.items) ? successData.items : []).map((item) => {
    const row = document.createElement("article");
    const title = document.createElement("strong");
    const details = document.createElement("span");
    const amount = document.createElement("strong");
    title.textContent = item.name;
    details.textContent = `সাইজ ${item.size || "—"} · ${item.quantity} টি`;
    amount.textContent = price(Number(item.unitPrice) * Number(item.quantity));
    row.append(title, details, amount);
    return row;
  }));
  document.querySelector("#success-subtotal").textContent = price(successData.subtotal);
  document.querySelector("#success-discount").textContent = `−${price(successData.discount)}`;
  document.querySelector("#success-shipping").textContent = price(successData.shipping);
  document.querySelector("#success-total").textContent = price(successData.total);
  document.querySelector("#success-advance").textContent = price(successData.advance);
  document.querySelector("#success-due").textContent = price(successData.cashDue);
  document.querySelector("#success-payment-status").textContent = successData.paymentStatus;
  document.querySelector("#success-address").textContent = successData.address;
}
