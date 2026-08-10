const SUPABASE_URL = "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_MjALJQJiaIt-fLg-YBLWPw_XLLcbm-5";
const SUPABASE_TABLE = "alcool_registros";

renderReadOnlyView();

async function renderReadOnlyView() {
  const params = new URLSearchParams(window.location.search);
  const item = getItemFromParams(params) || (await getItemFromDatabase(params.get("id")));

  if (!item) {
    setText("#publicTag", "Registro nao encontrado");
    setText("#publicAddress", "Confira se o QR Code esta correto.");
    setText("#publicExpiration", "-");
    setText("#publicStatus", "-");
    setText("#publicOwner", "-");
    setText("#publicNotes", "");
    return;
  }

  const status = getExpirationStatus(item.expiration);
  setText("#publicTag", item.tag);
  setText("#publicAddress", item.address);
  setText("#publicExpiration", formatDate(item.expiration));
  setText("#publicStatus", status.label);
  setText("#publicOwner", item.owner || "Nao informado");
  setText("#publicNotes", item.notes || "");
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

async function supabaseRequest(endpoint) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) return [];
  return response.json();
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

function fromDatabaseItem(row) {
  return {
    id: row.id,
    tag: row.tag,
    address: row.endereco,
    expiration: row.validade,
    owner: row.responsavel || "",
    notes: row.observacoes || "",
  };
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

function formatDate(dateValue) {
  if (!dateValue) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${dateValue}T00:00:00Z`));
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}
