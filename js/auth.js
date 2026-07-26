// ================================================
// AUTH.JS — Toda a lógica de autenticação
// ================================================

let pendingRegisterData = null;

// Função auxiliar para montar URLs corretas
// Funciona tanto no localhost quanto no GitHub Pages
function getBaseUrl() {
  const path = window.location.pathname;
  const base = path.substring(0, path.lastIndexOf('/') + 1);
  return window.location.origin + base;
}

// ── NAVEGAÇÃO ─────────────────────────────────

function showLogin(e) {
  if (e) e.preventDefault();
  document.getElementById('loginForm').style.display    = 'block';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('verifyForm').style.display   = 'none';
  document.getElementById('forgotForm').style.display   = 'none';
  document.getElementById('authTabs').style.display     = 'flex';
  document.getElementById('tabLogin').classList.add('active');
  document.getElementById('tabRegister').classList.remove('active');
  document.getElementById('authTitle').textContent    = 'Bem-vindo de volta';
  document.getElementById('authSubtitle').textContent = 'Entre na sua conta para continuar';
}

function showRegister(e) {
  if (e) e.preventDefault();
  document.getElementById('loginForm').style.display    = 'none';
  document.getElementById('registerForm').style.display = 'block';
  document.getElementById('verifyForm').style.display   = 'none';
  document.getElementById('forgotForm').style.display   = 'none';
  document.getElementById('authTabs').style.display     = 'flex';
  document.getElementById('tabRegister').classList.add('active');
  document.getElementById('tabLogin').classList.remove('active');
  document.getElementById('authTitle').textContent    = 'Criar conta';
  document.getElementById('authSubtitle').textContent = 'Preencha os dados abaixo para começar';
}

function showVerify(email) {
  document.getElementById('loginForm').style.display    = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('verifyForm').style.display   = 'block';
  document.getElementById('forgotForm').style.display   = 'none';
  document.getElementById('authTabs').style.display     = 'none';
  document.getElementById('authTitle').textContent      = 'Verificar e-mail';
  document.getElementById('authSubtitle').textContent   = 'Insira o código de 6 dígitos que enviamos';
  document.getElementById('verifyEmail').textContent    = email;
  setTimeout(() => document.getElementById('code0').focus(), 100);
}

function showForgotPassword(e) {
  if (e) e.preventDefault();
  document.getElementById('loginForm').style.display    = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('verifyForm').style.display   = 'none';
  document.getElementById('forgotForm').style.display   = 'block';
  document.getElementById('authTabs').style.display     = 'none';
  document.getElementById('authTitle').textContent      = 'Recuperar senha';
  document.getElementById('authSubtitle').textContent   = 'Vamos te ajudar a voltar para o sistema';
}

// ── LOGIN ─────────────────────────────────────

async function handleLogin(event) {
  event.preventDefault();
  clearAllErrors('loginForm');

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  let hasError = false;
  if (!isValidEmail(email)) {
    showFieldError('loginEmail', 'loginEmailError', 'E-mail inválido');
    hasError = true;
  }
  if (password.length < 6) {
    showFieldError('loginPassword', 'loginPasswordError', 'Senha muito curta');
    hasError = true;
  }
  if (hasError) return;

  setLoading('loginBtn', 'loginSpinner', 'loginBtnText', true);

  try {
    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = translateAuthError(error.message);
      showToast(msg, 'error');
      if (error.message.includes('Email not confirmed')) {
        showVerify(email);
      }
      return;
    }

    showToast('Login realizado! Redirecionando...', 'success');
    setTimeout(() => {
      window.location.href = getBaseUrl() + 'app.html';
    }, 1000);

  } catch (err) {
    showToast('Erro inesperado. Tente novamente.', 'error');
    console.error('Erro no login:', err);
  } finally {
    setLoading('loginBtn', 'loginSpinner', 'loginBtnText', false);
  }
}

// ── CADASTRO ──────────────────────────────────

async function handleRegister(event) {
  event.preventDefault();
  clearAllErrors('registerForm');

  const username  = document.getElementById('regUsername').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const password  = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPasswordConfirm').value;

  let hasError = false;
  if (username.length < 3) {
    showFieldError('regUsername', 'regUsernameError', 'Mínimo 3 caracteres');
    hasError = true;
  }
  if (!isValidEmail(email)) {
    showFieldError('regEmail', 'regEmailError', 'E-mail inválido');
    hasError = true;
  }
  if (password.length < 8) {
    showFieldError('regPassword', 'regPasswordError', 'Mínimo 8 caracteres');
    hasError = true;
  }
  if (password !== password2) {
    showFieldError('regPasswordConfirm', 'regPasswordConfirmError', 'As senhas não coincidem');
    hasError = true;
  }
  if (hasError) return;

  setLoading('registerBtn', 'registerSpinner', 'registerBtnText', true);

  try {
    const { data, error } = await window.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: getBaseUrl() + 'index.html'
      }
    });

    if (error) {
      showToast(translateAuthError(error.message), 'error');
      return;
    }

    pendingRegisterData = { username, email, password };
    showToast('Código enviado para o seu e-mail!', 'success');
    showVerify(email);

  } catch (err) {
    showToast('Erro ao criar conta. Tente novamente.', 'error');
    console.error('Erro no cadastro:', err);
  } finally {
    setLoading('registerBtn', 'registerSpinner', 'registerBtnText', false);
  }
}

