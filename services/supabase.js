// ================================================
// SUPABASE.JS — Inicialização do cliente Supabase
// ================================================

// Carrega o Supabase via CDN global (sem import/export)
const { createClient } = supabase;

const SUPABASE_URL = 'https://twvdqbfzsdgajugkfmvr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3dmRxYmZ6c2RnYWp1Z2tmbXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NTAyMTIsImV4cCI6MjEwMDMyNjIxMn0.lcGkQQL1ckJnpwbbTSvuMPSThyP2hJg5GHjhY9wB5PI';

// ─────────────────────────────────────────────────────────────
// COMPORTAMENTO DE SESSÃO
// ─────────────────────────────────────────────────────────────
// persistSession: true  → o Supabase ainda gerencia o token internamente,
//                         mas usamos sessionStorage como storage.
//
// storage: sessionStorage → a sessão sobrevive apenas enquanto a aba/janela
//                           do navegador permanecer aberta.
//                           Fechar e reabrir o navegador (ou a aba) limpa
//                           o sessionStorage automaticamente, fazendo o
//                           getSession() retornar null e exigindo novo login.
//                           Um simples reload/F5 preserva o sessionStorage,
//                           então a navegação normal não é interrompida.
//
// autoRefreshToken: true → mantido para que o token não expire no meio
//                          de uma sessão ativa (enquanto a aba está aberta).
//
// detectSessionInUrl: true → necessário para o fluxo de recuperação de senha
//                            (link enviado por e-mail contém token na URL).
// ─────────────────────────────────────────────────────────────
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    detectSessionInUrl: true,
    autoRefreshToken:  true,
    storage:           window.sessionStorage,
  }
});

// Limpa qualquer token residual que ainda possa existir no localStorage
// (de versões anteriores que usavam localStorage como storage).
// Executa uma única vez e remove as chaves do Supabase salvas lá.
(function limparLocalStorageLegado() {
  try {
    const keysParaRemover = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        keysParaRemover.push(key);
      }
    }
    keysParaRemover.forEach(k => window.localStorage.removeItem(k));
  } catch (_) {
    // localStorage indisponível em alguns contextos — sem problema
  }
})();