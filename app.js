const STORAGE_KEY = "alcool70-registros";
const DEFAULT_PUBLIC_BASE_URL = "https://lab-sobral-dev.github.io/qr_code-producao/";
const SUPABASE_URL = "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_MjALJQJiaIt-fLg-YBLWPw_XLLcbm-5";
const SUPABASE_TABLE = "alcool_registros";
const SUPABASE_PUBLIC_LOOKUP = "consultar_alcool_registro";
const MIN_EXPIRATION_DATE = "2026-01-01";
const MAX_EXPIRATION_DATE = "2100-12-31";
const MAX_TEXT_LENGTH = 120;
const MAX_NOTES_LENGTH = 500;

const state = {
  items: loadItems(),
  filter: "",
  restoreFilterAfterPrint: null,
  view: "list",
  selectedSector: "",
  selectedItemId: "",
  restoreViewAfterPrint: null,
};

const form = document.querySelector("#itemForm");
const itemId = document.querySelector("#itemId");
const tagInput = document.querySelector("#tagInput");
const addressInput = document.querySelector("#addressInput");
const areaInput = document.querySelector("#areaInput");
const expirationInput = document.querySelector("#expirationInput");
const ownerInput = document.querySelector("#ownerInput");
const solutionInput = document.querySelector("#solutionInput");
const preparationInput = document.querySelector("#preparationInput");
const prepCodeInput = document.querySelector("#prepCodeInput");
const notesInput = document.querySelector("#notesInput");
const formTitle = document.querySelector("#formTitle");
const deleteButton = document.querySelector("#deleteButton");
const clearButton = document.querySelector("#clearButton");
const newButton = document.querySelector("#newButton");
const printAllButton = document.querySelector("#printAllButton");
const searchInput = document.querySelector("#searchInput");
const sectorFilters = document.querySelector("#sectorFilters");
const itemsGrid = document.querySelector("#itemsGrid");
const controlTableBody = document.querySelector("#controlTableBody");
const tableSection = document.querySelector("#tableSection");
const emptyState = document.querySelector("#emptyState");
const itemTemplate = document.querySelector("#itemTemplate");
const listTitle = document.querySelector("#listTitle");
const tableTitle = document.querySelector("#tableTitle");
const backListButton = document.querySelector("#backListButton");
const topbar = document.querySelector("#topbar");
const dashboard = document.querySelector("#dashboard");
const publicView = document.querySelector("#publicView");

form.addEventListener("submit", handleSubmit);
deleteButton.addEventListener("click", handleDelete);
clearButton.addEventListener("click", resetForm);
newButton.addEventListener("click", resetForm);
printAllButton.addEventListener("click", printAllItems);
backListButton.addEventListener("click", navigateBack);
searchInput.addEventListener("input", (event) => {
  state.filter = event.target.value.trim().toLowerCase();
  renderItems();
});
window.addEventListener("afterprint", handleAfterPrint);

render();

