// ================================================
// APP.JS — Lógica principal do FinanceIQ
// ================================================

let currentUser   = null;
let currentPage   = 'home';
let lancamentos   = [];
let editingId     = null;

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  currentUser = session.user;
  await initApp();
});

async function initApp() {
  try {
    const { data: profile } = await window.supabase
      .from('profiles').select('*').eq('id', currentUser.id).single();

    const username = profile?.username || currentUser.email.split('@')[0];

    document.getElementById('sidebarUsername').textContent = username;
    document.getElementById('sidebarEmail').textContent    = currentUser.email;
    document.getElementById('sidebarAvatar').textContent   = username.charAt(0).toUpperCase();
    document.getElementById('configUsername').value        = username;

    const hora     = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    document.getElementById('greetingTitle').textContent = `${saudacao}, ${username}`;

    const agora  = new Date();
    const meses  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mesLabel = `${meses[agora.getMonth()]} ${agora.getFullYear()}`;

    document.getElementById('competenciaBadge').innerHTML =
      `<i class="ti ti-calendar"></i><span>${mesLabel}</span>`;
    document.getElementById('greetingSub').textContent =
      `Resumo financeiro de ${mesLabel.toLowerCase()}`;

    await garantirCompetencia(agora.getMonth() + 1, agora.getFullYear());
    await carregarLancamentos();

    document.getElementById('lancData').value = new Date().toISOString().split('T')[0];

    document.getElementById('appLoading').style.display = 'none';
    document.getElementById('appLayout').style.display  = 'flex';

  } catch (err) {
    console.error('Erro ao iniciar:', err);
    document.getElementById('appLoading').style.display = 'none';
    document.getElementById('appLayout').style.display  = 'flex';
  }
}

// ─────────────────────────────────────────────
// COMPETÊNCIAS
// ─────────────────────────────────────────────

async function garantirCompetencia(mes, ano) {
  const { data } = await window.supabase
    .from('competencias').select('id')
    .eq('user_id', currentUser.id).eq('mes', mes).eq('ano', ano).single();

  if (!data) {
    await window.supabase.from('competencias')
      .insert({ user_id: currentUser.id, mes, ano, ativa: true });
  }
}

async function getCompetenciaId(mes, ano) {
  await garantirCompetencia(mes, ano);
  const { data } = await window.supabase
    .from('competencias').select('id')
    .eq('user_id', currentUser.id).eq('mes', mes).eq('ano', ano).single();
  return data?.id;
}

// ─────────────────────────────────────────────
// CARREGAR LANÇAMENTOS
// ─────────────────────────────────────────────

async function carregarLancamentos() {
  const agora    = new Date();
  const mes      = agora.getMonth() + 1;
  const ano      = agora.getFullYear();
  const inicio   = `${ano}-${String(mes).padStart(2,'0')}-01`;
  const fim      = `${ano}-${String(mes).padStart(2,'0')}-31`;

  const { data, error } = await window.supabase
    .from('lancamentos').select('*')
    .eq('user_id', currentUser.id)
    .gte('data', inicio).lte('data', fim)
    .order('data', { ascending: false });

  if (error) { console.error(error); return; }

  lancamentos = data || [];
  atualizarKPIs();
  renderUltimosLancamentos();
  renderTabelaLancamentos();
  renderGraficos();
}

// ─────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────

