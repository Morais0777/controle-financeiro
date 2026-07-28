// ================================================
// APP.JS — FinanceIQ — Sistema completo
// Versão consolidada e corrigida
// ================================================

// ── ESTADO GLOBAL ─────────────────────────────
let currentUser       = null;
let currentPage       = 'home';
let lancamentos       = [];
let competencias      = [];
let competenciaAtiva  = null;
let editingId         = null;
let itensFixos        = [];
let categorias        = [];

// ── INICIALIZAÇÃO ──────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) { window.location.href = getBaseUrl() + 'index.html'; return; }
  currentUser = session.user;
  await initApp();
});

function getBaseUrl() {
  const path = window.location.pathname;
  return window.location.origin + path.substring(0, path.lastIndexOf('/') + 1);
}

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

    const agora = new Date();
    await garantirCompetencia(agora.getMonth() + 1, agora.getFullYear());
    await carregarCompetencias();
    await carregarItensFixos();
    await carregarCategoriasList();

    const mesAtual = competencias.find(c =>
      c.mes === agora.getMonth() + 1 && c.ano === agora.getFullYear()
    );
    if (mesAtual) await setCompetenciaAtiva(mesAtual);

    document.getElementById('lancData').value = new Date().toISOString().split('T')[0];
    document.getElementById('appLoading').style.display = 'none';
    document.getElementById('appLayout').style.display  = 'flex';

  } catch (err) {
    console.error('Erro ao iniciar:', err);
    document.getElementById('appLoading').style.display = 'none';
    document.getElementById('appLayout').style.display  = 'flex';
  }
}

// ── COMPETÊNCIA ATIVA ──────────────────────────

async function setCompetenciaAtiva(comp) {
  competenciaAtiva = comp;
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const label = `${meses[comp.mes - 1]} ${comp.ano}`;

  document.getElementById('competenciaBadge').innerHTML =
    `<i class="ti ti-calendar"></i><span>${label}</span>`;
  document.getElementById('greetingSub').textContent =
    `Resumo financeiro de ${label.toLowerCase()}`;

  await carregarLancamentos();
  atualizarSeletorCompetencia();
}

function atualizarSeletorCompetencia() {
  const sel = document.getElementById('seletorCompetencia');
  if (!sel) return;
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun',
                 'Jul','Ago','Set','Out','Nov','Dez'];
  sel.innerHTML = competencias.map(c => `
    <option value="${c.id}" ${c.id === competenciaAtiva?.id ? 'selected' : ''}>
      ${meses[c.mes-1]}/${c.ano}
    </option>
  `).join('');
}

async function mudarCompetencia(id) {
  const comp = competencias.find(c => c.id === id);
  if (comp) await setCompetenciaAtiva(comp);
}

// ── COMPETÊNCIAS CRUD ──────────────────────────

async function garantirCompetencia(mes, ano) {
  const { data } = await window.supabase
    .from('competencias').select('id')
    .eq('user_id', currentUser.id).eq('mes', mes).eq('ano', ano).single();
  if (!data) {
    await window.supabase.from('competencias')
      .insert({ user_id: currentUser.id, mes, ano, ativa: false });
  }
}

async function getCompetenciaId(mes, ano) {
  await garantirCompetencia(mes, ano);
  const { data } = await window.supabase
    .from('competencias').select('id')
    .eq('user_id', currentUser.id).eq('mes', mes).eq('ano', ano).single();
  return data?.id;
}

async function carregarCompetencias() {
  const { data } = await window.supabase
    .from('competencias').select('*')
    .eq('user_id', currentUser.id)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false });
  competencias = data || [];
}

// ── LANÇAMENTOS ────────────────────────────────

async function carregarLancamentos() {
  if (!competenciaAtiva) return;

  const { data, error } = await window.supabase
    .from('lancamentos').select('*')
    .eq('user_id', currentUser.id)
    .eq('competencia_id', competenciaAtiva.id)
    .order('data', { ascending: false });

  if (error) { console.error(error); return; }
  lancamentos = data || [];

  atualizarKPIs();
  renderUltimosLancamentos();
  renderTabelaLancamentos();
  renderGraficos();
}

// ── KPIs ───────────────────────────────────────