async function render() {
  const publicId = new URLSearchParams(window.location.search).get("id");

  if (publicId) {
    await renderPublicView();
    return;
  }

  topbar.classList.remove("hidden");
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
    area: areaInput.value.trim(),
    expiration: expirationInput.value,
    owner: ownerInput.value.trim(),
    solution: solutionInput.value.trim(),
    preparation: preparationInput.value,
    prepCode: prepCodeInput.value.trim(),
    notes: notesInput.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  const validationError = validateRecord(record);
  if (validationError) {
    window.alert(validationError);
    return;
  }

  if (!isAllowedExpiration(record.expiration) || !isAllowedExpiration(record.preparation)) {
    window.alert("As datas devem estar entre 01/01/2026 e 31/12/2100.");
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
  const typedTag = window.prompt(`Para excluir, digite a TAG exatamente como cadastrada: ${current?.tag || ""}`);
  if (!typedTag || typedTag !== current?.tag) {
    window.alert("Exclusao cancelada. A TAG digitada nao confere.");
    return;
  }

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
  areaInput.value = item.area || "";
  expirationInput.value = item.expiration;
  ownerInput.value = item.owner || "";
  solutionInput.value = item.solution || "";
  preparationInput.value = item.preparation || "";
  prepCodeInput.value = item.prepCode || "";
  notesInput.value = item.notes || "";
  formTitle.textContent = "EDITAR FRASCO";
  deleteButton.disabled = false;
  tagInput.focus();
}

function resetForm() {
  form.reset();
  itemId.value = "";
  formTitle.textContent = "NOVO FRASCO";
  deleteButton.disabled = true;
}

function renderItems() {
  itemsGrid.innerHTML = "";
  controlTableBody.innerHTML = "";
  sectorFilters.innerHTML = "";

  if (state.view === "list") {
    renderListView();
    return;
  }

  if (state.view === "detail") {
    renderDetailView();
    return;
  }

  if (state.view === "print-all") {
    listTitle.textContent = "Todos os QR Codes";
    backListButton.classList.add("hidden");
    sectorFilters.classList.add("hidden");
    renderQrCards(getListItems());
    return;
  }

  renderListView();
}

function renderListView() {
  const items = getListItems();

  listTitle.textContent = state.selectedSector || "Todos os cadastros";
  tableTitle.textContent = state.selectedSector ? `Cadastros do setor ${state.selectedSector}` : "Todos os cadastros por validade";
  tableSection.classList.toggle("hidden", items.length === 0);
  backListButton.classList.add("hidden");
  emptyState.textContent = "Nenhum cadastro encontrado.";
  emptyState.classList.toggle("hidden", items.length > 0);
  itemsGrid.className = "items-grid hidden";
  renderSectorFilters();
  renderControlTable(items);
}

function renderSectorFilters() {
  const sectors = [...new Set(state.items.map((item) => item.address).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  sectorFilters.classList.remove("hidden");

  const allButton = createSectorFilterButton("Todos", !state.selectedSector, () => {
    state.selectedSector = "";
    renderItems();
  });
  sectorFilters.appendChild(allButton);

  sectors.forEach((sector) => {
    const button = createSectorFilterButton(sector, state.selectedSector === sector, () => {
      state.selectedSector = sector;
      renderItems();
    });
    sectorFilters.appendChild(button);
  });
}

function createSectorFilterButton(label, isActive, onClick) {
  const button = document.createElement("button");
  button.className = `sector-filter${isActive ? " active" : ""}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderDetailView() {
  const item = state.items.find((record) => record.id === state.selectedItemId);

  listTitle.textContent = item?.tag || "Recipiente";
  tableSection.classList.add("hidden");
  backListButton.classList.remove("hidden");
  sectorFilters.classList.add("hidden");
  emptyState.classList.toggle("hidden", Boolean(item));
  itemsGrid.className = "items-grid detail-grid";

  if (item) {
    renderQrCards([item]);
  }
}

function navigateBack() {
  if (state.view === "detail") {
    state.view = "list";
    state.selectedItemId = "";
    renderItems();
    return;
  }

  state.view = "list";
  state.selectedItemId = "";
  renderItems();
}

function renderControlTable(items) {
  items.forEach((item) => {
    const status = getExpirationStatus(item.expiration);
    const row = document.createElement("tr");
    row.className = "product-row";
    row.innerHTML = `
      <td><span class="table-status"></span></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    `;

    const cells = row.querySelectorAll("td");
    cells[0].title = "Abrir QR Code e detalhes";
    cells[1].textContent = item.address;
    cells[2].textContent = item.area || "-";
    cells[3].textContent = item.owner || "Nao informado";
    cells[4].textContent = item.solution || "Nao informado";
    cells[5].textContent = formatDate(item.preparation);
    cells[6].textContent = formatDate(item.expiration);
    cells[7].textContent = item.tag;
    cells[7].classList.add("recipient-cell");
    cells[7].title = "Abrir QR Code e detalhes";
    cells[8].textContent = item.prepCode || "Nao informado";

    const statusElement = row.querySelector(".table-status");
    statusElement.textContent = status.label;
    statusElement.classList.add(status.kind);

    row.addEventListener("click", () => {
      state.view = "detail";
      state.selectedItemId = item.id;
      renderItems();
    });

    controlTableBody.appendChild(row);
  });
}

function renderQrCards(items) {
  if (!itemsGrid.classList.contains("detail-grid")) {
    itemsGrid.className = "items-grid";
  }
  emptyState.classList.toggle("hidden", items.length > 0);
  tableSection.classList.add("hidden");

  items.forEach((item) => {
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    const status = getExpirationStatus(item.expiration);
    const publicUrl = getPublicUrl(item.id);

    node.dataset.itemId = item.id;
    node.querySelector("h3").textContent = item.tag;
    node.querySelector(".address").textContent = item.address;
    node.querySelector(".area").textContent = item.area || "Nao informado";
    node.querySelector(".print-label").textContent = item.area ? `${item.address} - ${item.area}` : item.address;
    node.querySelector(".solution").textContent = item.solution || "Nao informado";
    node.querySelector(".expiration").textContent = formatDate(item.expiration);
    node.querySelector(".prep-code").textContent = item.prepCode || "Nao informado";

    const pill = node.querySelector(".status-pill");
    pill.textContent = status.label;
    pill.classList.toggle("expired", status.kind === "expired");
    pill.classList.toggle("warning", status.kind === "warning");

    const qrCode = node.querySelector(".qr-code");
    qrCode.src = getQrCodeUrl(publicUrl);
    qrCode.alt = `QR Code do frasco ${item.tag}`;

    node.querySelector(".open-link").href = publicUrl;
    node.querySelector(".edit-button").addEventListener("click", () => editItem(item.id));
    node.querySelector(".print-item-button").addEventListener("click", () => printItem(item.id));

    itemsGrid.appendChild(node);
  });
}

function getFilteredItems() {
  return state.items.filter((item) => {
    const searchable = `${item.tag} ${item.address} ${item.area || ""} ${item.owner || ""} ${item.solution || ""} ${item.prepCode || ""}`.toLowerCase();
    return searchable.includes(state.filter);
  });
}

function getListItems() {
  return getFilteredItems()
    .filter((item) => !state.selectedSector || item.address === state.selectedSector)
    .sort(compareItemsByExpiration);
}

function compareItemsByExpiration(first, second) {
  const firstTime = getExpirationTime(first.expiration);
  const secondTime = getExpirationTime(second.expiration);

  if (firstTime !== secondTime) {
    return firstTime - secondTime;
  }

  return first.tag.localeCompare(second.tag, "pt-BR");
}

function getExpirationTime(dateValue) {
  const time = dateValue ? new Date(`${dateValue}T00:00:00`).getTime() : NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function printItem(id) {
  clearSelectedPrintItem();
  const selectedCard = itemsGrid.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
  if (!selectedCard) return;

  document.body.classList.add("print-selected");
  selectedCard.classList.add("print-target");
  window.print();
}

async function printAllItems() {
  clearSelectedPrintItem();
  state.restoreFilterAfterPrint = state.filter;
  state.restoreViewAfterPrint = {
    view: state.view,
    selectedSector: state.selectedSector,
    selectedItemId: state.selectedItemId,
  };
  document.body.classList.add("print-all");
  state.filter = "";
  state.view = "print-all";
  state.selectedSector = "";
  state.selectedItemId = "";
  searchInput.value = "";
  renderItems();
  await waitForQrCodes(2500);
  window.print();
}

function handleAfterPrint() {
  clearSelectedPrintItem();
  document.body.classList.remove("print-all");

  if (state.restoreFilterAfterPrint !== null) {
    state.filter = state.restoreFilterAfterPrint;
    searchInput.value = state.restoreFilterAfterPrint;
    state.restoreFilterAfterPrint = null;
  }

  if (state.restoreViewAfterPrint) {
    state.view = state.restoreViewAfterPrint.view;
    state.selectedSector = state.restoreViewAfterPrint.selectedSector;
    state.selectedItemId = state.restoreViewAfterPrint.selectedItemId;
    state.restoreViewAfterPrint = null;
  }

  renderItems();
}

function clearSelectedPrintItem() {
  document.body.classList.remove("print-selected");
  document.querySelectorAll(".print-target").forEach((element) => {
    element.classList.remove("print-target");
  });
}

function waitForQrCodes(timeoutMs) {
  const images = [...itemsGrid.querySelectorAll(".qr-code")];
  const imageLoads = images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();

    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  });

  const timeout = new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });

  return Promise.race([Promise.all(imageLoads), timeout]);
}

async function renderPublicView() {
  const params = new URLSearchParams(window.location.search);
  const item =
    (await getItemFromDatabase(params.get("id"))) ||
    state.items.find((record) => record.id === params.get("id"));

  dashboard.classList.add("hidden");
  topbar.classList.add("hidden");
  publicView.classList.remove("hidden");

  if (!item) {
    document.querySelector("#publicTag").textContent = "Registro nao encontrado";
    document.querySelector("#publicAddress").textContent = "Confira se o QR Code foi gerado neste navegador.";
    document.querySelector("#publicArea").textContent = "-";
    document.querySelector("#publicExpiration").textContent = "-";
    document.querySelector("#publicStatus").textContent = "-";
    document.querySelector("#publicOwner").textContent = "-";
    document.querySelector("#publicSolution").textContent = "-";
    document.querySelector("#publicPreparation").textContent = "-";
    document.querySelector("#publicPrepCode").textContent = "-";
    document.querySelector("#publicNotes").textContent = "";
    return;
  }

  const status = getExpirationStatus(item.expiration);
  document.querySelector("#publicTag").textContent = item.tag;
  document.querySelector("#publicAddress").textContent = item.address;
  document.querySelector("#publicArea").textContent = item.area || "Nao informado";
  document.querySelector("#publicExpiration").textContent = formatDate(item.expiration);
  document.querySelector("#publicStatus").textContent = status.label;
  document.querySelector("#publicOwner").textContent = item.owner || "Nao informado";
  document.querySelector("#publicSolution").textContent = item.solution || "Nao informado";
  document.querySelector("#publicPreparation").textContent = formatDate(item.preparation);
  document.querySelector("#publicPrepCode").textContent = item.prepCode || "Nao informado";
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

  if (diffDays === 0) {
    return { kind: "warning", label: "Vence hoje" };
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
    return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(normalizeLocalItem);
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

function validateRecord(record) {
  const requiredFields = [
    ["TAG Borrifador", record.tag],
    ["Setor", record.address],
    ["Área", record.area],
    ["Nome da solução atual", record.solution],
    ["Data do preparo", record.preparation],
    ["Data de validade", record.expiration],
    ["Código do preparo", record.prepCode],
  ];

  const missingField = requiredFields.find(([, value]) => !value);
  if (missingField) return `Preencha o campo ${missingField[0]}.`;

  const textFields = [record.tag, record.address, record.area, record.owner, record.solution, record.prepCode];
  if (textFields.some((value) => value && value.length > MAX_TEXT_LENGTH)) {
    return `Os campos de texto devem ter no maximo ${MAX_TEXT_LENGTH} caracteres.`;
  }

  if (record.notes && record.notes.length > MAX_NOTES_LENGTH) {
    return `As observacoes devem ter no maximo ${MAX_NOTES_LENGTH} caracteres.`;
  }

  if (record.preparation > record.expiration) {
    return "A data do preparo nao pode ser posterior a data de validade.";
  }

  return "";
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
    const rows = await supabaseRequest(`rpc/${SUPABASE_PUBLIC_LOOKUP}`, {
      method: "POST",
      body: JSON.stringify({ registro_id: id }),
    });
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
    observacoes: JSON.stringify({
      area: item.area || "",
      solution: item.solution || "",
      preparation: item.preparation || "",
      prepCode: item.prepCode || "",
      notes: item.notes || "",
    }),
    atualizado_em: new Date().toISOString(),
  };

  if (includeId && item.id) {
    payload.id = item.id;
  }

  return payload;
}

function fromDatabaseItem(row) {
  const details = parseDetails(row.observacoes);
  const location = splitLegacyLocation(row.endereco, details.area);

  return {
    id: row.id,
    tag: row.tag,
    address: location.address,
    area: location.area,
    expiration: row.validade,
    owner: row.responsavel || "",
    solution: details.solution,
    preparation: details.preparation,
    prepCode: details.prepCode,
    notes: details.notes,
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

function parseDetails(value) {
  if (!value) {
    return { area: "", solution: "", preparation: "", prepCode: "", notes: "" };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      area: parsed.area || "",
      solution: parsed.solution || "",
      preparation: parsed.preparation || "",
      prepCode: parsed.prepCode || "",
      notes: parsed.notes || "",
    };
  } catch {
    return { area: "", solution: "", preparation: "", prepCode: "", notes: value };
  }
}

function splitLegacyLocation(address, area) {
  const safeAddress = address || "";
  const safeArea = area || "";

  if (safeArea || !safeAddress.includes("/")) {
    return { address: safeAddress, area: safeArea };
  }

  const [legacyAddress, ...legacyArea] = safeAddress.split("/");
  return {
    address: legacyAddress.trim(),
    area: legacyArea.join("/").trim(),
  };
}

function normalizeLocalItem(item) {
  const location = splitLegacyLocation(item.address || "", item.area || "");
  return {
    ...item,
    address: location.address,
    area: location.area,
  };
}
