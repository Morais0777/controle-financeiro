// ================================================
// SUPABASE.JS — Inicialização do cliente Supabase
// ================================================

// Carrega o Supabase via CDN global (sem import/export)
const { createClient } = supabase;

// ⚠️ Suas credenciais:
const SUPABASE_URL = 'https://twvdqbfzsdgajugkfmvr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3dmRxYmZ6c2RnYWp1Z2tmbXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NTAyMTIsImV4cCI6MjEwMDMyNjIxMn0.lcGkQQL1ckJnpwbbTSvuMPSThyP2hJg5GHjhY9wB5PI';

// Cria e exporta o cliente globalmente
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  }
});