function atualizarKPIs() {
  const t = { entrada:0, saida:0, cartao_credito:0,
              investimento:0, emprestimo:0, reserva:0 };

  lancamentos.forEach(l => {
    if (t[l.tipo] !== undefined) t[l.tipo] += parseFloat(l.valor);
  });

  const totalSaidas = t.saida + t.cartao_credito;
  const saldo       = t.entrada - totalSaidas;

  const set = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = formatCurrency(val);
    if (color) el.style.color = color;
  };

  set('kpiSaldo',        saldo,           saldo >= 0 ? 'var(--color-entrada)' : 'var(--color-saida)');
  set('kpiEntradas',     t.entrada);
  set('kpiSaidas',       totalSaidas);
  set('kpiInvestimentos',t.investimento);
  set('kpiEmprestimos',  t.emprestimo);
  set('kpiReserva',      t.reserva);

  const trend = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count > 0 ? `${count} lançamento${count > 1 ? 's' : ''}` : '—';
  };

  trend('kpiSaldoTrend',   lancamentos.length);
  trend('kpiEntradasTrend', lancamentos.filter(l => l.tipo === 'entrada').length);
  trend('kpiSaidasTrend',  lancamentos.filter(l => ['saida','cartao_credito'].includes(l.tipo)).length);

  if (document.getElementById('dashEntradas')) {
    set('dashEntradas', t.entrada);
    set('dashSaidas',   totalSaidas);
    set('dashSaldo',    saldo, saldo >= 0 ? 'var(--color-entrada)' : 'var(--color-saida)');
  }
}

// ─────────────────────────────────────────────
// ÚLTIMOS LANÇAMENTOS (Home)
// ─────────────────────────────────────────────

