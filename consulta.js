const SUPABASE_URL = "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_MjALJQJiaIt-fLg-YBLWPw_XLLcbm-5";
const SUPABASE_PUBLIC_LOOKUP = "consultar_alcool_registro";

renderReadOnlyView();

async function renderReadOnlyView() {
  const params = new URLSearchParams(window.location.search);
  const item = await getItemFromDatabase(params.get("id"));

  if (!item) {
    setText("#publicTag", "Registro nao encontrado");
    setText("#publicAddress", "Confira se o QR Code esta correto.");
    setText("#publicArea", "-");
    setText("#publicExpiration", "-");
    setText("#publicStatus", "-");
    setText("#publicOwner", "-");
    setText("#publicSolution", "-");
    setText("#publicPreparation", "-");
    setText("#publicPrepCode", "-");
    setText("#publicNotes", "");
    return;
  }

  const status = getExpirationStatus(item.expiration);
  setText("#publicTag", item.tag);
  setText("#publicAddress", item.address);
  setText("#publicArea", item.area || "Nao informado");
  setText("#publicExpiration", formatDate(item.expiration));
  setText("#publicStatus", status.label);
  setText("#publicOwner", item.owner || "Nao informado");
  setText("#publicSolution", item.solution || "Nao informado");
  setText("#publicPreparation", formatDate(item.preparation));
  setText("#publicPrepCode", item.prepCode || "Nao informado");
  setText("#publicNotes", item.notes || "");
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

  if (!response.ok) return [];
  return response.json();
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

  if (diffDays === 0) {
    return { kind: "warning", label: "Vence hoje" };
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