// ── VERIFICAÇÃO DE CÓDIGO ─────────────────────

async function handleVerifyCode() {
  const code = Array.from({ length: 6 }, (_, i) =>
    document.getElementById(`code${i}`).value
  ).join('');

  if (code.length !== 6) {
    showToast('Digite os 6 dígitos do código', 'warning');
    return;
  }

  document.getElementById('verifySpinner').classList.add('visible');
  document.getElementById('verifyBtnText').style.opacity = '0.6';

  try {
    const email = document.getElementById('verifyEmail').textContent;

    const { data, error } = await window.supabase.auth.verifyOtp({
      email, token: code, type: 'signup'
    });

    if (error) {
      showToast('Código inválido ou expirado. Tente novamente.', 'error');
      for (let i = 0; i < 6; i++) document.getElementById(`code${i}`).value = '';
      document.getElementById('code0').focus();
      return;
    }

    showToast('E-mail confirmado! Bem-vindo ao FinanceIQ!', 'success');
    setTimeout(() => {
      window.location.href = getBaseUrl() + 'app.html';
    }, 1500);

  } catch (err) {
    showToast('Erro ao verificar código.', 'error');
    console.error('Erro na verificação:', err);
  } finally {
    document.getElementById('verifySpinner').classList.remove('visible');
    document.getElementById('verifyBtnText').style.opacity = '1';
  }
}

// ── REENVIAR CÓDIGO ───────────────────────────

async function resendCode() {
  const email = document.getElementById('verifyEmail').textContent;
  const btn   = document.getElementById('resendBtn');

  btn.disabled    = true;
  btn.textContent = 'Enviando...';

  try {
    const { error } = await window.supabase.auth.resend({ type: 'signup', email });

    if (error) {
      showToast('Erro ao reenviar. Aguarde e tente novamente.', 'error');
      btn.disabled    = false;
      btn.textContent = 'Reenviar código';
    } else {
      showToast('Código reenviado! Verifique seu e-mail.', 'success');
      let seconds = 60;
      const interval = setInterval(() => {
        seconds--;
        btn.textContent = `Reenviar em ${seconds}s`;
        if (seconds <= 0) {
          clearInterval(interval);
          btn.disabled    = false;
          btn.textContent = 'Reenviar código';
        }
      }, 1000);
    }
  } catch (err) {
    showToast('Erro ao reenviar código.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Reenviar código';
  }
}

// ── RECUPERAÇÃO DE SENHA ──────────────────────

async function handleForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  clearFieldError('forgotEmail', 'forgotEmailError');

  if (!isValidEmail(email)) {
    showFieldError('forgotEmail', 'forgotEmailError', 'E-mail inválido');
    return;
  }

  document.getElementById('forgotSpinner').classList.add('visible');
  document.getElementById('forgotBtnText').style.opacity = '0.6';

  try {
    const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getBaseUrl() + 'index.html?reset=true'
    });

    if (error) {
      showToast('Erro ao enviar e-mail. Verifique o endereço.', 'error');
    } else {
      showToast('Link de recuperação enviado! Verifique seu e-mail.', 'success');
      setTimeout(() => showLogin(), 3000);
    }
  } catch (err) {
    showToast('Erro inesperado.', 'error');
  } finally {
    document.getElementById('forgotSpinner').classList.remove('visible');
    document.getElementById('forgotBtnText').style.opacity = '1';
  }
}

// ── TRADUÇÃO DE ERROS ─────────────────────────

function translateAuthError(message) {
  const t = {
    'Invalid login credentials':                'E-mail ou senha incorretos',
    'Email not confirmed':                      'E-mail ainda não confirmado',
    'User already registered':                  'Este e-mail já está cadastrado',
    'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
    'Unable to validate email address':         'E-mail inválido',
    'Email rate limit exceeded':                'Muitas tentativas. Aguarde um pouco.',
    'Invalid OTP':                              'Código inválido',
    'Token has expired or is invalid':          'Código expirado. Solicite um novo.',
  };
  return t[message] || message;
}

// ── VERIFICAR SESSÃO AO CARREGAR ──────────────

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (session) {
    window.location.href = getBaseUrl() + 'app.html';
  }
});