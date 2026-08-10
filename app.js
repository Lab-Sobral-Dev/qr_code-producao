const STORAGE_KEY = "alcool70-registros";
const DEFAULT_PUBLIC_BASE_URL = "https://lab-sobral-dev.github.io/qr_code-producao/";
const SUPABASE_URL = "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_MjALJQJiaIt-fLg-YBLWPw_XLLcbm-5";
const SUPABASE_TABLE = "alcool_registros";
const MIN_EXPIRATION_DATE = "2026-01-01";
const MAX_EXPIRATION_DATE = "2100-12-31";

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

async function render() {
  const publicId = new URLSearchParams(window.location.search).get("id");

  if (publicId) {
    await renderPublicView();
    return;
  }

  dashboard.classList.remove("hidden");
  publicView.classList.add("hidden");
  renderItems();
  await refreshItemsFromDatabase();
}

async function handleSubmit(event) {
  event.preventDefault();

  const record = {
    id: itemId.value,
    tag: tagInput.value.trim(),
    address: addressInput.value.trim(),
    expiration: expirationInput.value,
    owner: ownerInput.value.trim(),
    notes: notesInput.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  if (!isAllowedExpiration(record.expiration)) {
    window.alert("A validade deve estar entre 01/01/2026 e 31/12/2100.");
    return;
  }

  setFormEnabled(false);

  try {
    const savedRecord = await saveItemToDatabase(record);
    upsertLocalItem(savedRecord);
    saveItems();
    resetForm();
    renderItems();
  } catch (error) {
    window.alert(`Nao foi possivel salvar no banco de dados. ${error.message}`);
  } finally {
    setFormEnabled(true);
  }
}

async function handleDelete() {
  if (!itemId.value) return;

  const current = state.items.find((item) => item.id === itemId.value);
  const confirmed = window.confirm(`Excluir o registro ${current?.tag || ""}?`);
  if (!confirmed) return;

  setFormEnabled(false);

  try {
    await deleteItemFromDatabase(itemId.value);
    state.items = state.items.filter((item) => item.id !== itemId.value);
    saveItems();
    resetForm();
    renderItems();
  } catch (error) {
    window.alert(`Nao foi possivel excluir no banco de dados. ${error.message}`);
  } finally {
    setFormEnabled(true);
  }
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

async function renderPublicView() {
  const params = new URLSearchParams(window.location.search);
  const item =
    getItemFromParams(params) ||
    state.items.find((record) => record.id === params.get("id")) ||
    (await getItemFromDatabase(params.get("id")));

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
  url.pathname = `${url.pathname.replace(/\/[^/]*$/, "/")}consulta.html`;
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

function isAllowedExpiration(dateValue) {
  return Boolean(dateValue && dateValue >= MIN_EXPIRATION_DATE && dateValue <= MAX_EXPIRATION_DATE);
}

async function refreshItemsFromDatabase() {
  try {
    const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=*&order=criado_em.desc`);
    state.items = rows.map(fromDatabaseItem);
    saveItems();
    renderItems();
  } catch (error) {
    console.error(error);
    renderItems();
  }
}

async function saveItemToDatabase(item) {
  const payload = toDatabaseItem(item);
  const isUpdate = Boolean(item.id);
  const endpoint = isUpdate ? `${SUPABASE_TABLE}?id=eq.${encodeURIComponent(item.id)}&select=*` : `${SUPABASE_TABLE}?select=*`;
  const method = isUpdate ? "PATCH" : "POST";
  const rows = await supabaseRequest(endpoint, {
    method,
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=representation",
    },
  });

  if (!rows[0] && isUpdate) {
    return createItemInDatabase(item);
  }

  if (!rows[0]) {
    throw new Error("O banco nao retornou o cadastro salvo.");
  }

  return fromDatabaseItem(rows[0]);
}

async function createItemInDatabase(item) {
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=*`, {
    method: "POST",
    body: JSON.stringify(toDatabaseItem(item, true)),
    headers: {
      Prefer: "return=representation",
    },
  });

  if (!rows[0]) {
    throw new Error("O banco nao retornou o cadastro criado.");
  }

  return fromDatabaseItem(rows[0]);
}

async function deleteItemFromDatabase(id) {
  await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

async function getItemFromDatabase(id) {
  if (!id) return null;

  try {
    const rows = await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return rows[0] ? fromDatabaseItem(rows[0]) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function supabaseRequest(endpoint, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Erro HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function toDatabaseItem(item, includeId = false) {
  const payload = {
    tag: item.tag,
    endereco: item.address,
    validade: item.expiration,
    responsavel: item.owner || null,
    observacoes: item.notes || null,
    atualizado_em: new Date().toISOString(),
  };

  if (includeId && item.id) {
    payload.id = item.id;
  }

  return payload;
}

function fromDatabaseItem(row) {
  return {
    id: row.id,
    tag: row.tag,
    address: row.endereco,
    expiration: row.validade,
    owner: row.responsavel || "",
    notes: row.observacoes || "",
    updatedAt: row.atualizado_em || row.criado_em || "",
  };
}

function upsertLocalItem(item) {
  const currentIndex = state.items.findIndex((record) => record.id === item.id);
  if (currentIndex >= 0) {
    state.items[currentIndex] = item;
  } else {
    state.items.unshift(item);
  }
}

function setFormEnabled(enabled) {
  form.querySelectorAll("button, input, textarea").forEach((field) => {
    field.disabled = !enabled;
  });
  deleteButton.disabled = enabled ? !itemId.value : true;
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