function renderUltimosLancamentos() {
  const container = document.getElementById('ultimosLancamentos');
  if (!container) return;

  const ultimos = lancamentos.slice(0, 6);

  if (ultimos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ti ti-inbox"></i></div>
        <div class="empty-text">Nenhum lançamento ainda</div>
        <div class="empty-sub">Use as ações rápidas acima para começar</div>
      </div>`;
    return;
  }

  container.innerHTML = ultimos.map(l => `
    <div class="lancamento-item">
      <div class="tx-icon-wrap" style="background:var(--color-${l.tipo === 'cartao_credito' ? 'cartao' : l.tipo}-bg)">
        <i class="ti ${getTipoIcon(l.tipo)}" style="color:var(--color-${l.tipo === 'cartao_credito' ? 'cartao' : l.tipo})"></i>
      </div>
      <div class="lancamento-info">
        <div class="lancamento-desc">${escapeHtml(l.descricao)}</div>
        <div class="lancamento-data">${formatDate(l.data)} · ${getTipoLabel(l.tipo)}</div>
      </div>
      <div class="lancamento-valor" style="color:var(--color-${l.tipo === 'entrada' ? 'entrada' : 'saida'})">
        ${l.tipo === 'entrada' ? '+' : '−'} ${formatCurrency(l.valor)}
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// TABELA DE LANÇAMENTOS
// ─────────────────────────────────────────────

let filtroTipo  = 'todos';
let filtroBusca = '';

function renderTabelaLancamentos() {
  const container = document.getElementById('lancamentosContent');
  if (!container) return;

  // Filtra
  let lista = lancamentos.filter(l => {
    const matchTipo  = filtroTipo === 'todos' || l.tipo === filtroTipo;
    const matchBusca = l.descricao.toLowerCase().includes(filtroBusca.toLowerCase());
    return matchTipo && matchBusca;
  });

  // Totalizadores filtrados
  const totais = { entrada:0, saida:0, cartao_credito:0,
                   investimento:0, emprestimo:0, reserva:0 };
  lista.forEach(l => { if (totais[l.tipo] !== undefined) totais[l.tipo] += parseFloat(l.valor); });
  const totalEntradas = totais.entrada;
  const totalSaidas   = totais.saida + totais.cartao_credito;
  const saldo         = totalEntradas - totalSaidas;

  container.innerHTML = `
    <!-- Barra de filtros -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:200px">
        <i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:15px"></i>
        <input
          type="text"
          class="form-control"
          style="padding-left:32px"
          placeholder="Buscar lançamento..."
          value="${filtroBusca}"
          oninput="filtroBusca=this.value;renderTabelaLancamentos()"
        />
      </div>
      <select class="form-control" style="width:auto;min-width:150px" onchange="filtroTipo=this.value;renderTabelaLancamentos()">
        <option value="todos" ${filtroTipo==='todos'?'selected':''}>Todos os tipos</option>
        <option value="entrada" ${filtroTipo==='entrada'?'selected':''}>Entradas</option>
        <option value="saida" ${filtroTipo==='saida'?'selected':''}>Saídas</option>
        <option value="cartao_credito" ${filtroTipo==='cartao_credito'?'selected':''}>Cartão de crédito</option>
        <option value="investimento" ${filtroTipo==='investimento'?'selected':''}>Investimentos</option>
        <option value="emprestimo" ${filtroTipo==='emprestimo'?'selected':''}>Empréstimos</option>
        <option value="reserva" ${filtroTipo==='reserva'?'selected':''}>Reserva</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="openLancamento()">
        <i class="ti ti-plus"></i>Novo
      </button>
    </div>

    <!-- Totalizadores -->
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <div style="background:var(--color-entrada-bg);border-radius:var(--radius);padding:10px 16px;min-width:140px">
        <div style="font-size:11px;color:var(--color-entrada);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Entradas</div>
        <div style="font-size:18px;font-weight:600;color:var(--color-entrada)">${formatCurrency(totalEntradas)}</div>
      </div>
      <div style="background:var(--color-saida-bg);border-radius:var(--radius);padding:10px 16px;min-width:140px">
        <div style="font-size:11px;color:var(--color-saida);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Saídas</div>
        <div style="font-size:18px;font-weight:600;color:var(--color-saida)">${formatCurrency(totalSaidas)}</div>
      </div>
      <div style="background:${saldo>=0?'var(--color-entrada-bg)':'var(--color-saida-bg)'};border-radius:var(--radius);padding:10px 16px;min-width:140px">
        <div style="font-size:11px;color:${saldo>=0?'var(--color-entrada)':'var(--color-saida)'};font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Saldo</div>
        <div style="font-size:18px;font-weight:600;color:${saldo>=0?'var(--color-entrada)':'var(--color-saida)'}">${formatCurrency(saldo)}</div>
      </div>
    </div>

    <!-- Lista -->
    ${lista.length === 0 ? `
      <div class="empty-state" style="margin-top:40px">
        <div class="empty-icon"><i class="ti ti-search-off"></i></div>
        <div class="empty-text">Nenhum resultado encontrado</div>
        <div class="empty-sub">Tente ajustar os filtros</div>
      </div>
    ` : `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
        <!-- Cabeçalho -->
        <div style="display:grid;grid-template-columns:120px 1fr 100px 130px 80px;gap:12px;padding:10px 16px;background:var(--surface-alt);border-bottom:1px solid var(--border)">
          <div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Tipo</div>
          <div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Descrição</div>
          <div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Data</div>
          <div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;text-align:right">Valor</div>
          <div></div>
        </div>
        <!-- Linhas -->
        ${lista.map(l => `
          <div style="display:grid;grid-template-columns:120px 1fr 100px 130px 80px;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);transition:background var(--transition);align-items:center" class="lancamento-row-item" onmouseenter="this.style.background='var(--surface-alt)'" onmouseleave="this.style.background=''">
            <div>
              <span class="tipo-badge ${l.tipo}">${getTipoLabel(l.tipo)}</span>
            </div>
            <div>
              <div style="font-size:13.5px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.descricao)}</div>
              ${l.observacao ? `<div style="font-size:12px;color:var(--text-muted);margin-top:1px">${escapeHtml(l.observacao)}</div>` : ''}
            </div>
            <div style="font-size:13px;color:var(--text-secondary)">${formatDate(l.data)}</div>
            <div style="font-size:14px;font-weight:600;text-align:right;color:${l.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">
              ${l.tipo === 'entrada' ? '+' : '−'} ${formatCurrency(l.valor)}
            </div>
            <div style="display:flex;gap:4px;justify-content:flex-end">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="editarLancamento('${l.id}')" title="Editar">
                <i class="ti ti-edit" style="font-size:15px;color:var(--text-muted)"></i>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="deletarLancamento('${l.id}')" title="Excluir">
                <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted)"></i>
              </button>
            </div>
          </div>
        `).join('')}
        <!-- Rodapé -->
        <div style="padding:12px 16px;background:var(--surface-alt);border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;color:var(--text-muted)">${lista.length} lançamento${lista.length !== 1 ? 's' : ''}</div>
          <div style="font-size:13px;font-weight:600;color:${saldo>=0?'var(--color-entrada)':'var(--color-saida)'}">
            Saldo: ${formatCurrency(saldo)}
          </div>
        </div>
      </div>
    `}
  `;
}

// ─────────────────────────────────────────────
// MODAL DE LANÇAMENTO
// ─────────────────────────────────────────────

function openLancamento(tipo = 'saida') {
  editingId = null;
  document.getElementById('modalTitle').textContent   = 'Novo lançamento';
  document.getElementById('lancTipo').value           = tipo;
  document.getElementById('lancDescricao').value      = '';
  document.getElementById('lancValor').value          = '';
  document.getElementById('lancObservacao').value     = '';
  document.getElementById('lancData').value           = new Date().toISOString().split('T')[0];
  document.getElementById('modalLancamento').style.display = 'flex';
  setTimeout(() => document.getElementById('lancDescricao').focus(), 100);
}

function editarLancamento(id) {
  const l = lancamentos.find(x => x.id === id);
  if (!l) return;

  editingId = id;
  document.getElementById('modalTitle').textContent   = 'Editar lançamento';
  document.getElementById('lancTipo').value           = l.tipo;
  document.getElementById('lancDescricao').value      = l.descricao;
  document.getElementById('lancValor').value          = l.valor;
  document.getElementById('lancObservacao').value     = l.observacao || '';
  document.getElementById('lancData').value           = l.data;
  document.getElementById('modalLancamento').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalLancamento').style.display = 'none';
  editingId = null;
}

async function salvarLancamento() {
  const tipo       = document.getElementById('lancTipo').value;
  const descricao  = document.getElementById('lancDescricao').value.trim();
  const valor      = parseFloat(document.getElementById('lancValor').value);
  const data       = document.getElementById('lancData').value;
  const observacao = document.getElementById('lancObservacao').value.trim();

  if (!descricao) { showToast('Informe a descrição', 'warning'); document.getElementById('lancDescricao').focus(); return; }
  if (!valor || valor <= 0) { showToast('Informe um valor válido', 'warning'); document.getElementById('lancValor').focus(); return; }
  if (!data) { showToast('Informe a data', 'warning'); return; }

  const d   = new Date(data + 'T12:00:00');
  const mes = d.getMonth() + 1;
  const ano = d.getFullYear();
  const competencia_id = await getCompetenciaId(mes, ano);

  const payload = { tipo, descricao, valor, data, observacao: observacao || null, pago: true };

  let error;

  if (editingId) {
    const res = await window.supabase
      .from('lancamentos').update(payload).eq('id', editingId);
    error = res.error;
  } else {
    const res = await window.supabase
      .from('lancamentos').insert({ ...payload, user_id: currentUser.id, competencia_id });
    error = res.error;
  }

  if (error) { showToast('Erro ao salvar lançamento.', 'error'); console.error(error); return; }

  showToast(editingId ? 'Lançamento atualizado!' : 'Lançamento salvo!', 'success');
  closeModal();
  await carregarLancamentos();
}

async function deletarLancamento(id) {
  const l = lancamentos.find(x => x.id === id);
  if (!l) return;

  showConfirm(
    'Excluir lançamento',
    `Deseja excluir "<strong>${escapeHtml(l.descricao)}</strong>"? Esta ação não pode ser desfeita.`,
    async () => {
      const { error } = await window.supabase.from('lancamentos').delete().eq('id', id);
      if (error) { showToast('Erro ao excluir.', 'error'); return; }
      showToast('Lançamento excluído.', 'success');
      await carregarLancamentos();
    }
  );
}

// ─────────────────────────────────────────────
// GRÁFICOS
// ─────────────────────────────────────────────

let charts = {};

function renderGraficos() {
  const t = { entrada:0, saida:0, cartao_credito:0, investimento:0, emprestimo:0, reserva:0 };
  lancamentos.forEach(l => { if (t[l.tipo] !== undefined) t[l.tipo] += parseFloat(l.valor); });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor   = isDark ? '#2e3348' : '#e4e7ee';
  const labelColor  = isDark ? '#8b92b3' : '#6b7590';

  // Gráfico Home
  const ctxBar = document.getElementById('chartHomeBar');
  if (ctxBar) {
    if (charts.homeBar) charts.homeBar.destroy();
    charts.homeBar = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: ['Entradas', 'Saídas'],
        datasets: [{
          data: [t.entrada, t.saida + t.cartao_credito],
          backgroundColor: ['#0a7c42', '#c0392b'],
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: labelColor, font: { size: 11 } }, grid: { color: gridColor } },
          x: { ticks: { color: labelColor, font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  // Dashboard — Mensal
  const ctxM = document.getElementById('chartDashMensal');
  if (ctxM) {
    if (charts.dashMensal) charts.dashMensal.destroy();
    charts.dashMensal = new Chart(ctxM, {
      type: 'bar',
      data: {
        labels: ['Entradas','Saídas','Investimentos','Reserva'],
        datasets: [{
          data: [t.entrada, t.saida + t.cartao_credito, t.investimento, t.reserva],
          backgroundColor: ['#0a7c42','#c0392b','#1a56db','#0e7490'],
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: labelColor, font: { size: 11 } }, grid: { color: gridColor } },
          x: { ticks: { color: labelColor, font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  // Dashboard — Donut
  const ctxD = document.getElementById('chartDashCategoria');
  if (ctxD) {
    if (charts.dashCat) charts.dashCat.destroy();
    const vals   = [t.entrada, t.saida + t.cartao_credito, t.investimento, t.emprestimo, t.reserva];
    const labels = ['Entradas','Saídas','Investimentos','Empréstimos','Reserva'];
    const cores  = ['#0a7c42','#c0392b','#1a56db','#6d28d9','#0e7490'];
    const nonZero = vals.map((v,i) => ({v,l:labels[i],c:cores[i]})).filter(x => x.v > 0);

    charts.dashCat = new Chart(ctxD, {
      type: 'doughnut',
      data: {
        labels: nonZero.map(x => x.l),
        datasets: [{ data: nonZero.map(x => x.v), backgroundColor: nonZero.map(x => x.c), borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: labelColor, font: { size: 11 }, padding: 14, usePointStyle: true }
          }
        }
      }
    });
  }
}

// ─────────────────────────────────────────────
// NAVEGAÇÃO
// ─────────────────────────────────────────────

const pageTitles = {
  home: 'Início', lancamentos: 'Lançamentos',
  dashboard: 'Dashboard', relatorios: 'Relatórios',
  configuracoes: 'Configurações'
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('topbarTitle').textContent = pageTitles[page] || page;
  currentPage = page;
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
  if (page === 'dashboard') setTimeout(renderGraficos, 50);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

async function handleLogout() {
  showConfirm('Sair do FinanceIQ', 'Deseja encerrar sua sessão?', async () => {
    await window.supabase.auth.signOut();
    window.location.href = 'index.html';
  });
}

// ─────────────────────────────────────────────
// PERFIL
// ─────────────────────────────────────────────

async function salvarPerfil() {
  const username = document.getElementById('configUsername').value.trim();
  if (!username) { showToast('Informe seu nome', 'warning'); return; }

  const { error } = await window.supabase
    .from('profiles').update({ username }).eq('id', currentUser.id);

  if (error) { showToast('Erro ao salvar.', 'error'); return; }

  document.getElementById('sidebarUsername').textContent = username;
  document.getElementById('sidebarAvatar').textContent   = username.charAt(0).toUpperCase();
  showToast('Perfil atualizado!', 'success');
}

// ─────────────────────────────────────────────
// RELATÓRIO
// ─────────────────────────────────────────────

function gerarRelatorio() {
  showToast('Geração de PDF será implementada na próxima etapa!', 'info');
}

// ─────────────────────────────────────────────
// MODAL DE CONFIRMAÇÃO
// ─────────────────────────────────────────────

function showConfirm(title, message, onConfirm) {
  const existing = document.getElementById('confirmModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'confirmModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,21,40,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px';

  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl);padding:28px;width:100%;max-width:400px;border:1px solid var(--border);box-shadow:var(--shadow-md)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:36px;height:36px;background:var(--danger-bg);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ti-alert-triangle" style="color:var(--danger);font-size:18px"></i>
        </div>
        <h3 style="font-size:15px;font-weight:600;color:var(--text-primary)">${title}</h3>
      </div>
      <p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:24px;line-height:1.6">${message}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('confirmModal').remove()">Cancelar</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;border-color:var(--danger)" id="confirmOkBtn">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('confirmOkBtn').onclick = () => { modal.remove(); onConfirm(); };
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getTipoIcon(tipo) {
  const icons = {
    entrada: 'ti-trending-up', saida: 'ti-trending-down',
    cartao_credito: 'ti-credit-card', investimento: 'ti-building-bank',
    emprestimo: 'ti-handshake', reserva: 'ti-shield-check'
  };
  return icons[tipo] || 'ti-circle';
}

function getTipoLabel(tipo) {
  const labels = {
    entrada: 'Entrada', saida: 'Saída', cartao_credito: 'Cartão',
    investimento: 'Investimento', emprestimo: 'Empréstimo', reserva: 'Reserva'
  };
  return labels[tipo] || tipo;
}

// Fechar modal clicando fora
document.getElementById('modalLancamento')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// Fechar modal com ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ─────────────────────────────────────────────
// CONFIGURAÇÕES — ABAS
// ─────────────────────────────────────────────

function showCfgTab(tab) {
  document.querySelectorAll('.cfg-tab').forEach((t, i) => {
    t.classList.toggle('active', ['perfil','categorias','fixos','competencias'][i] === tab);
  });
  document.querySelectorAll('.cfg-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`cfg-${tab}`).style.display = 'block';

  if (tab === 'categorias')   carregarCategorias();
  if (tab === 'fixos')        carregarFixos();
  if (tab === 'competencias') carregarCompetencias();
}

// ─────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────

function selecionarCor(btn) {
  document.querySelectorAll('.cor-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('catCor').value = btn.dataset.cor;
}

async function salvarCategoria() {
  const nome = document.getElementById('catNome').value.trim();
  const tipo = document.getElementById('catTipo').value;
  const cor  = document.getElementById('catCor').value;

  if (!nome) { showToast('Informe o nome da categoria', 'warning'); return; }

  const { error } = await window.supabase.from('categorias').insert({
    user_id: currentUser.id, nome, tipo, cor, ativa: true
  });

  if (error) {
    if (error.code === '23505') { showToast('Você já tem uma categoria com este nome', 'warning'); return; }
    showToast('Erro ao salvar categoria', 'error'); return;
  }

  showToast('Categoria criada!', 'success');
  document.getElementById('catNome').value = '';
  carregarCategorias();
}

async function carregarCategorias() {
  const { data } = await window.supabase
    .from('categorias').select('*')
    .eq('user_id', currentUser.id)
    .eq('ativa', true)
    .order('nome');

  const container = document.getElementById('listaCategorias');
  const count     = document.getElementById('catCount');
  if (!container) return;

  const lista = data || [];
  count.textContent = `${lista.length} categoria${lista.length !== 1 ? 's' : ''}`;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-icon"><i class="ti ti-tags"></i></div>
        <div class="empty-text">Nenhuma categoria ainda</div>
        <div class="empty-sub">Adicione uma ao lado</div>
      </div>`;
    return;
  }

  const tipoLabel = { entrada: 'Entrada', saida: 'Saída', ambos: 'Ambos' };

  container.innerHTML = lista.map(c => `
    <div class="cat-item">
      <div class="cat-icon" style="background:${c.cor}22">
        <i class="ti ti-tag" style="color:${c.cor}"></i>
      </div>
      <div class="cat-info">
        <div class="cat-nome">${escapeHtml(c.nome)}</div>
        <div class="cat-sub">${tipoLabel[c.tipo] || c.tipo}</div>
      </div>
      <div style="width:10px;height:10px;border-radius:50%;background:${c.cor};flex-shrink:0"></div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deletarCategoria('${c.id}')" title="Excluir">
        <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted)"></i>
      </button>
    </div>
  `).join('');
}

async function deletarCategoria(id) {
  showConfirm('Excluir categoria', 'Deseja excluir esta categoria? Os lançamentos vinculados não serão afetados.', async () => {
    const { error } = await window.supabase
      .from('categorias').update({ ativa: false }).eq('id', id);
    if (error) { showToast('Erro ao excluir', 'error'); return; }
    showToast('Categoria excluída', 'success');
    carregarCategorias();
  });
}

// ─────────────────────────────────────────────
// ITENS FIXOS
// ─────────────────────────────────────────────

async function salvarItemFixo() {
  const nome  = document.getElementById('fixoNome').value.trim();
  const tipo  = document.getElementById('fixoTipo').value;
  const valor = parseFloat(document.getElementById('fixoValor').value);
  const dia   = parseInt(document.getElementById('fixoDia').value) || null;
  const obs   = document.getElementById('fixoObs').value.trim();

  if (!nome)          { showToast('Informe o nome do item', 'warning'); return; }
  if (!valor || valor <= 0) { showToast('Informe um valor válido', 'warning'); return; }

  const { error } = await window.supabase.from('itens_fixos').insert({
    user_id: currentUser.id, nome, tipo, valor,
    dia_vencimento: dia, observacao: obs || null, ativo: true
  });

  if (error) { showToast('Erro ao salvar item fixo', 'error'); console.error(error); return; }

  showToast('Item fixo cadastrado!', 'success');
  document.getElementById('fixoNome').value  = '';
  document.getElementById('fixoValor').value = '';
  document.getElementById('fixoDia').value   = '';
  document.getElementById('fixoObs').value   = '';
  carregarFixos();
}

async function carregarFixos() {
  const { data } = await window.supabase
    .from('itens_fixos').select('*')
    .eq('user_id', currentUser.id)
    .eq('ativo', true)
    .order('nome');

  const container = document.getElementById('listaFixos');
  const count     = document.getElementById('fixoCount');
  if (!container) return;

  const lista = data || [];
  count.textContent = `${lista.length} item${lista.length !== 1 ? 'ns' : ''}`;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-icon"><i class="ti ti-refresh"></i></div>
        <div class="empty-text">Nenhum item fixo ainda</div>
        <div class="empty-sub">Adicione salário, aluguel, etc.</div>
      </div>`;
    return;
  }

  container.innerHTML = lista.map(f => `
    <div class="fixo-item">
      <div class="fixo-icon" style="background:${f.tipo==='entrada'?'var(--color-entrada-bg)':'var(--color-saida-bg)'}">
        <i class="ti ${f.tipo==='entrada'?'ti-trending-up':'ti-trending-down'}"
           style="color:${f.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}"></i>
      </div>
      <div class="fixo-info">
        <div class="fixo-nome">${escapeHtml(f.nome)}</div>
        <div class="fixo-sub">${f.tipo === 'entrada' ? 'Entrada' : 'Saída'}${f.dia_vencimento ? ` · Dia ${f.dia_vencimento}` : ''}</div>
      </div>
      <div class="fixo-valor" style="color:${f.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">
        ${f.tipo==='entrada'?'+':'−'} ${formatCurrency(f.valor)}
      </div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deletarFixo('${f.id}')" title="Excluir">
        <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted)"></i>
      </button>
    </div>
  `).join('');
}

async function deletarFixo(id) {
  showConfirm('Excluir item fixo', 'Deseja excluir este item fixo?', async () => {
    const { error } = await window.supabase
      .from('itens_fixos').update({ ativo: false }).eq('id', id);
    if (error) { showToast('Erro ao excluir', 'error'); return; }
    showToast('Item fixo excluído', 'success');
    carregarFixos();
  });
}

// ─────────────────────────────────────────────
// COMPETÊNCIAS
// ─────────────────────────────────────────────

async function carregarCompetencias() {
  const { data } = await window.supabase
    .from('competencias').select('*')
    .eq('user_id', currentUser.id)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false });

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Calcula próximo mês
  const lista     = data || [];
  let proximoMes, proximoAno;

  if (lista.length > 0) {
    const ultimo = lista[0];
    if (ultimo.mes === 12) { proximoMes = 1; proximoAno = ultimo.ano + 1; }
    else { proximoMes = ultimo.mes + 1; proximoAno = ultimo.ano; }
  } else {
    const agora  = new Date();
    proximoMes   = agora.getMonth() + 2 > 12 ? 1 : agora.getMonth() + 2;
    proximoAno   = agora.getMonth() + 2 > 12 ? agora.getFullYear() + 1 : agora.getFullYear();
  }

  const labelEl = document.getElementById('proximoMesLabel');
  if (labelEl) labelEl.textContent = `${meses[proximoMes - 1]} ${proximoAno}`;

  // Lista de competências
  const container = document.getElementById('listaCompetencias');
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px 0">
        <div class="empty-icon"><i class="ti ti-calendar"></i></div>
        <div class="empty-text">Nenhuma competência criada</div>
      </div>`;
    return;
  }

  container.innerHTML = lista.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13.5px;font-weight:500;color:var(--text-primary)">${meses[c.mes-1]} ${c.ano}</div>
        <div style="font-size:12px;color:var(--text-muted)">Competência ${c.mes.toString().padStart(2,'0')}/${c.ano}</div>
      </div>
      ${c.ativa ? `<span style="padding:3px 10px;background:var(--color-entrada-bg);color:var(--color-entrada);border-radius:var(--radius-full);font-size:11.5px;font-weight:500">Ativa</span>` : ''}
    </div>
  `).join('');
}

async function gerarProximoMes() {
  const { data: competencias } = await window.supabase
    .from('competencias').select('*')
    .eq('user_id', currentUser.id)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false });

  const lista = competencias || [];
  let novoMes, novoAno;

  if (lista.length > 0) {
    const ultimo = lista[0];
    if (ultimo.mes === 12) { novoMes = 1; novoAno = ultimo.ano + 1; }
    else { novoMes = ultimo.mes + 1; novoAno = ultimo.ano; }
  } else {
    const agora = new Date();
    novoMes  = agora.getMonth() + 2 > 12 ? 1 : agora.getMonth() + 2;
    novoAno  = agora.getMonth() + 2 > 12 ? agora.getFullYear() + 1 : agora.getFullYear();
  }

  // Verifica se já existe
  const jaExiste = lista.find(c => c.mes === novoMes && c.ano === novoAno);
  if (jaExiste) {
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    showToast(`${meses[novoMes-1]} ${novoAno} já existe!`, 'warning');
    return;
  }

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  showConfirm(
    'Gerar próximo mês',
    `Deseja criar a competência de <strong>${meses[novoMes-1]} ${novoAno}</strong>? Os itens fixos serão importados automaticamente como lançamentos.`,
    async () => {
      // Cria competência
      const { data: novaComp, error: errComp } = await window.supabase
        .from('competencias').insert({
          user_id: currentUser.id, mes: novoMes, ano: novoAno, ativa: false
        }).select().single();

      if (errComp) { showToast('Erro ao criar competência', 'error'); return; }

      // Busca itens fixos
      const { data: fixos } = await window.supabase
        .from('itens_fixos').select('*')
        .eq('user_id', currentUser.id).eq('ativo', true);

      if (fixos && fixos.length > 0) {
        const lancamentosFixos = fixos.map(f => ({
          user_id:       currentUser.id,
          competencia_id: novaComp.id,
          tipo:          f.tipo,
          descricao:     f.nome,
          valor:         f.valor,
          data:          `${novoAno}-${String(novoMes).padStart(2,'0')}-${String(f.dia_vencimento || 1).padStart(2,'0')}`,
          observacao:    f.observacao,
          pago:          false,
          item_fixo_id:  f.id,
        }));

        await window.supabase.from('lancamentos').insert(lancamentosFixos);
      }

      showToast(`${meses[novoMes-1]} ${novoAno} criado com ${fixos?.length || 0} item(ns) fixo(s)!`, 'success');
      carregarCompetencias();
    }
  );
}
