const STORAGE_KEY = "alcool70-registros";
const DEFAULT_PUBLIC_BASE_URL = "https://lab-sobral-dev.github.io/qr_code-producao/";

const state = {
  items: loadItems(),
  filter: "",
};

const form = document.querySelector("#itemForm");
const itemId = document.querySelector("#itemId");
const tagInput = document.querySelector("#tagInput");
const addressInput = document.querySelector("#addressInput");
const expirationInput = document.querySelector("#expirationInput");
const ownerInput = document.querySelector("#ownerInput");
const notesInput = document.querySelector("#notesInput");
const formTitle = document.querySelector("#formTitle");
const deleteButton = document.querySelector("#deleteButton");
const clearButton = document.querySelector("#clearButton");
const newButton = document.querySelector("#newButton");
const searchInput = document.querySelector("#searchInput");
const itemsGrid = document.querySelector("#itemsGrid");
const emptyState = document.querySelector("#emptyState");
const itemTemplate = document.querySelector("#itemTemplate");
const dashboard = document.querySelector("#dashboard");
const publicView = document.querySelector("#publicView");

form.addEventListener("submit", handleSubmit);
deleteButton.addEventListener("click", handleDelete);
clearButton.addEventListener("click", resetForm);
newButton.addEventListener("click", resetForm);
searchInput.addEventListener("input", (event) => {
  state.filter = event.target.value.trim().toLowerCase();
  renderItems();
});
window.addEventListener("afterprint", clearSelectedPrintItem);

render();

function render() {
  const publicId = new URLSearchParams(window.location.search).get("id");

  if (publicId) {
    renderPublicView();
    return;
  }

  dashboard.classList.remove("hidden");
  publicView.classList.add("hidden");
  renderItems();
}

