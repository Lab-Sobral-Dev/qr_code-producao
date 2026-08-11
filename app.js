const STORAGE_KEY = "alcool70-registros";
const SESSION_KEY = "alcool70-supabase-session";
const DEFAULT_PUBLIC_BASE_URL = "https://lab-sobral-dev.github.io/qr_code-producao/";
const SUPABASE_URL = "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_MjALJQJiaIt-fLg-YBLWPw_XLLcbm-5";
const SUPABASE_TABLE = "alcool_registros";
const SUPABASE_AUDIT_TABLE = "alcool_registros_historico";
const SUPABASE_PROFILE_TABLE = "app_perfis_usuarios";
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
  session: loadSession(),
  mustChangePassword: false,
  isAdmin: false,
};

const authView = document.querySelector("#authView");
const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const authError = document.querySelector("#authError");
const passwordView = document.querySelector("#passwordView");
const passwordForm = document.querySelector("#passwordForm");
const newPasswordInput = document.querySelector("#newPasswordInput");
const confirmPasswordInput = document.querySelector("#confirmPasswordInput");
const passwordError = document.querySelector("#passwordError");
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
const historyButton = document.querySelector("#historyButton");
const logoutButton = document.querySelector("#logoutButton");
const closeHistoryButton = document.querySelector("#closeHistoryButton");
const sessionUser = document.querySelector("#sessionUser");
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
const historyPanel = document.querySelector("#historyPanel");
const historyTableBody = document.querySelector("#historyTableBody");

loginForm.addEventListener("submit", handleLogin);
passwordForm.addEventListener("submit", handlePasswordChange);
form.addEventListener("submit", handleSubmit);
deleteButton.addEventListener("click", handleDelete);
clearButton.addEventListener("click", resetForm);
newButton.addEventListener("click", resetForm);
printAllButton.addEventListener("click", printAllItems);
historyButton.addEventListener("click", showHistory);
logoutButton.addEventListener("click", handleLogout);
closeHistoryButton.addEventListener("click", hideHistory);
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

  if (!state.session) {
    renderLoginView();
    return;
  }

  if (await getMustChangePassword()) {
    renderPasswordChangeView();
    return;
  }

  await refreshAdminState();
  renderAdminView();
  await refreshItemsFromDatabase();
}

async function handleLogin(event) {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  setAuthError("");
  setAuthButtonsEnabled(false);

  try {
    const validationError = validateAuthFields(email, password);
    if (validationError) {
      setAuthError(validationError);
      return;
    }

    await completeLogin(email, password);
  } catch (error) {
    setAuthError(error.message || "Nao foi possivel entrar.");
  } finally {
    setAuthButtonsEnabled(true);
  }
}