function calcularTotais() {
  const t = { entrada:0, saida:0, cartao_credito:0,
              investimento:0, emprestimo:0, reserva:0 };
  lancamentos.forEach(l => {
    const tipo = l.tipo?.trim();
    if (tipo && t[tipo] !== undefined) {
      t[tipo] += parseFloat(l.valor) || 0;
    }
  });
  const totalSaidas = t.saida + t.cartao_credito;
  const saldo       = t.entrada - totalSaidas;
  return { ...t, totalSaidas, saldo };
}

function atualizarKPIs() {
  const t = calcularTotais();

  const setKpi = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = formatCurrency(val);
    if (color) el.style.color = color;
  };

  setKpi('kpiSaldo',         t.saldo,       t.saldo >= 0 ? 'var(--color-entrada)' : 'var(--color-saida)');
  setKpi('kpiEntradas',      t.entrada);
  setKpi('kpiSaidas',        t.totalSaidas);
  setKpi('kpiInvestimentos', t.investimento);
  setKpi('kpiEmprestimos',   t.emprestimo);
  setKpi('kpiReserva',       t.reserva);

  const trend = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = n > 0 ? `${n} lançamento${n > 1 ? 's' : ''}` : '—';
  };
  trend('kpiSaldoTrend',    lancamentos.length);
  trend('kpiEntradasTrend', lancamentos.filter(l => l.tipo === 'entrada').length);
  trend('kpiSaidasTrend',   lancamentos.filter(l => ['saida','cartao_credito'].includes(l.tipo)).length);

  // Dashboard
  if (document.getElementById('dashEntradas'))     setKpi('dashEntradas',     t.entrada);
  if (document.getElementById('dashSaidas'))       setKpi('dashSaidas',       t.totalSaidas);
  if (document.getElementById('dashSaldo'))        setKpi('dashSaldo',        t.saldo, t.saldo >= 0 ? 'var(--color-entrada)' : 'var(--color-saida)');
  if (document.getElementById('dashEmprestimos'))  setKpi('dashEmprestimos',  t.emprestimo);
  if (document.getElementById('dashInvestimentos'))setKpi('dashInvestimentos',t.investimento);
  if (document.getElementById('dashCartao'))       setKpi('dashCartao',       t.cartao_credito);
  if (document.getElementById('dashReserva'))      setKpi('dashReserva',      t.reserva);
}

// ── ÚLTIMOS LANÇAMENTOS ────────────────────────

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

  container.innerHTML = ultimos.map(l => {
    const tipoKey = l.tipo === 'cartao_credito' ? 'cartao' : l.tipo;
    return `
    <div class="lancamento-item">
      <div class="tx-icon-wrap" style="background:var(--color-${tipoKey}-bg)">
        <i class="ti ${getTipoIcon(l.tipo)}" style="color:var(--color-${tipoKey})"></i>
      </div>
      <div class="lancamento-info">
        <div class="lancamento-desc">${escapeHtml(l.descricao)}</div>
        <div class="lancamento-data">${formatDate(l.data)} · ${getTipoLabel(l.tipo)}</div>
      </div>
      <div class="lancamento-valor" style="color:${l.tipo === 'entrada' ? 'var(--color-entrada)' : 'var(--color-saida)'}">
        ${l.tipo === 'entrada' ? '+' : '−'} ${formatCurrency(l.valor)}
      </div>
    </div>`;
  }).join('');
}

// ── TABELA DE LANÇAMENTOS ──────────────────────

let filtroTipo  = 'todos';
let filtroBusca = '';

