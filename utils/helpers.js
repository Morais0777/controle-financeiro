// helpers.js

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  document.querySelectorAll('#themeToggle').forEach(btn => {
    const icon = btn.querySelector('i');
    if (icon) icon.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
  });
}

let toastTimeout;

function showToast(message, type = 'info', duration = 4000) {
  const toast = document.getElementById('toast');
  const msg   = document.getElementById('toastMessage');
  const icon  = document.getElementById('toastIcon');
  if (!toast) return;

  const icons = {
    success: '<i class="ti ti-circle-check" style="color:var(--success)"></i>',
    error:   '<i class="ti ti-circle-x" style="color:var(--danger)"></i>',
    warning: '<i class="ti ti-alert-triangle" style="color:var(--warning)"></i>',
    info:    '<i class="ti ti-info-circle" style="color:var(--accent)"></i>',
  };

  icon.innerHTML = icons[type] || icons.info;
  msg.textContent = message;
  toast.style.display = 'flex';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFieldError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) field.classList.add('error');
  if (error) { error.textContent = message; error.classList.add('visible'); }
}

function clearFieldError(fieldId, errorId) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) field.classList.remove('error');
  if (error) { error.textContent = ''; error.classList.remove('visible'); }
}

function clearAllErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  form.querySelectorAll('.form-error.visible').forEach(el => {
    el.classList.remove('visible'); el.textContent = '';
  });
}

function setLoading(btnId, spinnerId, textId, loading) {
  const btn     = document.getElementById(btnId);
  const spinner = document.getElementById(spinnerId);
  const text    = document.getElementById(textId);
  if (btn)     btn.disabled = loading;
  if (spinner) spinner.classList.toggle('visible', loading);
  if (text)    text.style.opacity = loading ? '0.6' : '1';
}

function togglePassword(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  iconEl.className = isHidden ? 'ti ti-eye-off form-input-right-icon' : 'ti ti-eye form-input-right-icon';
}

function moveCode(index) {
  const input = document.getElementById(`code${index}`);
  input.value = input.value.replace(/[^0-9]/g, '');
  if (input.value && index < 5) document.getElementById(`code${index + 1}`).focus();
  if (index === 5 && input.value) {
    const code = Array.from({length:6}, (_,i) => document.getElementById(`code${i}`).value).join('');
    if (code.length === 6) handleVerifyCode();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', toggleTheme);
});