function handleSubmit(event) {
  event.preventDefault();

  const record = {
    id: itemId.value || crypto.randomUUID(),
    tag: tagInput.value.trim(),
    address: addressInput.value.trim(),
    expiration: expirationInput.value,
    owner: ownerInput.value.trim(),
    notes: notesInput.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  const currentIndex = state.items.findIndex((item) => item.id === record.id);
  if (currentIndex >= 0) {
    state.items[currentIndex] = record;
  } else {
    state.items.unshift(record);
  }

  saveItems();
  resetForm();
  renderItems();
}

function handleDelete() {
  if (!itemId.value) return;

  const current = state.items.find((item) => item.id === itemId.value);
  const confirmed = window.confirm(`Excluir o registro ${current?.tag || ""}?`);
  if (!confirmed) return;

  state.items = state.items.filter((item) => item.id !== itemId.value);
  saveItems();
  resetForm();
  renderItems();
}

function editItem(id) {
  const item = state.items.find((record) => record.id === id);
  if (!item) return;

  itemId.value = item.id;
  tagInput.value = item.tag;
  addressInput.value = item.address;
  expirationInput.value = item.expiration;
  ownerInput.value = item.owner || "";
  notesInput.value = item.notes || "";
  formTitle.textContent = "Editar vidro";
  deleteButton.disabled = false;
  tagInput.focus();
}

function resetForm() {
  form.reset();
  itemId.value = "";
  formTitle.textContent = "Novo vidro";
  deleteButton.disabled = true;
}

function renderItems() {
  const filteredItems = state.items.filter((item) => {
    const searchable = `${item.tag} ${item.address} ${item.owner || ""}`.toLowerCase();
    return searchable.includes(state.filter);
  });

  itemsGrid.innerHTML = "";
  emptyState.classList.toggle("hidden", filteredItems.length > 0);

  filteredItems.forEach((item) => {
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    const status = getExpirationStatus(item.expiration);
    const publicUrl = getPublicUrl(item.id);

    node.dataset.itemId = item.id;
    node.querySelector("h3").textContent = item.tag;
    node.querySelector(".address").textContent = item.address;
    node.querySelector(".expiration").textContent = formatDate(item.expiration);

    const pill = node.querySelector(".status-pill");
    pill.textContent = status.label;
    pill.classList.toggle("expired", status.kind === "expired");
    pill.classList.toggle("warning", status.kind === "warning");

    const qrCode = node.querySelector(".qr-code");
    qrCode.src = getQrCodeUrl(publicUrl);
    qrCode.alt = `QR Code para ${item.tag}`;

    node.querySelector(".open-link").href = publicUrl;
    node.querySelector(".edit-button").addEventListener("click", () => editItem(item.id));
    node.querySelector(".print-item-button").addEventListener("click", () => printItem(item.id));

    itemsGrid.appendChild(node);
  });
}

function printItem(id) {
  clearSelectedPrintItem();
  const selectedCard = itemsGrid.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
  if (!selectedCard) return;

  document.body.classList.add("print-selected");
  selectedCard.classList.add("print-target");
  window.print();
}

function clearSelectedPrintItem() {
  document.body.classList.remove("print-selected");
  document.querySelectorAll(".print-target").forEach((element) => {
    element.classList.remove("print-target");
  });
}

function renderPublicView() {
  const params = new URLSearchParams(window.location.search);
  const item = getItemFromParams(params) || state.items.find((record) => record.id === params.get("id"));

  dashboard.classList.add("hidden");
  publicView.classList.remove("hidden");

  if (!item) {
    document.querySelector("#publicTag").textContent = "Registro nao encontrado";
    document.querySelector("#publicAddress").textContent = "Confira se o QR Code foi gerado neste navegador.";
    document.querySelector("#publicExpiration").textContent = "-";
    document.querySelector("#publicStatus").textContent = "-";
    document.querySelector("#publicOwner").textContent = "-";
    document.querySelector("#publicNotes").textContent = "";
    return;
  }

  const status = getExpirationStatus(item.expiration);
  document.querySelector("#publicTag").textContent = item.tag;
  document.querySelector("#publicAddress").textContent = item.address;
  document.querySelector("#publicExpiration").textContent = formatDate(item.expiration);
  document.querySelector("#publicStatus").textContent = status.label;
  document.querySelector("#publicOwner").textContent = item.owner || "Nao informado";
  document.querySelector("#publicNotes").textContent = item.notes || "";
}

function getExpirationStatus(dateValue) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiration = new Date(`${dateValue}T00:00:00`);
  const diffDays = Math.ceil((expiration - today) / 86400000);

  if (diffDays < 0) {
    return { kind: "expired", label: "Vencido" };
  }

  if (diffDays <= 30) {
    return { kind: "warning", label: `Vence em ${diffDays} dia${diffDays === 1 ? "" : "s"}` };
  }

  return { kind: "ok", label: "Dentro da validade" };
}

function getPublicUrl(id) {
  const item = state.items.find((record) => record.id === id);
  const baseUrl = window.location.protocol === "file:" ? DEFAULT_PUBLIC_BASE_URL : window.location.href;
  const url = new URL(baseUrl);
  url.search = "";

  if (!item) {
    url.searchParams.set("id", id);
    return url.toString();
  }

  url.searchParams.set("id", item.id);
  url.searchParams.set("tag", item.tag);
  url.searchParams.set("endereco", item.address);
  url.searchParams.set("validade", item.expiration);

  if (item.owner) url.searchParams.set("responsavel", item.owner);
  if (item.notes) url.searchParams.set("obs", item.notes);

  return url.toString();
}

function getQrCodeUrl(value) {
  const encodedValue = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodedValue}`;
}

function formatDate(dateValue) {
  if (!dateValue) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${dateValue}T00:00:00Z`));
}

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function getItemFromParams(params) {
  const tag = params.get("tag");
  const address = params.get("endereco");
  const expiration = params.get("validade");

  if (!tag || !address || !expiration) return null;

  return {
    id: params.get("id") || "",
    tag,
    address,
    expiration,
    owner: params.get("responsavel") || "",
    notes: params.get("obs") || "",
  };
}