function renderTabelaLancamentos() {
  const container = document.getElementById('lancamentosContent');
  if (!container) return;

  let lista = lancamentos.filter(l => {
    const matchTipo  = filtroTipo === 'todos' || l.tipo === filtroTipo;
    const matchBusca = l.descricao.toLowerCase().includes(filtroBusca.toLowerCase());
    return matchTipo && matchBusca;
  });

  const t           = calcularTotais();
  const totalEntradas = t.entrada;
  const totalSaidas   = t.totalSaidas;
  const saldo         = t.saldo;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:200px">
        <i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:15px"></i>
        <input type="text" class="form-control" style="padding-left:32px" placeholder="Buscar lançamento..."
          value="${filtroBusca}" oninput="filtroBusca=this.value;renderTabelaLancamentos()" />
      </div>
      <select class="form-control" style="width:auto;min-width:150px" onchange="filtroTipo=this.value;renderTabelaLancamentos()">
        <option value="todos" ${filtroTipo==='todos'?'selected':''}>Todos os tipos</option>
        <option value="entrada" ${filtroTipo==='entrada'?'selected':''}>Entradas</option>
        <option value="saida" ${filtroTipo==='saida'?'selected':''}>Saídas</option>
        <option value="cartao_credito" ${filtroTipo==='cartao_credito'?'selected':''}>Cartão</option>
        <option value="investimento" ${filtroTipo==='investimento'?'selected':''}>Investimentos</option>
        <option value="emprestimo" ${filtroTipo==='emprestimo'?'selected':''}>Empréstimos</option>
        <option value="reserva" ${filtroTipo==='reserva'?'selected':''}>Reserva</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="openLancamento()">
        <i class="ti ti-plus"></i>Novo
      </button>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      ${[
        { label:'Entradas', val:totalEntradas, cor:'var(--color-entrada)', bg:'var(--color-entrada-bg)' },
        { label:'Saídas',   val:totalSaidas,   cor:'var(--color-saida)',   bg:'var(--color-saida-bg)' },
        { label:'Saldo',    val:saldo,
          cor:saldo>=0?'var(--color-entrada)':'var(--color-saida)',
          bg:saldo>=0?'var(--color-entrada-bg)':'var(--color-saida-bg)' },
      ].map(x => `
        <div style="background:${x.bg};border-radius:var(--radius);padding:10px 16px;min-width:140px">
          <div style="font-size:11px;color:${x.cor};font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${x.label}</div>
          <div style="font-size:18px;font-weight:600;color:${x.cor}">${formatCurrency(x.val)}</div>
        </div>
      `).join('')}
    </div>

    ${lista.length === 0 ? `
      <div class="empty-state" style="margin-top:40px">
        <div class="empty-icon"><i class="ti ti-search-off"></i></div>
        <div class="empty-text">Nenhum resultado encontrado</div>
        <div class="empty-sub">Tente ajustar os filtros</div>
      </div>
    ` : `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
        <div style="display:grid;grid-template-columns:120px 1fr 100px 130px 80px;gap:12px;padding:10px 16px;background:var(--surface-alt);border-bottom:1px solid var(--border)">
          ${['Tipo','Descrição','Data','Valor',''].map(h =>
            `<div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em${h==='Valor'?';text-align:right':''}">${h}</div>`
          ).join('')}
        </div>
        ${lista.map(l => `
          <div style="display:grid;grid-template-columns:120px 1fr 100px 130px 80px;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);align-items:center"
            onmouseenter="this.style.background='var(--surface-alt)'" onmouseleave="this.style.background=''">
            <div><span class="tipo-badge ${l.tipo}">${getTipoLabel(l.tipo)}</span></div>
            <div>
              <div style="font-size:13.5px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.descricao)}</div>
              ${l.observacao ? `<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(l.observacao)}</div>` : ''}
            </div>
            <div style="font-size:13px;color:var(--text-secondary)">${formatDate(l.data)}</div>
            <div style="font-size:14px;font-weight:600;text-align:right;color:${l.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">
              ${l.tipo==='entrada'?'+':'−'} ${formatCurrency(l.valor)}
            </div>
            <div style="display:flex;gap:4px;justify-content:flex-end">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="editarLancamento('${l.id}')">
                <i class="ti ti-edit" style="font-size:15px;color:var(--text-muted)"></i>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="deletarLancamento('${l.id}')">
                <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted)"></i>
              </button>
            </div>
          </div>
        `).join('')}
        <div style="padding:12px 16px;background:var(--surface-alt);border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;color:var(--text-muted)">${lista.length} lançamento${lista.length !== 1 ? 's' : ''}</div>
          <div style="font-size:13px;font-weight:600;color:${saldo>=0?'var(--color-entrada)':'var(--color-saida)'}">Saldo: ${formatCurrency(saldo)}</div>
        </div>
      </div>
    `}
  `;
}

// ── ITENS FIXOS (cache) ────────────────────────

async function carregarItensFixos() {
  const { data } = await window.supabase
    .from('itens_fixos').select('*')
    .eq('user_id', currentUser.id).eq('ativo', true).order('nome');
  itensFixos = data || [];
}

