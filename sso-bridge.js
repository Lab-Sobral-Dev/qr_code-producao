// Ponte de SSO: troca o hashed_token de uso unico (gerado pelo backend via
// supabase.auth.admin.generateLink) por uma sessao real do Supabase Auth.
//
// Nota: app.js e consulta.js NAO usam o SDK @supabase/supabase-js -- eles
// falam direto com a API REST do Supabase (fetch) e guardam a sessao em
// localStorage sob a chave "alcool70-supabase-session", no formato definido
// por normalizeSession()/saveSession() em app.js. Para a sessao criada aqui
// ser reconhecida por app.js, esta ponte segue exatamente o mesmo caminho
// (fetch em /auth/v1/verify + mesmo formato de sessao), em vez de carregar o
// SDK supabase-js, que gravaria a sessao sob uma chave diferente.
const SESSION_KEY = "alcool70-supabase-session";
const SUPABASE_URL = "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_KEY = "sb_publishable_MjALJQJiaIt-fLg-YBLWPw_XLLcbm-5";

const mensagemEl = document.querySelector("#mensagem");

function mostrarErro(texto) {
  mensagemEl.textContent = texto;
  mensagemEl.classList.add("erro");
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

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function entrar() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");
  const token = params.get("token");

  if (!email || !token) {
    mostrarErro("Link de acesso invalido: faltam parametros.");
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email, token }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || !data.access_token) {
      const detalhe = (data && (data.error_description || data.msg || data.message)) || `Erro HTTP ${response.status}`;
      mostrarErro(`Nao foi possivel entrar: ${detalhe}`);
      return;
    }

    saveSession(normalizeSession(data));
    window.location.replace("/index.html");
  } catch (error) {
    mostrarErro("Nao foi possivel entrar: falha de conexao com o Supabase.");
  }
}

entrar();
