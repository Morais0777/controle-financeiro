// ================================================
// AUTH.JS — Toda a lógica de autenticação
// Login, Cadastro, Verificação, Recuperação de senha
// ================================================

// Estado temporário para o cadastro (guarda dados entre telas)
let pendingRegisterData = null;

// ==========================================
// NAVEGAÇÃO ENTRE TELAS DE AUTH
// ==========================================

function showLogin(e) {
  if (e) e.preventDefault();

  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('verifyForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('authTabs').style.display = 'flex';

  document.getElementById('tabLogin').classList.add('active');
  document.getElementById('tabRegister').classList.remove('active');

  document.getElementById('authTitle').textContent = 'Bem-vindo!';
  document.getElementById('authSubtitle').textContent =
    'Faça login para acessar seu painel financeiro';
}

function showRegister(e) {
  if (e) e.preventDefault();

  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
  document.getElementById('verifyForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('authTabs').style.display = 'flex';

  document.getElementById('tabRegister').classList.add('active');
  document.getElementById('tabLogin').classList.remove('active');

  document.getElementById('authTitle').textContent = 'Criar conta';
  document.getElementById('authSubtitle').textContent =
    'Preencha os dados abaixo para começar';
}

function showVerify(email) {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('verifyForm').style.display = 'block';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('authTabs').style.display = 'none';

  document.getElementById('authTitle').textContent = 'Verificar e-mail';
  document.getElementById('authSubtitle').textContent =
    'Insira o código de 6 dígitos que enviamos';
  document.getElementById('verifyEmail').textContent = email;

  // Foca no primeiro campo do código
  setTimeout(() => document.getElementById('code0').focus(), 100);
}

function showForgotPassword(e) {
  if (e) e.preventDefault();

  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('verifyForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'block';
  document.getElementById('authTabs').style.display = 'none';

  document.getElementById('authTitle').textContent = 'Recuperar senha';
  document.getElementById('authSubtitle').textContent =
    'Vamos te ajudar a voltar para o sistema';
}

// ==========================================
// LOGIN
// ==========================================

async function handleLogin(event) {
  event.preventDefault();
  clearAllErrors('loginForm');

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  // Validações
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Traduz mensagens de erro do Supabase para português
      const msg = translateAuthError(error.message);
      showToast(msg, 'error');
      if (error.message.includes('Email not confirmed')) {
        showToast('Confirme seu e-mail antes de entrar', 'warning');
        showVerify(email);
      }
      return;
    }

    // Login bem-sucedido
    showToast('Login realizado! Redirecionando...', 'success');
    setTimeout(() => { window.location.href = 'app.html'; }, 1200);

  } catch (err) {
    showToast('Erro inesperado. Tente novamente.', 'error');
    console.error('Erro no login:', err);
  } finally {
    setLoading('loginBtn', 'loginSpinner', 'loginBtnText', false);
  }
}

// ==========================================
// CADASTRO
// ==========================================

async function handleRegister(event) {
  event.preventDefault();
  clearAllErrors('registerForm');

  const username  = document.getElementById('regUsername').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const password  = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPasswordConfirm').value;

  // Validações
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Passa o username para o trigger do banco de dados
        data: { username },
        // URL para redirecionar após confirmação (ajuste para seu domínio)
        emailRedirectTo: window.location.origin + '/index.html'
      }
    });

    if (error) {
      const msg = translateAuthError(error.message);
      showToast(msg, 'error');
      return;
    }

    // Salva dados para usar na tela de verificação
    pendingRegisterData = { username, email, password };

    // O Supabase envia o e-mail de confirmação automaticamente
    showToast('Código enviado para o seu e-mail!', 'success');
    showVerify(email);

  } catch (err) {
    showToast('Erro ao criar conta. Tente novamente.', 'error');
    console.error('Erro no cadastro:', err);
  } finally {
    setLoading('registerBtn', 'registerSpinner', 'registerBtnText', false);
  }
}

// ==========================================
// VERIFICAÇÃO DE CÓDIGO
// ==========================================

async function handleVerifyCode() {
  // Junta os 6 dígitos
  const code = Array.from({ length: 6 }, (_, i) =>
    document.getElementById(`code${i}`).value
  ).join('');

  if (code.length !== 6) {
    showToast('Digite os 6 dígitos do código', 'warning');
    return;
  }

  setLoading(null, 'verifySpinner', 'verifyBtnText', true);

  try {
    const email = document.getElementById('verifyEmail').textContent;

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup'  // 'email_change' para troca de e-mail, 'recovery' para recuperação
    });

    if (error) {
      showToast('Código inválido ou expirado. Tente novamente.', 'error');
      // Limpa os campos
      for (let i = 0; i < 6; i++) document.getElementById(`code${i}`).value = '';
      document.getElementById('code0').focus();
      return;
    }

    // Verificado com sucesso!
    showToast('E-mail confirmado! Bem-vindo ao FinanceIQ! 🎉', 'success');

    // Aguarda um momento e redireciona para o app
    setTimeout(() => { window.location.href = 'app.html'; }, 1500);

  } catch (err) {
    showToast('Erro ao verificar código.', 'error');
    console.error('Erro na verificação:', err);
  } finally {
    document.getElementById('verifySpinner').classList.remove('visible');
    document.getElementById('verifyBtnText').style.opacity = '1';
  }
}

// ==========================================
// REENVIAR CÓDIGO
// ==========================================

async function resendCode() {
  const email = document.getElementById('verifyEmail').textContent;
  const btn   = document.getElementById('resendBtn');

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      showToast('Erro ao reenviar. Aguarde e tente novamente.', 'error');
    } else {
      showToast('Código reenviado! Verifique seu e-mail.', 'success');
      // Bloqueia o botão por 60 segundos
      let seconds = 60;
      const interval = setInterval(() => {
        seconds--;
        btn.textContent = `Reenviar em ${seconds}s`;
        if (seconds <= 0) {
          clearInterval(interval);
          btn.disabled = false;
          btn.textContent = 'Reenviar código';
        }
      }, 1000);
    }
  } catch (err) {
    showToast('Erro ao reenviar código.', 'error');
  }
}

// ==========================================
// RECUPERAÇÃO DE SENHA
// ==========================================

async function handleForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  clearFieldError('forgotEmail', 'forgotEmailError');

  if (!isValidEmail(email)) {
    showFieldError('forgotEmail', 'forgotEmailError', 'E-mail inválido');
    return;
  }

  setLoading(null, 'forgotSpinner', 'forgotBtnText', true);

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html?reset=true'
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

// ==========================================
// TRADUÇÃO DE ERROS DO SUPABASE
// ==========================================

function translateAuthError(message) {
  const translations = {
    'Invalid login credentials':           'E-mail ou senha incorretos',
    'Email not confirmed':                 'E-mail ainda não confirmado',
    'User already registered':             'Este e-mail já está cadastrado',
    'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
    'Unable to validate email address':    'E-mail inválido',
    'Email rate limit exceeded':           'Muitas tentativas. Aguarde um pouco.',
    'Invalid OTP':                         'Código inválido',
    'Token has expired or is invalid':     'Código expirado. Solicite um novo.',
  };
  return translations[message] || message;
}

// ==========================================
// VERIFICAR SE JÁ ESTÁ LOGADO AO ABRIR
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Se já tem sessão ativa, vai direto pro app
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'app.html';
  }
});