async function carregarCategoriasList() {
  const { data } = await window.supabase
    .from('categorias').select('*')
    .eq('user_id', currentUser.id).eq('ativa', true).order('nome');
  categorias = data || [];
}

// ── MODAL DE LANÇAMENTO ────────────────────────

function openLancamento(tipo = 'saida') {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Novo lançamento';
  document.getElementById('lancDescricao').value    = '';
  document.getElementById('lancValor').value        = '';
  document.getElementById('lancObservacao').value   = '';
  document.getElementById('lancData').value         =
    competenciaAtiva
      ? `${competenciaAtiva.ano}-${String(competenciaAtiva.mes).padStart(2,'0')}-01`
      : new Date().toISOString().split('T')[0];

  const select = document.getElementById('lancTipo');
  select.value = tipo;

  carregarItensFixos().then(() => {
    atualizarSugestoesFixos(tipo);
  });

  document.getElementById('modalLancamento').style.display = 'flex';
  setTimeout(() => document.getElementById('lancDescricao').focus(), 150);
}

function atualizarSugestoesFixos(tipo) {
  const container = document.getElementById('sugestoesFixos');
  if (!container) return;

  const fixosFiltrados = itensFixos.filter(f =>
    tipo === 'cartao_credito' ? f.tipo === 'saida' : f.tipo === tipo
  );

  if (fixosFiltrados.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:8px">
      Itens fixos cadastrados — clique para preencher:
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${fixosFiltrados.map(f => `
        <button type="button" onclick="selecionarFixo('${f.id}')"
          style="padding:5px 12px;border-radius:var(--radius-full);border:1px solid var(--border);
          background:var(--surface-alt);font-size:12.5px;cursor:pointer;font-family:var(--font);
          color:var(--text-secondary);transition:all var(--transition)"
          onmouseenter="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
          onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-secondary)'">
          ${escapeHtml(f.nome)} · ${formatCurrency(f.valor)}
        </button>
      `).join('')}
    </div>
  `;
}

function selecionarFixo(id) {
  const fixo = itensFixos.find(f => f.id === id);
  if (!fixo) return;
  document.getElementById('lancDescricao').value = fixo.nome;
  document.getElementById('lancValor').value     = fixo.valor;
  if (fixo.dia_vencimento && competenciaAtiva) {
    document.getElementById('lancData').value =
      `${competenciaAtiva.ano}-${String(competenciaAtiva.mes).padStart(2,'0')}-${String(fixo.dia_vencimento).padStart(2,'0')}`;
  }
}

function editarLancamento(id) {
  const l = lancamentos.find(x => x.id === id);
  if (!l) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Editar lançamento';
  document.getElementById('lancTipo').value         = l.tipo;
  document.getElementById('lancDescricao').value    = l.descricao;
  document.getElementById('lancValor').value        = l.valor;
  document.getElementById('lancObservacao').value   = l.observacao || '';
  document.getElementById('lancData').value         = l.data;
  atualizarSugestoesFixos(l.tipo);
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
  if (!valor || valor <= 0) { showToast('Informe um valor válido', 'warning'); return; }
  if (!data) { showToast('Informe a data', 'warning'); return; }

  const d              = new Date(data + 'T12:00:00');
  const competencia_id = await getCompetenciaId(d.getMonth() + 1, d.getFullYear());
  const payload        = { tipo, descricao, valor, data, observacao: observacao || null, pago: true };

  const { error } = editingId
    ? await window.supabase.from('lancamentos').update(payload).eq('id', editingId)
    : await window.supabase.from('lancamentos').insert({ ...payload, user_id: currentUser.id, competencia_id });

  if (error) { showToast('Erro ao salvar lançamento.', 'error'); console.error(error); return; }

  showToast(editingId ? 'Lançamento atualizado!' : 'Lançamento salvo!', 'success');
  closeModal();
  await carregarLancamentos();
}

async function deletarLancamento(id) {
  const l = lancamentos.find(x => x.id === id);
  if (!l) return;
  showConfirm('Excluir lançamento',
    `Deseja excluir "<strong>${escapeHtml(l.descricao)}</strong>"? Esta ação não pode ser desfeita.`,
    async () => {
      const { error } = await window.supabase.from('lancamentos').delete().eq('id', id);
      if (error) { showToast('Erro ao excluir.', 'error'); return; }
      showToast('Lançamento excluído.', 'success');
      await carregarLancamentos();
    }
  );
}

// ── GRÁFICOS ───────────────────────────────────

let charts = {};

function renderGraficos() {
  const t      = calcularTotais();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor  = isDark ? '#2e3348' : '#e4e7ee';
  const labelColor = isDark ? '#8b92b3' : '#6b7590';

  const barOpts = () => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { ticks: { color: labelColor, font:{size:11} }, grid: { color: gridColor } },
      x: { ticks: { color: labelColor, font:{size:11} }, grid: { display: false } }
    }
  });

  // Home — Entradas x Saídas
  const ctxBar = document.getElementById('chartHomeBar');
  if (ctxBar) {
    if (charts.homeBar) charts.homeBar.destroy();
    charts.homeBar = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: ['Entradas','Saídas'],
        datasets: [{ data: [t.entrada, t.totalSaidas],
          backgroundColor: ['#0a7c42','#c0392b'], borderRadius: 6, borderSkipped: false }]
      },
      options: barOpts()
    });
  }

  // Dashboard — Todos os tipos
  const ctxM = document.getElementById('chartDashMensal');
  if (ctxM) {
    if (charts.dashMensal) charts.dashMensal.destroy();
    charts.dashMensal = new Chart(ctxM, {
      type: 'bar',
      data: {
        labels: ['Entradas','Saídas','Cartão','Investimentos','Empréstimos','Reserva'],
        datasets: [{
          data: [t.entrada, t.saida, t.cartao_credito, t.investimento, t.emprestimo, t.reserva],
          backgroundColor: ['#0a7c42','#c0392b','#b45309','#1a56db','#6d28d9','#0e7490'],
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: barOpts()
    });
  }

  // Dashboard — Donut (só tipos com valor > 0)
  const ctxD = document.getElementById('chartDashCategoria');
  if (ctxD) {
    if (charts.dashCat) charts.dashCat.destroy();
    const itens = [
      { label:'Entradas',      val:t.entrada,        cor:'#0a7c42' },
      { label:'Saídas',        val:t.saida,          cor:'#c0392b' },
      { label:'Cartão',        val:t.cartao_credito, cor:'#b45309' },
      { label:'Investimentos', val:t.investimento,   cor:'#1a56db' },
      { label:'Empréstimos',   val:t.emprestimo,     cor:'#6d28d9' },
      { label:'Reserva',       val:t.reserva,        cor:'#0e7490' },
    ].filter(x => x.val > 0);

    if (itens.length > 0) {
      charts.dashCat = new Chart(ctxD, {
        type: 'doughnut',
        data: {
          labels: itens.map(x => x.label),
          datasets: [{ data: itens.map(x => x.val),
            backgroundColor: itens.map(x => x.cor), borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: {
            position: 'bottom',
            labels: { color: labelColor, font:{size:11}, padding:14, usePointStyle:true }
          }}
        }
      });
    }
  }
}

// ── NAVEGAÇÃO ──────────────────────────────────

const pageTitles = {
  home:'Início', lancamentos:'Lançamentos',
  dashboard:'Dashboard', relatorios:'Relatórios', configuracoes:'Configurações'
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

// ── LOGOUT ─────────────────────────────────────

async function handleLogout() {
  showConfirm('Sair do FinanceIQ', 'Deseja encerrar sua sessão?', async () => {
    await window.supabase.auth.signOut();
    window.location.href = getBaseUrl() + 'index.html';
  });
}

// ── PERFIL ─────────────────────────────────────

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

// ── CONFIGURAÇÕES — ABAS ───────────────────────

function showCfgTab(tab) {
  const tabs = ['perfil','categorias','fixos','competencias'];
  document.querySelectorAll('.cfg-tab').forEach((t,i) =>
    t.classList.toggle('active', tabs[i] === tab)
  );
  document.querySelectorAll('.cfg-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`cfg-${tab}`).style.display = 'block';
  if (tab === 'categorias')   carregarCategorias();
  if (tab === 'fixos')        carregarFixos();
  if (tab === 'competencias') renderCompetencias();
}

// ── CATEGORIAS ─────────────────────────────────

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
  const { error } = await window.supabase.from('categorias')
    .insert({ user_id: currentUser.id, nome, tipo, cor, ativa: true });
  if (error) {
    if (error.code === '23505') { showToast('Já existe uma categoria com este nome', 'warning'); return; }
    showToast('Erro ao salvar categoria', 'error'); return;
  }
  showToast('Categoria criada!', 'success');
  document.getElementById('catNome').value = '';
  await carregarCategoriasList();
  carregarCategorias();
}

async function carregarCategorias() {
  await carregarCategoriasList();
  const container = document.getElementById('listaCategorias');
  const count     = document.getElementById('catCount');
  if (!container) return;
  count.textContent = `${categorias.length} categoria${categorias.length !== 1 ? 's' : ''}`;
  if (categorias.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:32px 0">
      <div class="empty-icon"><i class="ti ti-tags"></i></div>
      <div class="empty-text">Nenhuma categoria ainda</div></div>`;
    return;
  }
  const tipoLabel = { entrada:'Entrada', saida:'Saída', ambos:'Ambos' };
  container.innerHTML = categorias.map(c => `
    <div class="cat-item">
      <div class="cat-icon" style="background:${c.cor}22">
        <i class="ti ti-tag" style="color:${c.cor}"></i>
      </div>
      <div class="cat-info">
        <div class="cat-nome">${escapeHtml(c.nome)}</div>
        <div class="cat-sub">${tipoLabel[c.tipo] || c.tipo}</div>
      </div>
      <div style="width:10px;height:10px;border-radius:50%;background:${c.cor}"></div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deletarCategoria('${c.id}')">
        <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted)"></i>
      </button>
    </div>`).join('');
}

