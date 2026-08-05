// ================================================
// APP.JS — FinanceIQ v5 — CRUD completo corrigido
// ================================================

// ── ESTADO GLOBAL ─────────────────────────────
let currentUser      = null;
let currentPage      = 'home';
let lancamentos      = [];
let competencias     = [];
let competenciaAtiva = null;
let editingId        = null;
let itensFixos       = [];
let categorias       = [];
let editingFixoId    = null;
let editingCatId     = null;

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

async function excluirCompetencia(id) {
  const comp = competencias.find(c => c.id === id);
  if (!comp) return;
  if (comp.id === competenciaAtiva?.id) {
    showToast('Não é possível excluir a competência ativa', 'warning');
    return;
  }
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  showConfirm(
    'Excluir competência',
    `Deseja excluir <strong>${meses[comp.mes-1]} ${comp.ano}</strong>?<br>Todos os lançamentos deste mês também serão excluídos. Esta ação não pode ser desfeita.`,
    async () => {
      await window.supabase.from('lancamentos').delete().eq('competencia_id', id);
      const { error } = await window.supabase.from('competencias').delete().eq('id', id);
      if (error) { showToast('Erro ao excluir competência', 'error'); return; }
      await carregarCompetencias();
      atualizarSeletorCompetencia();
      renderCompetencias();
      showToast('Competência excluída com sucesso', 'success');
    }
  );
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
    if (tipo && t[tipo] !== undefined) t[tipo] += parseFloat(l.valor) || 0;
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
    const tipoKey   = l.tipo === 'cartao_credito' ? 'cartao' : l.tipo;
    const corValida = ['entrada','saida','cartao','investimento','emprestimo','reserva'].includes(tipoKey);
    const bg  = corValida ? `var(--color-${tipoKey}-bg)` : 'var(--surface-alt)';
    const cor = corValida ? `var(--color-${tipoKey})`    : 'var(--text-secondary)';
    return `
    <div class="lancamento-item">
      <div class="tx-icon-wrap" style="background:${bg}">
        <i class="ti ${getTipoIcon(l.tipo)}" style="color:${cor}"></i>
      </div>
      <div class="lancamento-info">
        <div class="lancamento-desc">${escapeHtml(l.descricao)}</div>
        <div class="lancamento-data">${formatDate(l.data)} · ${getTipoLabel(l.tipo)}</div>
      </div>
      <div class="lancamento-valor" style="color:${l.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">
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

  const lista = lancamentos.filter(l => {
    const matchTipo  = filtroTipo === 'todos' || l.tipo === filtroTipo;
    const matchBusca = l.descricao.toLowerCase().includes(filtroBusca.toLowerCase());
    return matchTipo && matchBusca;
  });

  const t     = calcularTotais();
  const saldo = t.saldo;

  // Monta o HTML completo
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:200px">
        <i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:15px;pointer-events:none"></i>
        <input id="inputBusca" type="text" class="form-control" style="padding-left:32px"
          placeholder="Buscar lançamento..." value="${escapeHtml(filtroBusca)}" />
      </div>
      <select id="selectFiltroTipo" class="form-control" style="width:auto;min-width:150px">
        <option value="todos"          ${filtroTipo==='todos'?'selected':''}>Todos os tipos</option>
        <option value="entrada"        ${filtroTipo==='entrada'?'selected':''}>Entradas</option>
        <option value="saida"          ${filtroTipo==='saida'?'selected':''}>Saídas</option>
        <option value="cartao_credito" ${filtroTipo==='cartao_credito'?'selected':''}>Cartão</option>
        <option value="investimento"   ${filtroTipo==='investimento'?'selected':''}>Investimentos</option>
        <option value="emprestimo"     ${filtroTipo==='emprestimo'?'selected':''}>Empréstimos</option>
        <option value="reserva"        ${filtroTipo==='reserva'?'selected':''}>Reserva</option>
      </select>
      <button id="btnNovoLancamento" class="btn btn-primary btn-sm">
        <i class="ti ti-plus"></i>Novo
      </button>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      ${[
        {label:'Entradas', val:t.entrada,     cor:'var(--color-entrada)', bg:'var(--color-entrada-bg)'},
        {label:'Saídas',   val:t.totalSaidas, cor:'var(--color-saida)',   bg:'var(--color-saida-bg)'},
        {label:'Saldo',    val:saldo,
          cor:saldo>=0?'var(--color-entrada)':'var(--color-saida)',
          bg:saldo>=0?'var(--color-entrada-bg)':'var(--color-saida-bg)'},
      ].map(x=>`
        <div style="background:${x.bg};border-radius:var(--radius);padding:10px 16px;min-width:140px">
          <div style="font-size:11px;color:${x.cor};font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${x.label}</div>
          <div style="font-size:18px;font-weight:600;color:${x.cor}">${formatCurrency(x.val)}</div>
        </div>
      `).join('')}
    </div>

    ${lista.length === 0 ? `
      <div class="empty-state" style="margin-top:40px">
        <div class="empty-icon"><i class="ti ti-search-off"></i></div>
        <div class="empty-text">Nenhum lançamento encontrado</div>
        <div class="empty-sub">Tente ajustar os filtros</div>
      </div>
    ` : `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
        <div style="display:grid;grid-template-columns:110px 1fr 90px 120px 72px;gap:8px;padding:10px 14px;background:var(--surface-alt);border-bottom:1px solid var(--border)">
          ${['Tipo','Descrição','Data','Valor',''].map(h=>
            `<div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em${h==='Valor'?';text-align:right':''}">${h}</div>`
          ).join('')}
        </div>
        <div id="listaLancamentosRows">
          ${lista.map(l => `
            <div style="display:grid;grid-template-columns:110px 1fr 90px 120px 72px;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);align-items:center"
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
              <div style="display:flex;gap:2px;justify-content:flex-end;flex-shrink:0">
                <button class="btn btn-ghost btn-icon btn-sm btn-editar-lanc" data-id="${l.id}" title="Editar"
                  style="width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;flex-shrink:0">
                  <i class="ti ti-edit" style="font-size:14px;color:var(--text-muted);pointer-events:none"></i>
                </button>
                <button class="btn btn-ghost btn-icon btn-sm btn-deletar-lanc" data-id="${l.id}" title="Excluir"
                  style="width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;flex-shrink:0">
                  <i class="ti ti-trash" style="font-size:14px;color:var(--text-muted);pointer-events:none"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="padding:12px 16px;background:var(--surface-alt);border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;color:var(--text-muted)">${lista.length} lançamento${lista.length!==1?'s':''}</div>
          <div style="font-size:13px;font-weight:600;color:${saldo>=0?'var(--color-entrada)':'var(--color-saida)'}">Saldo: ${formatCurrency(saldo)}</div>
        </div>
      </div>
    `}
  `;

  // Vincula eventos APÓS renderizar — essa é a correção principal
  const inputBusca = document.getElementById('inputBusca');
  if (inputBusca) {
    inputBusca.addEventListener('input', e => {
      filtroBusca = e.target.value;
      renderTabelaLancamentos();
    });
  }

  const selectFiltro = document.getElementById('selectFiltroTipo');
  if (selectFiltro) {
    selectFiltro.addEventListener('change', e => {
      filtroTipo = e.target.value;
      renderTabelaLancamentos();
    });
  }

  const btnNovo = document.getElementById('btnNovoLancamento');
  if (btnNovo) {
    btnNovo.addEventListener('click', () => openLancamento());
  }

  // Botões de editar/excluir de cada linha
  document.querySelectorAll('.btn-editar-lanc').forEach(btn => {
    btn.addEventListener('click', () => editarLancamento(btn.dataset.id));
  });

  document.querySelectorAll('.btn-deletar-lanc').forEach(btn => {
    btn.addEventListener('click', () => deletarLancamento(btn.dataset.id));
  });
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

  renderTiposNoModal(tipo);
  carregarItensFixos().then(() => atualizarSugestoesFixos(tipo));
  document.getElementById('modalLancamento').style.display = 'flex';
  setTimeout(() => document.getElementById('lancDescricao').focus(), 150);
}

function renderTiposNoModal(tipoSelecionado) {
  const select = document.getElementById('lancTipo');
  if (!select) return;
  const tiposFixos = [
    { value:'entrada',        label:'Entrada' },
    { value:'saida',          label:'Saída' },
    { value:'cartao_credito', label:'Cartão de crédito' },
    { value:'investimento',   label:'Investimento' },
    { value:'emprestimo',     label:'Empréstimo' },
    { value:'reserva',        label:'Reserva financeira' },
  ];
  select.innerHTML = tiposFixos.map(t =>
    `<option value="${t.value}" ${tipoSelecionado===t.value?'selected':''}>${t.label}</option>`
  ).join('');

  const catPersonalizadas = categorias.filter(c =>
    !tiposFixos.find(t => t.value === c.nome.toLowerCase().replace(/\s+/g,'_'))
  );
  if (catPersonalizadas.length > 0) {
    select.innerHTML += `<optgroup label="Categorias personalizadas">
      ${catPersonalizadas.map(c =>
        `<option value="cat_${c.id}" ${tipoSelecionado===`cat_${c.id}`?'selected':''}>${escapeHtml(c.nome)}</option>`
      ).join('')}
    </optgroup>`;
  }
}

function atualizarSugestoesFixos(tipo) {
  const container = document.getElementById('sugestoesFixos');
  if (!container) return;
  const fixosFiltrados = itensFixos.filter(f =>
    tipo === 'cartao_credito' ? f.tipo === 'saida' : f.tipo === tipo
  );
  if (fixosFiltrados.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = `
    <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:8px">
      Itens fixos — clique para preencher:
    </div>
    <div id="botoesFixos" style="display:flex;flex-wrap:wrap;gap:6px"></div>
  `;
  const div = document.getElementById('botoesFixos');
  fixosFiltrados.forEach(f => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${f.nome} · ${formatCurrency(f.valor)}`;
    btn.style.cssText = 'padding:5px 12px;border-radius:var(--radius-full);border:1px solid var(--border);background:var(--surface-alt);font-size:12.5px;cursor:pointer;font-family:var(--font);color:var(--text-secondary);transition:all 150ms ease';
    btn.addEventListener('mouseenter', () => { btn.style.borderColor='var(--accent)'; btn.style.color='var(--accent)'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor='var(--border)'; btn.style.color='var(--text-secondary)'; });
    btn.addEventListener('click', () => selecionarFixo(f.id));
    div.appendChild(btn);
  });
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
  renderTiposNoModal(l.tipo);
  document.getElementById('lancDescricao').value  = l.descricao;
  document.getElementById('lancValor').value      = l.valor;
  document.getElementById('lancObservacao').value = l.observacao || '';
  document.getElementById('lancData').value       = l.data;
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

  let error;
  if (editingId) {
    const res = await window.supabase.from('lancamentos').update(payload).eq('id', editingId);
    error = res.error;
  } else {
    const res = await window.supabase.from('lancamentos')
      .insert({ ...payload, user_id: currentUser.id, competencia_id });
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
    `Tem certeza que deseja excluir "<strong>${escapeHtml(l.descricao)}</strong>"?<br>Essa ação não poderá ser desfeita.`,
    async () => {
      const { error } = await window.supabase.from('lancamentos').delete().eq('id', id);
      if (error) { showToast('Erro ao excluir.', 'error'); console.error(error); return; }
      showToast('Lançamento excluído.', 'success');
      await carregarLancamentos();
    }
  );
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

  let error;
  if (editingFixoId) {
    const res = await window.supabase.from('itens_fixos')
      .update({ nome, tipo, valor, dia_vencimento: dia, observacao: obs || null })
      .eq('id', editingFixoId);
    error = res.error;
  } else {
    const res = await window.supabase.from('itens_fixos')
      .insert({ user_id: currentUser.id, nome, tipo, valor,
                dia_vencimento: dia, observacao: obs || null, ativo: true });
    error = res.error;
  }

  if (error) { showToast('Erro ao salvar item fixo', 'error'); console.error(error); return; }
  showToast(editingFixoId ? 'Item fixo atualizado!' : 'Item fixo cadastrado!', 'success');
  cancelarEdicaoFixo();
  await carregarItensFixos();
  carregarFixos();
}