function validateAuthFields(email, password) {
  if (!email) return "Informe o e-mail.";
  if (!email.includes("@")) return "Informe um e-mail válido.";
  if (!password) return "Informe a senha.";
  if (password.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
  return "";
}

async function completeLogin(email, password) {
  state.session = await signInWithPassword(email, password);
  saveSession(state.session);
  passwordInput.value = "";
  await refreshAdminState();
  if (await getMustChangePassword()) {
    renderPasswordChangeView();
    return;
  }

  renderAdminView();
  await refreshItemsFromDatabase();
}

async function handlePasswordChange(event) {
  event.preventDefault();
  setPasswordError("");
  setPasswordButtonsEnabled(false);

  try {
    const validationError = validateNewPassword(newPasswordInput.value, confirmPasswordInput.value);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    await updateOwnPassword(newPasswordInput.value);
    await markPasswordChanged();
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
    state.mustChangePassword = false;
    renderAdminView();
    await refreshItemsFromDatabase();
  } catch (error) {
    setPasswordError(error.message || "Nao foi possivel alterar a senha.");
  } finally {
    setPasswordButtonsEnabled(true);
  }
}

function validateNewPassword(password, confirmation) {
  if (!password) return "Informe a nova senha.";
  if (password.length < 6) return "A nova senha deve ter pelo menos 6 caracteres.";
  if (password !== confirmation) return "As senhas informadas nao conferem.";
  return "";
}

async function handleLogout() {
  try {
    if (state.session?.access_token) {
      await supabaseAuthRequest("logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.session.access_token}`,
        },
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    state.session = null;
    state.mustChangePassword = false;
    state.isAdmin = false;
    saveSession(null);
    state.items = [];
    saveItems();
    renderLoginView();
  }
}

function setAuthError(message) {
  authError.textContent = message;
  authError.classList.toggle("hidden", !message);
}

function setAuthButtonsEnabled(enabled) {
  loginForm.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
}

function getSessionUserLabel() {
  return state.session?.user?.email || state.session?.user?.id || "";
}

function renderLoginView() {
  authView.classList.remove("hidden");
  passwordView.classList.add("hidden");
  topbar.classList.add("hidden");
  dashboard.classList.add("hidden");
  publicView.classList.add("hidden");
  historyPanel.classList.add("hidden");
  emailInput.focus();
}

function renderPasswordChangeView() {
  authView.classList.add("hidden");
  passwordView.classList.remove("hidden");
  topbar.classList.add("hidden");
  dashboard.classList.add("hidden");
  publicView.classList.add("hidden");
  historyPanel.classList.add("hidden");
  newPasswordInput.focus();
}

function renderAdminView() {
  authView.classList.add("hidden");
  passwordView.classList.add("hidden");
  topbar.classList.remove("hidden");
  dashboard.classList.remove("hidden");
  publicView.classList.add("hidden");
  sessionUser.textContent = state.isAdmin ? getSessionUserLabel() : "";
  sessionUser.classList.toggle("hidden", !state.isAdmin);
  historyButton.classList.toggle("hidden", !state.isAdmin);
  historyPanel.classList.add("hidden");
  renderItems();
}

function setPasswordError(message) {
  passwordError.textContent = message;
  passwordError.classList.toggle("hidden", !message);
}

function setPasswordButtonsEnabled(enabled) {
  passwordForm.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
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
  const sectors = [...new Set(state.items.map((item) => getSectorFilterLabel(item.address)).filter(Boolean))].sort((a, b) =>
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

async function showHistory() {
  if (!state.isAdmin && !(await refreshAdminState())) {
    historyPanel.classList.add("hidden");
    return;
  }

  historyPanel.classList.remove("hidden");
  historyTableBody.innerHTML = `<tr><td colspan="5">Carregando histórico...</td></tr>`;

  try {
    const rows = await supabaseRequest(
      `${SUPABASE_AUDIT_TABLE}?select=*&order=alterado_em.desc&limit=100`
    );
    renderHistoryRows(rows);
  } catch (error) {
    historyTableBody.innerHTML = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = `Histórico restrito ao administrador. ${error.message}`;
    row.appendChild(cell);
    historyTableBody.appendChild(row);
  }
}

function hideHistory() {
  historyPanel.classList.add("hidden");
}

function renderHistoryRows(rows) {
  historyTableBody.innerHTML = "";

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "Nenhuma alteração registrada.";
    row.appendChild(cell);
    historyTableBody.appendChild(row);
    return;
  }

  rows.forEach((entry) => {
    const row = document.createElement("tr");
    const cells = [formatDateTime(entry.alterado_em), formatAuditAction(entry.acao), entry.tag || "-", entry.usuario_email || entry.usuario_id || "-", getAuditSummary(entry)];

    cells.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    historyTableBody.appendChild(row);
  });
}

function formatAuditAction(action) {
  const labels = {
    INSERT: "Criação",
    UPDATE: "Edição",
    DELETE: "Exclusão",
  };
  return labels[action] || action || "-";
}

function getAuditSummary(entry) {
  if (entry.acao === "INSERT") return "Cadastro criado";
  if (entry.acao === "DELETE") return "Cadastro excluído";

  const oldRecord = entry.valor_antigo || {};
  const newRecord = entry.valor_novo || {};
  const changedFields = Object.keys(newRecord).filter((key) => JSON.stringify(oldRecord[key]) !== JSON.stringify(newRecord[key]));

  if (!changedFields.length) return "Sem alteração de campos";
  return `Campos alterados: ${changedFields.join(", ")}`;
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
    .filter((item) => !state.selectedSector || getSectorFilterLabel(item.address) === state.selectedSector)
    .sort(compareItemsByExpiration);
}

function getSectorFilterLabel(address) {
  const sector = address || "";
  return sector.toLowerCase().includes("produção") || sector.toLowerCase().includes("producao") ? "Produção" : sector;
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
  authView.classList.add("hidden");
  passwordView.classList.add("hidden");
  historyPanel.classList.add("hidden");
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

function formatDateTime(dateValue) {
  if (!dateValue) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(dateValue));
}

function loadItems() {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(normalizeLocalItem);
  } catch {
    return [];
  }
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function normalizeSession(session) {
  const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: expiresAt,
    user: session.user || null,
  };
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
      publicAccess: true,
    });
    return rows[0] ? fromDatabaseItem(rows[0]) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function getMustChangePassword() {
  const profile = await getOrCreateUserProfile();
  state.mustChangePassword = Boolean(profile?.deve_trocar_senha);
  return state.mustChangePassword;
}

async function getOrCreateUserProfile() {
  const userId = state.session?.user?.id;
  const email = state.session?.user?.email || "";

  if (!userId) {
    throw new Error("Sessao sem usuario valido.");
  }

  const rows = await supabaseRequest(`${SUPABASE_PROFILE_TABLE}?usuario_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  if (rows[0]) return rows[0];

  const createdRows = await supabaseRequest(`${SUPABASE_PROFILE_TABLE}?select=*`, {
    method: "POST",
    body: JSON.stringify({
      usuario_id: userId,
      email,
      deve_trocar_senha: true,
    }),
    headers: {
      Prefer: "return=representation",
    },
  });

  return createdRows[0];
}

async function updateOwnPassword(password) {
  await supabaseAuthRequest("user", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${await getValidAccessToken()}`,
    },
    body: JSON.stringify({ password }),
  });
}