async function deletarCategoria(id) {
  showConfirm('Excluir categoria', 'Deseja excluir esta categoria?', async () => {
    await window.supabase.from('categorias').update({ ativa: false }).eq('id', id);
    await carregarCategoriasList();
    carregarCategorias();
    showToast('Categoria excluída', 'success');
  });
}

// ── ITENS FIXOS ────────────────────────────────

async function salvarItemFixo() {
  const nome  = document.getElementById('fixoNome').value.trim();
  const tipo  = document.getElementById('fixoTipo').value;
  const valor = parseFloat(document.getElementById('fixoValor').value);
  const dia   = parseInt(document.getElementById('fixoDia').value) || null;
  const obs   = document.getElementById('fixoObs').value.trim();
  if (!nome)              { showToast('Informe o nome do item', 'warning'); return; }
  if (!valor || valor <= 0) { showToast('Informe um valor válido', 'warning'); return; }
  const { error } = await window.supabase.from('itens_fixos')
    .insert({ user_id: currentUser.id, nome, tipo, valor,
              dia_vencimento: dia, observacao: obs || null, ativo: true });
  if (error) { showToast('Erro ao salvar item fixo', 'error'); return; }
  showToast('Item fixo cadastrado!', 'success');
  ['fixoNome','fixoValor','fixoDia','fixoObs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  await carregarItensFixos();
  carregarFixos();
}

async function carregarFixos() {
  await carregarItensFixos();
  const container = document.getElementById('listaFixos');
  const count     = document.getElementById('fixoCount');
  if (!container) return;
  count.textContent = `${itensFixos.length} item${itensFixos.length !== 1 ? 'ns' : ''}`;
  if (itensFixos.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:32px 0">
      <div class="empty-icon"><i class="ti ti-refresh"></i></div>
      <div class="empty-text">Nenhum item fixo ainda</div></div>`;
    return;
  }
  container.innerHTML = itensFixos.map(f => `
    <div class="fixo-item">
      <div class="fixo-icon" style="background:${f.tipo==='entrada'?'var(--color-entrada-bg)':'var(--color-saida-bg)'}">
        <i class="ti ${f.tipo==='entrada'?'ti-trending-up':'ti-trending-down'}"
           style="color:${f.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}"></i>
      </div>
      <div class="fixo-info">
        <div class="fixo-nome">${escapeHtml(f.nome)}</div>
        <div class="fixo-sub">${f.tipo==='entrada'?'Entrada':'Saída'}${f.dia_vencimento ? ` · Dia ${f.dia_vencimento}` : ''}</div>
      </div>
      <div class="fixo-valor" style="color:${f.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">
        ${f.tipo==='entrada'?'+':'−'} ${formatCurrency(f.valor)}
      </div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deletarFixo('${f.id}')">
        <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted)"></i>
      </button>
    </div>`).join('');
}

async function deletarFixo(id) {
  showConfirm('Excluir item fixo', 'Deseja excluir este item fixo?', async () => {
    await window.supabase.from('itens_fixos').update({ ativo: false }).eq('id', id);
    await carregarItensFixos();
    carregarFixos();
    showToast('Item fixo excluído', 'success');
  });
}

// ── COMPETÊNCIAS (tela de configurações) ───────

function renderCompetencias() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Atualiza contador
  const compCount = document.getElementById('compCount');
  if (compCount) compCount.textContent =
    `${competencias.length} competência${competencias.length !== 1 ? 's' : ''}`;

  // Calcula próximo mês (o mês seguinte ao mais recente)
  const sorted   = [...competencias].sort((a,b) => a.ano!==b.ano ? b.ano-a.ano : b.mes-a.mes);
  const ultimo   = sorted[0];
  let proximoMes, proximoAno;
  if (ultimo) {
    proximoMes = ultimo.mes === 12 ? 1  : ultimo.mes + 1;
    proximoAno = ultimo.mes === 12 ? ultimo.ano + 1 : ultimo.ano;
  } else {
    const agora = new Date();
    proximoMes  = agora.getMonth() + 2 > 12 ? 1 : agora.getMonth() + 2;
    proximoAno  = agora.getMonth() + 2 > 12 ? agora.getFullYear() + 1 : agora.getFullYear();
  }

  const labelEl = document.getElementById('proximoMesLabel');
  if (labelEl) labelEl.textContent = `${meses[proximoMes - 1]} ${proximoAno}`;

  // Lista de competências
  const container = document.getElementById('listaCompetencias');
  if (!container) return;

  if (competencias.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px 0">
      <div class="empty-icon"><i class="ti ti-calendar"></i></div>
      <div class="empty-text">Nenhuma competência criada</div></div>`;
    return;
  }

  container.innerHTML = competencias.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13.5px;font-weight:500;color:var(--text-primary)">${meses[c.mes-1]} ${c.ano}</div>
        <div style="font-size:12px;color:var(--text-muted)">${String(c.mes).padStart(2,'0')}/${c.ano}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${c.id === competenciaAtiva?.id
          ? `<span style="padding:3px 10px;background:var(--color-entrada-bg);color:var(--color-entrada);border-radius:var(--radius-full);font-size:11.5px;font-weight:500">Ativa</span>`
          : `<button class="btn btn-secondary btn-sm" onclick="mudarCompetenciaEFechar('${c.id}')">Selecionar</button>`
        }
      </div>
    </div>`).join('');
}

async function mudarCompetenciaEFechar(id) {
  await mudarCompetencia(id);
  renderCompetencias();
  showToast('Competência alterada!', 'success');
}

// ── CRIAR COMPETÊNCIAS RETROATIVAS ────────────

async function criarCompetenciasRetroativas() {
  const mesInput = document.getElementById('retroMes')?.value;
  const anoInput = parseInt(document.getElementById('retroAno')?.value);

  if (!mesInput || !anoInput || isNaN(anoInput)) {
    showToast('Informe o mês e o ano de início', 'warning');
    return;
  }

  if (anoInput < 2000 || anoInput > 2099) {
    showToast('Informe um ano válido (ex: 2025)', 'warning');
    return;
  }

  // Recarrega competências antes de verificar duplicatas
  await carregarCompetencias();

  const mesInicio = parseInt(mesInput);
  const agora     = new Date();
  const mesFim    = agora.getMonth() + 1;
  const anoFim    = agora.getFullYear();

  if (anoInput > anoFim || (anoInput === anoFim && mesInicio > mesFim)) {
    showToast('O mês de início não pode ser no futuro', 'warning');
    return;
  }

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Gera lista de meses entre início e hoje
  const aGerar = [];
  let m = mesInicio, a = anoInput;
  while (a < anoFim || (a === anoFim && m <= mesFim)) {
    const jaExiste = competencias.find(c => c.mes === m && c.ano === a);
    if (!jaExiste) aGerar.push({ mes: m, ano: a });
    m++;
    if (m > 12) { m = 1; a++; }
  }

  if (aGerar.length === 0) {
    showToast('Todas as competências deste período já existem!', 'info');
    return;
  }

  showConfirm(
    'Criar competências retroativas',
    `Serão criadas <strong>${aGerar.length} competências</strong> de <strong>${meses[mesInicio-1]} ${anoInput}</strong> até <strong>${meses[mesFim-1]} ${anoFim}</strong>.`,
    async () => {
      const inserir = aGerar.map(x => ({
        user_id: currentUser.id, mes: x.mes, ano: x.ano, ativa: false
      }));

      const { error } = await window.supabase.from('competencias').insert(inserir);
      if (error) {
        console.error('Erro ao criar competências:', error);
        showToast('Erro ao criar competências: ' + error.message, 'error');
        return;
      }

      await carregarCompetencias();
      atualizarSeletorCompetencia();
      renderCompetencias();
      showToast(`${aGerar.length} competências criadas com sucesso!`, 'success');
    }
  );
}

async function gerarProximoMesComFixos() {
  await carregarCompetencias();
  const sorted = [...competencias].sort((a,b) => a.ano!==b.ano ? b.ano-a.ano : b.mes-a.mes);
  const ultimo = sorted[0];
  const meses  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let novoMes, novoAno;
  if (ultimo) {
    novoMes = ultimo.mes === 12 ? 1 : ultimo.mes + 1;
    novoAno = ultimo.mes === 12 ? ultimo.ano + 1 : ultimo.ano;
  } else {
    const agora = new Date();
    novoMes = agora.getMonth() + 2 > 12 ? 1 : agora.getMonth() + 2;
    novoAno = agora.getMonth() + 2 > 12 ? agora.getFullYear() + 1 : agora.getFullYear();
  }

  const jaExiste = competencias.find(c => c.mes === novoMes && c.ano === novoAno);
  if (jaExiste) { showToast(`${meses[novoMes-1]} ${novoAno} já existe!`, 'warning'); return; }

  showConfirm(
    'Gerar próximo mês',
    `Criar <strong>${meses[novoMes-1]} ${novoAno}</strong> importando itens fixos automaticamente?`,
    async () => {
      const { data: novaComp, error } = await window.supabase
        .from('competencias')
        .insert({ user_id: currentUser.id, mes: novoMes, ano: novoAno, ativa: false })
        .select().single();

      if (error) { showToast('Erro ao criar competência', 'error'); return; }

      await carregarItensFixos();
      if (itensFixos.length > 0) {
        const lancamentosFixos = itensFixos.map(f => ({
          user_id:        currentUser.id,
          competencia_id: novaComp.id,
          tipo:           f.tipo,
          descricao:      f.nome,
          valor:          f.valor,
          data:           `${novoAno}-${String(novoMes).padStart(2,'0')}-${String(f.dia_vencimento || 1).padStart(2,'0')}`,
          observacao:     f.observacao,
          pago:           false,
          item_fixo_id:   f.id,
        }));
        await window.supabase.from('lancamentos').insert(lancamentosFixos);
      }

      await carregarCompetencias();
      atualizarSeletorCompetencia();
      renderCompetencias();
      showToast(`${meses[novoMes-1]} ${novoAno} criado com ${itensFixos.length} item(ns) fixo(s)!`, 'success');
    }
  );
}

// ── MODAL DE CONFIRMAÇÃO ───────────────────────

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
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('confirmOkBtn').onclick = () => { modal.remove(); onConfirm(); };
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── HELPERS ────────────────────────────────────

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function getTipoIcon(tipo) {
  const icons = {
    entrada:'ti-trending-up', saida:'ti-trending-down',
    cartao_credito:'ti-credit-card', investimento:'ti-building-bank',
    emprestimo:'ti-handshake', reserva:'ti-shield-check'
  };
  return icons[tipo] || 'ti-circle';
}

function getTipoLabel(tipo) {
  const labels = {
    entrada:'Entrada', saida:'Saída', cartao_credito:'Cartão',
    investimento:'Investimento', emprestimo:'Empréstimo', reserva:'Reserva'
  };
  return labels[tipo] || tipo;
}

// ── EVENTOS ────────────────────────────────────

document.getElementById('modalLancamento')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('lancTipo')?.addEventListener('change', function() {
  atualizarSugestoesFixos(this.value);
});