function iniciarEdicaoFixo(id) {
  const f = itensFixos.find(x => x.id === id);
  if (!f) return;
  editingFixoId = id;
  document.getElementById('fixoNome').value  = f.nome;
  document.getElementById('fixoTipo').value  = f.tipo;
  document.getElementById('fixoValor').value = f.valor;
  document.getElementById('fixoDia').value   = f.dia_vencimento || '';
  document.getElementById('fixoObs').value   = f.observacao || '';
  const btnTexto    = document.getElementById('fixoBtnTexto');
  const btnCancelar = document.getElementById('fixoBtnCancelar');
  if (btnTexto)    btnTexto.textContent = 'Salvar alterações';
  if (btnCancelar) btnCancelar.style.display = 'inline-flex';
  document.getElementById('fixoNome').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('fixoNome').focus();
  showToast('Edite os dados e clique em Salvar alterações', 'info', 3000);
}

function cancelarEdicaoFixo() {
  editingFixoId = null;
  const btnTexto    = document.getElementById('fixoBtnTexto');
  const btnCancelar = document.getElementById('fixoBtnCancelar');
  if (btnTexto)    btnTexto.textContent = 'Adicionar item fixo';
  if (btnCancelar) btnCancelar.style.display = 'none';
  ['fixoNome','fixoValor','fixoDia','fixoObs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tipoEl = document.getElementById('fixoTipo');
  if (tipoEl) tipoEl.value = 'entrada';
}

async function carregarFixos() {
  await carregarItensFixos();
  const container = document.getElementById('listaFixos');
  const count     = document.getElementById('fixoCount');
  if (!container) return;
  if (count) count.textContent = `${itensFixos.length} item${itensFixos.length !== 1 ? 'ns' : ''}`;

  if (itensFixos.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:32px 0">
      <div class="empty-icon"><i class="ti ti-refresh"></i></div>
      <div class="empty-text">Nenhum item fixo ainda</div></div>`;
    return;
  }

  container.innerHTML = itensFixos.map(f => `
    <div class="fixo-item" id="fixo-row-${f.id}">
      <div class="fixo-icon" style="background:${f.tipo==='entrada'?'var(--color-entrada-bg)':'var(--color-saida-bg)'}">
        <i class="ti ${f.tipo==='entrada'?'ti-trending-up':'ti-trending-down'}"
           style="color:${f.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}"></i>
      </div>
      <div class="fixo-info">
        <div class="fixo-nome">${escapeHtml(f.nome)}</div>
        <div class="fixo-sub">${f.tipo==='entrada'?'Entrada':'Saída'}${f.dia_vencimento?` · Dia ${f.dia_vencimento}`:''}${f.observacao?` · ${escapeHtml(f.observacao)}`:''}</div>
      </div>
      <div class="fixo-valor" style="color:${f.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">
        ${f.tipo==='entrada'?'+':'−'} ${formatCurrency(f.valor)}
      </div>
      <button class="btn btn-ghost btn-icon btn-sm btn-editar-fixo" data-id="${f.id}" title="Editar">
        <i class="ti ti-edit" style="font-size:15px;color:var(--text-muted);pointer-events:none"></i>
      </button>
      <button class="btn btn-ghost btn-icon btn-sm btn-deletar-fixo" data-id="${f.id}" title="Excluir">
        <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted);pointer-events:none"></i>
      </button>
    </div>`).join('');

  // Vincula eventos após renderizar
  document.querySelectorAll('.btn-editar-fixo').forEach(btn => {
    btn.addEventListener('click', () => iniciarEdicaoFixo(btn.dataset.id));
  });
  document.querySelectorAll('.btn-deletar-fixo').forEach(btn => {
    btn.addEventListener('click', () => deletarFixo(btn.dataset.id));
  });
}

async function deletarFixo(id) {
  const f = itensFixos.find(x => x.id === id);
  if (!f) return;
  showConfirm(
    'Excluir item fixo',
    `Tem certeza que deseja excluir "<strong>${escapeHtml(f.nome)}</strong>"?<br>Essa ação não poderá ser desfeita.`,
    async () => {
      const { error } = await window.supabase.from('itens_fixos').update({ ativo: false }).eq('id', id);
      if (error) { showToast('Erro ao excluir', 'error'); console.error(error); return; }
      if (editingFixoId === id) cancelarEdicaoFixo();
      await carregarItensFixos();
      carregarFixos();
      showToast('Item fixo excluído', 'success');
    }
  );
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

  let error;
  if (editingCatId) {
    const res = await window.supabase.from('categorias')
      .update({ nome, tipo, cor }).eq('id', editingCatId);
    error = res.error;
  } else {
    const res = await window.supabase.from('categorias')
      .insert({ user_id: currentUser.id, nome, tipo, cor, ativa: true });
    error = res.error;
  }

  if (error) {
    if (error.code === '23505') { showToast('Já existe uma categoria com este nome', 'warning'); return; }
    showToast('Erro ao salvar categoria', 'error'); console.error(error); return;
  }
  showToast(editingCatId ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
  cancelarEdicaoCategoria();
  await carregarCategoriasList();
  carregarCategorias();
}

function iniciarEdicaoCategoria(id) {
  const c = categorias.find(x => x.id === id);
  if (!c) return;
  editingCatId = id;
  document.getElementById('catNome').value = c.nome;
  document.getElementById('catTipo').value = c.tipo;
  document.getElementById('catCor').value  = c.cor;
  document.querySelectorAll('.cor-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cor === c.cor);
  });
  const btnTexto    = document.getElementById('catBtnTexto');
  const btnCancelar = document.getElementById('catBtnCancelar');
  if (btnTexto)    btnTexto.textContent = 'Salvar alterações';
  if (btnCancelar) btnCancelar.style.display = 'inline-flex';
  document.getElementById('catNome').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('catNome').focus();
  showToast('Edite os dados e clique em Salvar alterações', 'info', 3000);
}

function cancelarEdicaoCategoria() {
  editingCatId = null;
  const btnTexto    = document.getElementById('catBtnTexto');
  const btnCancelar = document.getElementById('catBtnCancelar');
  if (btnTexto)    btnTexto.textContent = 'Adicionar categoria';
  if (btnCancelar) btnCancelar.style.display = 'none';
  const nomeEl = document.getElementById('catNome');
  const tipoEl = document.getElementById('catTipo');
  if (nomeEl) nomeEl.value = '';
  if (tipoEl) tipoEl.value = 'saida';
}

async function carregarCategorias() {
  await carregarCategoriasList();
  const container = document.getElementById('listaCategorias');
  const count     = document.getElementById('catCount');
  if (!container) return;
  if (count) count.textContent = `${categorias.length} categoria${categorias.length !== 1 ? 's' : ''}`;

  if (categorias.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:32px 0">
      <div class="empty-icon"><i class="ti ti-tags"></i></div>
      <div class="empty-text">Nenhuma categoria ainda</div></div>`;
    return;
  }

  const tipoLabel = { entrada:'Entrada', saida:'Saída', ambos:'Ambos' };
  container.innerHTML = categorias.map(c => `
    <div class="cat-item" id="cat-row-${c.id}">
      <div class="cat-icon" style="background:${c.cor}22">
        <i class="ti ti-tag" style="color:${c.cor}"></i>
      </div>
      <div class="cat-info">
        <div class="cat-nome">${escapeHtml(c.nome)}</div>
        <div class="cat-sub">${tipoLabel[c.tipo] || c.tipo}</div>
      </div>
      <div style="width:10px;height:10px;border-radius:50%;background:${c.cor};flex-shrink:0"></div>
      <button class="btn btn-ghost btn-icon btn-sm btn-editar-cat" data-id="${c.id}" title="Editar">
        <i class="ti ti-edit" style="font-size:15px;color:var(--text-muted);pointer-events:none"></i>
      </button>
      <button class="btn btn-ghost btn-icon btn-sm btn-deletar-cat" data-id="${c.id}" title="Excluir">
        <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted);pointer-events:none"></i>
      </button>
    </div>`).join('');

  // Vincula eventos após renderizar
  document.querySelectorAll('.btn-editar-cat').forEach(btn => {
    btn.addEventListener('click', () => iniciarEdicaoCategoria(btn.dataset.id));
  });
  document.querySelectorAll('.btn-deletar-cat').forEach(btn => {
    btn.addEventListener('click', () => deletarCategoria(btn.dataset.id));
  });
}