async function markPasswordChanged() {
  const userId = state.session?.user?.id;
  await supabaseRequest(`${SUPABASE_PROFILE_TABLE}?usuario_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      deve_trocar_senha: false,
      atualizado_em: new Date().toISOString(),
    }),
  });
}

async function refreshAdminState() {
  const userId = state.session?.user?.id;

  if (!userId) {
    state.isAdmin = false;
    return false;
  }

  try {
    const rows = await supabaseRequest(`app_administradores?usuario_id=eq.${encodeURIComponent(userId)}&ativo=eq.true&select=usuario_id&limit=1`);
    state.isAdmin = Boolean(rows[0]);
  } catch (error) {
    console.error(error);
    state.isAdmin = false;
  }

  return state.isAdmin;
}

async function signInWithPassword(email, password) {
  const session = await supabaseAuthRequest("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return normalizeSession(session);
}

async function getValidAccessToken() {
  if (!state.session?.access_token) {
    throw new Error("Sessao expirada. Entre novamente.");
  }

  const expiresAt = state.session.expires_at || 0;
  const shouldRefresh = expiresAt && Date.now() / 1000 > expiresAt - 60;
  if (!shouldRefresh) {
    return state.session.access_token;
  }

  try {
    const refreshedSession = await supabaseAuthRequest("token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: state.session.refresh_token }),
    });
    state.session = normalizeSession(refreshedSession);
    saveSession(state.session);
    await refreshAdminState();
    sessionUser.textContent = state.isAdmin ? getSessionUserLabel() : "";
    sessionUser.classList.toggle("hidden", !state.isAdmin);
    historyButton.classList.toggle("hidden", !state.isAdmin);
    return state.session.access_token;
  } catch (error) {
    state.session = null;
    saveSession(null);
    renderLoginView();
    throw error;
  }
}

async function supabaseAuthRequest(endpoint, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error_description || details?.msg || details?.message || `Erro HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function supabaseRequest(endpoint, options = {}) {
  const { publicAccess, ...requestOptions } = options;
  const accessToken = publicAccess ? SUPABASE_KEY : await getValidAccessToken();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...requestOptions,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(requestOptions.headers || {}),
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