async function deletarCategoria(id) {
  const c = categorias.find(x => x.id === id);
  if (!c) return;
  showConfirm(
    'Excluir categoria',
    `Tem certeza que deseja excluir "<strong>${escapeHtml(c.nome)}</strong>"?<br>Essa ação não poderá ser desfeita.`,
    async () => {
      const { error } = await window.supabase.from('categorias').update({ ativa: false }).eq('id', id);
      if (error) { showToast('Erro ao excluir', 'error'); console.error(error); return; }
      if (editingCatId === id) cancelarEdicaoCategoria();
      await carregarCategoriasList();
      carregarCategorias();
      showToast('Categoria excluída', 'success');
    }
  );
}

// ── COMPETÊNCIAS (tela) ────────────────────────

function renderCompetencias() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const compCount = document.getElementById('compCount');
  if (compCount) compCount.textContent =
    `${competencias.length} competência${competencias.length !== 1 ? 's' : ''}`;

  const sorted = [...competencias].sort((a,b) => a.ano!==b.ano ? b.ano-a.ano : b.mes-a.mes);
  const ultimo = sorted[0];
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
          : `<button class="btn btn-secondary btn-sm btn-sel-comp" data-id="${c.id}">Selecionar</button>
             <button class="btn btn-ghost btn-icon btn-sm btn-del-comp" data-id="${c.id}" title="Excluir">
               <i class="ti ti-trash" style="font-size:15px;color:var(--text-muted);pointer-events:none"></i>
             </button>`
        }
      </div>
    </div>`).join('');

  // Vincula eventos
  document.querySelectorAll('.btn-sel-comp').forEach(btn => {
    btn.addEventListener('click', () => mudarCompetenciaEFechar(btn.dataset.id));
  });
  document.querySelectorAll('.btn-del-comp').forEach(btn => {
    btn.addEventListener('click', () => excluirCompetencia(btn.dataset.id));
  });
}

async function mudarCompetenciaEFechar(id) {
  await mudarCompetencia(id);
  renderCompetencias();
  showToast('Competência alterada!', 'success');
}

async function criarCompetenciasRetroativas() {
  const mesInput = document.getElementById('retroMes')?.value;
  const anoInput = parseInt(document.getElementById('retroAno')?.value);
  if (!mesInput || !anoInput || isNaN(anoInput)) { showToast('Informe o mês e o ano de início', 'warning'); return; }
  if (anoInput < 2000 || anoInput > 2099) { showToast('Informe um ano válido (ex: 2025)', 'warning'); return; }

  await carregarCompetencias();
  const mesInicio = parseInt(mesInput);
  const agora     = new Date();
  const mesFim    = agora.getMonth() + 1;
  const anoFim    = agora.getFullYear();

  if (anoInput > anoFim || (anoInput === anoFim && mesInicio > mesFim)) {
    showToast('O mês de início não pode ser no futuro', 'warning'); return;
  }

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const aGerar = [];
  let m = mesInicio, a = anoInput;
  while (a < anoFim || (a === anoFim && m <= mesFim)) {
    if (!competencias.find(c => c.mes === m && c.ano === a)) aGerar.push({ mes: m, ano: a });
    m++; if (m > 12) { m = 1; a++; }
  }
  if (aGerar.length === 0) { showToast('Todas as competências deste período já existem!', 'info'); return; }

  showConfirm('Criar competências retroativas',
    `Serão criadas <strong>${aGerar.length} competências</strong> de <strong>${meses[mesInicio-1]} ${anoInput}</strong> até <strong>${meses[mesFim-1]} ${anoFim}</strong>.`,
    async () => {
      const { error } = await window.supabase.from('competencias')
        .insert(aGerar.map(x => ({ user_id: currentUser.id, mes: x.mes, ano: x.ano, ativa: false })));
      if (error) { showToast('Erro ao criar competências: ' + error.message, 'error'); return; }
      await carregarCompetencias();
      atualizarSeletorCompetencia();
      renderCompetencias();
      showToast(`${aGerar.length} competências criadas!`, 'success');
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
  if (competencias.find(c => c.mes === novoMes && c.ano === novoAno)) {
    showToast(`${meses[novoMes-1]} ${novoAno} já existe!`, 'warning'); return;
  }
  showConfirm('Gerar próximo mês',
    `Criar <strong>${meses[novoMes-1]} ${novoAno}</strong> importando itens fixos automaticamente?`,
    async () => {
      const { data: novaComp, error } = await window.supabase
        .from('competencias').insert({ user_id: currentUser.id, mes: novoMes, ano: novoAno, ativa: false })
        .select().single();
      if (error) { showToast('Erro ao criar competência', 'error'); return; }
      await carregarItensFixos();
      if (itensFixos.length > 0) {
        await window.supabase.from('lancamentos').insert(
          itensFixos.map(f => ({
            user_id: currentUser.id, competencia_id: novaComp.id,
            tipo: f.tipo, descricao: f.nome, valor: f.valor,
            data: `${novoAno}-${String(novoMes).padStart(2,'0')}-${String(f.dia_vencimento || 1).padStart(2,'0')}`,
            observacao: f.observacao, pago: false, item_fixo_id: f.id,
          }))
        );
      }
      await carregarCompetencias();
      atualizarSeletorCompetencia();
      renderCompetencias();
      showToast(`${meses[novoMes-1]} ${novoAno} criado com ${itensFixos.length} item(ns) fixo(s)!`, 'success');
    }
  );
}

// ── IMPORTAÇÃO CSV ─────────────────────────────

let dadosImportacao = null;

function iniciarImportacao() {
  ['importacaoStep1','importacaoStep2','importacaoStep3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.style.display = i === 0 ? 'block' : 'none';
  });
  dadosImportacao = null;
}

function processarArquivoCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text      = e.target.result;
      const linhas    = text.split(/\r?\n/).filter(l => l.trim());
      const cabecalho = linhas[0].split(/[,;]/).map(c =>
        c.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_')
      );
      const registros = linhas.slice(1).filter(l => l.trim()).map(linha => {
        const cols = linha.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g,''));
        const obj = {};
        cabecalho.forEach((h, i) => { obj[h] = cols[i] || ''; });
        return obj;
      }).filter(r => Object.values(r).some(v => v));

      const colData  = cabecalho.find(c => ['data','date','dt','dia'].some(p => c.includes(p)))  || cabecalho[0];
      const colDesc  = cabecalho.find(c => ['descricao','description','desc','historico','lancamento','item'].some(p => c.includes(p))) || cabecalho[1];
      const colValor = cabecalho.find(c => ['valor','value','amount','vl','vlr'].some(p => c.includes(p))) || cabecalho[2];
      const colTipo  = cabecalho.find(c => ['tipo','type','categoria','category','natureza'].some(p => c.includes(p)));

      const mesesEncontrados       = new Set();
      const lancamentosProcessados = [];

      registros.forEach(r => {
        const dataStr = r[colData]  || '';
        const descStr = r[colDesc]  || '';
        const valStr  = r[colValor] || '0';
        const tipoStr = colTipo ? r[colTipo] : '';

        let dataObj = null;
        for (const fmt of [/(\d{2})\/(\d{2})\/(\d{4})/, /(\d{4})-(\d{2})-(\d{2})/, /(\d{2})-(\d{2})-(\d{4})/]) {
          const m = dataStr.match(fmt);
          if (m) {
            dataObj = fmt.toString().startsWith('/(\d{4})') || fmt === /(\d{4})-(\d{2})-(\d{2})/
              ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
              : new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`);
            break;
          }
        }
        if (!dataObj || isNaN(dataObj)) return;

        const mes = dataObj.getMonth() + 1;
        const ano = dataObj.getFullYear();
        mesesEncontrados.add(`${mes}/${ano}`);

        let valor = parseFloat(valStr.replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
        if (valor < 0) valor = Math.abs(valor);

        let tipo = 'saida';
        const tipoLow = (tipoStr || '').toLowerCase();
        if      (tipoLow.includes('entrada') || tipoLow.includes('receita') || tipoLow.includes('credito') || tipoLow.includes('crédito')) tipo = 'entrada';
        else if (tipoLow.includes('invest'))   tipo = 'investimento';
        else if (tipoLow.includes('emprés') || tipoLow.includes('emprest')) tipo = 'emprestimo';
        else if (tipoLow.includes('reserva'))  tipo = 'reserva';
        else if (tipoLow.includes('cartao') || tipoLow.includes('cartão') || tipoLow.includes('card')) tipo = 'cartao_credito';

        lancamentosProcessados.push({
          data: dataObj.toISOString().split('T')[0],
          descricao: descStr || 'Sem descrição',
          valor, tipo, mes, ano,
        });
      });

      dadosImportacao = { lancamentosProcessados, mesesEncontrados };
      mostrarPreviewImportacao();
    } catch (err) {
      console.error(err);
      showToast('Erro ao processar o arquivo. Verifique se é um CSV válido.', 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function mostrarPreviewImportacao() {
  if (!dadosImportacao) return;
  const { lancamentosProcessados, mesesEncontrados } = dadosImportacao;
  const s1 = document.getElementById('importacaoStep1');
  const s2 = document.getElementById('importacaoStep2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesesOrdenados = [...mesesEncontrados].sort((a, b) => {
    const [mA, aA] = a.split('/').map(Number);
    const [mB, aB] = b.split('/').map(Number);
    return aA !== aB ? aA - aB : mA - mB;
  });

  const container = document.getElementById('previewImportacao');
  if (!container) return;
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
      <div style="background:var(--accent-bg);border-radius:var(--radius);padding:12px 16px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:var(--accent)">${mesesEncontrados.size}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Meses encontrados</div>
      </div>
      <div style="background:var(--color-entrada-bg);border-radius:var(--radius);padding:12px 16px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:var(--color-entrada)">${lancamentosProcessados.length}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Lançamentos</div>
      </div>
      <div style="background:var(--color-investimento-bg);border-radius:var(--radius);padding:12px 16px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:var(--color-investimento)">${lancamentosProcessados.filter(l=>l.tipo==='entrada').length}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Entradas</div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Meses que serão importados:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${mesesOrdenados.map(m => {
          const [mes, ano] = m.split('/').map(Number);
          return `<span style="padding:4px 12px;background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius-full);font-size:12.5px;color:var(--text-secondary)">${meses[mes-1]} ${ano}</span>`;
        }).join('')}
      </div>
    </div>
    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Primeiros 5 lançamentos:</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        <div style="display:grid;grid-template-columns:100px 1fr 80px 110px;gap:8px;padding:8px 12px;background:var(--surface-alt);font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">
          <div>Data</div><div>Descrição</div><div>Tipo</div><div style="text-align:right">Valor</div>
        </div>
        ${lancamentosProcessados.slice(0,5).map(l => `
          <div style="display:grid;grid-template-columns:100px 1fr 80px 110px;gap:8px;padding:8px 12px;border-top:1px solid var(--border);font-size:13px;align-items:center">
            <div style="color:var(--text-secondary)">${formatDate(l.data)}</div>
            <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.descricao)}</div>
            <div><span class="tipo-badge ${l.tipo}" style="font-size:11px">${getTipoLabel(l.tipo)}</span></div>
            <div style="text-align:right;font-weight:600;color:${l.tipo==='entrada'?'var(--color-entrada)':'var(--color-saida)'}">${formatCurrency(l.valor)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function confirmarImportacao() {
  if (!dadosImportacao) return;
  const { lancamentosProcessados } = dadosImportacao;
  const s2 = document.getElementById('importacaoStep2');
  const s3 = document.getElementById('importacaoStep3');
  if (s2) s2.style.display = 'none';
  if (s3) s3.style.display = 'block';
  const progresso = document.getElementById('importacaoProgresso');
  if (progresso) progresso.textContent = 'Iniciando importação...';

  let importados = 0, ignorados = 0;
  const porMes = {};
  lancamentosProcessados.forEach(l => {
    const chave = `${l.mes}/${l.ano}`;
    if (!porMes[chave]) porMes[chave] = [];
    porMes[chave].push(l);
  });

  await carregarCompetencias();

  for (const [chave, lancsMes] of Object.entries(porMes)) {
    const [mes, ano] = chave.split('/').map(Number);
    if (progresso) progresso.textContent = `Importando ${new Date(ano, mes-1).toLocaleString('pt-BR', {month:'long'})} ${ano}...`;
    await garantirCompetencia(mes, ano);
    const competencia_id = await getCompetenciaId(mes, ano);
    const { data: existentes } = await window.supabase
      .from('lancamentos').select('descricao,data,valor')
      .eq('user_id', currentUser.id).eq('competencia_id', competencia_id);
    const existentesSet = new Set((existentes || []).map(e => `${e.data}|${e.descricao}|${e.valor}`));
    const paraInserir = lancsMes.filter(l => !existentesSet.has(`${l.data}|${l.descricao}|${l.valor}`));
    ignorados += lancsMes.length - paraInserir.length;
    if (paraInserir.length > 0) {
      const { error } = await window.supabase.from('lancamentos').insert(
        paraInserir.map(l => ({
          user_id: currentUser.id, competencia_id,
          tipo: l.tipo, descricao: l.descricao, valor: l.valor, data: l.data, pago: true,
        }))
      );
      if (!error) importados += paraInserir.length;
    }
  }

  await carregarCompetencias();
  atualizarSeletorCompetencia();
  await carregarLancamentos();

  if (progresso) progresso.innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="width:48px;height:48px;background:var(--color-entrada-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
        <i class="ti ti-circle-check" style="font-size:24px;color:var(--color-entrada)"></i>
      </div>
      <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Importação concluída!</div>
      <div style="font-size:13px;color:var(--text-secondary)">
        <strong style="color:var(--color-entrada)">${importados}</strong> lançamentos importados ·
        <strong style="color:var(--text-muted)">${ignorados}</strong> ignorados (já existiam)
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="showCfgTab('competencias')">Ver competências</button>
    </div>
  `;
  dadosImportacao = null;
}

// ── CONFIGURAÇÕES — ABAS ───────────────────────

function showCfgTab(tab) {
  const tabs = ['perfil','categorias','fixos','competencias','importacao'];
  document.querySelectorAll('.cfg-tab').forEach((t,i) => t.classList.toggle('active', tabs[i] === tab));
  document.querySelectorAll('.cfg-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(`cfg-${tab}`);
  if (panel) panel.style.display = 'block';
  if (tab === 'categorias')   carregarCategorias();
  if (tab === 'fixos')        carregarFixos();
  if (tab === 'competencias') renderCompetencias();
  if (tab === 'importacao')   iniciarImportacao();
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

  const ctxBar = document.getElementById('chartHomeBar');
  if (ctxBar) {
    if (charts.homeBar) charts.homeBar.destroy();
    charts.homeBar = new Chart(ctxBar, {
      type: 'bar',
      data: { labels:['Entradas','Saídas'], datasets:[{ data:[t.entrada,t.totalSaidas],
        backgroundColor:['#0a7c42','#c0392b'], borderRadius:6, borderSkipped:false }] },
      options: barOpts()
    });
  }
  const ctxM = document.getElementById('chartDashMensal');
  if (ctxM) {
    if (charts.dashMensal) charts.dashMensal.destroy();
    charts.dashMensal = new Chart(ctxM, {
      type: 'bar',
      data: { labels:['Entradas','Saídas','Cartão','Investimentos','Empréstimos','Reserva'],
        datasets:[{ data:[t.entrada,t.saida,t.cartao_credito,t.investimento,t.emprestimo,t.reserva],
          backgroundColor:['#0a7c42','#c0392b','#b45309','#1a56db','#6d28d9','#0e7490'],
          borderRadius:6, borderSkipped:false }] },
      options: barOpts()
    });
  }
  const ctxD = document.getElementById('chartDashCategoria');
  if (ctxD) {
    if (charts.dashCat) charts.dashCat.destroy();
    const itens = [
      {label:'Entradas',val:t.entrada,cor:'#0a7c42'},
      {label:'Saídas',val:t.saida,cor:'#c0392b'},
      {label:'Cartão',val:t.cartao_credito,cor:'#b45309'},
      {label:'Investimentos',val:t.investimento,cor:'#1a56db'},
      {label:'Empréstimos',val:t.emprestimo,cor:'#6d28d9'},
      {label:'Reserva',val:t.reserva,cor:'#0e7490'},
    ].filter(x => x.val > 0);
    if (itens.length > 0) {
      charts.dashCat = new Chart(ctxD, {
        type: 'doughnut',
        data: { labels:itens.map(x=>x.label), datasets:[{ data:itens.map(x=>x.val),
          backgroundColor:itens.map(x=>x.cor), borderWidth:0 }] },
        options: { responsive:true, maintainAspectRatio:false, cutout:'65%',
          plugins:{ legend:{ position:'bottom',
            labels:{ color:labelColor, font:{size:11}, padding:14, usePointStyle:true } } } }
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
        <button class="btn btn-secondary btn-sm" id="confirmCancelBtn">Cancelar</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;border-color:var(--danger)" id="confirmOkBtn">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('confirmOkBtn').addEventListener('click', () => { modal.remove(); onConfirm(); });
  document.getElementById('confirmCancelBtn').addEventListener('click', () => modal.remove());
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getTipoIcon(tipo) {
  const icons = {
    entrada:'ti-trending-up', saida:'ti-trending-down',
    cartao_credito:'ti-credit-card', investimento:'ti-building-bank',
    emprestimo:'ti-handshake', reserva:'ti-shield-check'
  };
  return icons[tipo] || 'ti-tag';
}

function getTipoLabel(tipo) {
  if (!tipo) return '—';
  if (tipo.startsWith('cat_')) {
    const cat = categorias.find(c => c.id === tipo.replace('cat_',''));
    return cat ? cat.nome : tipo;
  }
  const labels = {
    entrada:'Entrada', saida:'Saída', cartao_credito:'Cartão',
    investimento:'Investimento', emprestimo:'Empréstimo', reserva:'Reserva'
  };
  return labels[tipo] || tipo;
}

// ── EVENTOS DO MODAL ───────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const lancTipo = document.getElementById('lancTipo');
  if (lancTipo) {
    lancTipo.addEventListener('change', function() {
      atualizarSugestoesFixos(this.value);
    });
  }
  const modalEl = document.getElementById('modalLancamento');
  if (modalEl) {
    modalEl.addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
});
