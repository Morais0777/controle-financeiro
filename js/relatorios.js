// ================================================
// RELATORIOS.JS — FinanceIQ v6
// Geração de PDF profissional: Mensal · Trimestral · Anual
// Reutiliza tiposConfig e lógica de período do Dashboard
// ================================================

// ── CONFIGURAÇÃO GLOBAL DE TIPOS ───────────────
// Espelho do tiposConfig do dashboard (app.js) para manter consistência
const REL_TIPOS_CONFIG = [
  { key:'entrada',        label:'Entradas',     icon:'ti-trending-up',   corHex:'#0a7c42', bg:[240,253,244], cor:[10,124,66]   },
  { key:'saida',          label:'Saídas',        icon:'ti-trending-down', corHex:'#c0392b', bg:[255,241,242], cor:[192,57,43]   },
  { key:'cartao_credito', label:'Cartão',         icon:'ti-credit-card',   corHex:'#b45309', bg:[255,247,237], cor:[180,83,9]    },
  { key:'investimento',   label:'Investimentos', icon:'ti-building-bank', corHex:'#1a56db', bg:[239,244,255], cor:[26,86,219]   },
  { key:'emprestimo',     label:'Empréstimos',   icon:'ti-handshake',     corHex:'#6d28d9', bg:[245,243,255], cor:[109,40,217]  },
  { key:'reserva',        label:'Reserva',       icon:'ti-shield-check',  corHex:'#0e7490', bg:[236,254,255], cor:[14,116,144]  },
];

const REL_MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const REL_NOMES_TRIM = [
  '1º Trimestre (Jan–Mar)', '2º Trimestre (Abr–Jun)',
  '3º Trimestre (Jul–Set)', '4º Trimestre (Out–Dez)'
];

// ── INICIALIZAÇÃO DA TELA ──────────────────────

function initRelatorios() {
  // Pré-selecionar mês e ano atuais
  const agora = new Date();
  const selMes  = document.getElementById('relMes');
  const selAno  = document.getElementById('relAno');
  const selTrim = document.getElementById('relTrimestre');

  if (selMes) selMes.value = agora.getMonth() + 1;
  if (selAno) selAno.value = agora.getFullYear();
  if (selTrim) selTrim.value = Math.ceil((agora.getMonth() + 1) / 3);

  // Garantir que os controles reflitam o tipo selecionado
  relAtualizarControles();
}

// Espelha dashAtualizarControles() — mesma lógica, IDs diferentes
function relAtualizarControles() {
  const tipo          = document.getElementById('relTipoPeriodo')?.value;
  const ctrlMes       = document.getElementById('relCtrlMes');
  const ctrlTrimestre = document.getElementById('relCtrlTrimestre');
  if (!ctrlMes || !ctrlTrimestre) return;

  ctrlMes.style.display       = 'none';
  ctrlTrimestre.style.display = 'none';

  if (tipo === 'mensal')     ctrlMes.style.display       = 'flex';
  if (tipo === 'trimestral') ctrlTrimestre.style.display = 'flex';
  // anual: só o ano aparece
}

// ── CÁLCULO DE RANGE DE DATAS ──────────────────
// Extraído de renderDashboard() em app.js — lógica idêntica, reutilizada

function calcularRangePeriodo(tipo, mes, trim, ano) {
  let inicio, fim, label, nomeArquivo;

  if (tipo === 'mensal') {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    inicio      = `${ano}-${String(mes).padStart(2,'0')}-01`;
    fim         = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
    label       = `${REL_MESES[mes - 1]} de ${ano}`;
    nomeArquivo = `FinanceIQ_Mensal_${REL_MESES[mes - 1]}_${ano}.pdf`;

  } else if (tipo === 'trimestral') {
    const mesInicio = (trim - 1) * 3 + 1;
    const mesFim    = trim * 3;
    const ultimoDia = new Date(ano, mesFim, 0).getDate();
    inicio      = `${ano}-${String(mesInicio).padStart(2,'0')}-01`;
    fim         = `${ano}-${String(mesFim).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
    label       = `${REL_NOMES_TRIM[trim - 1]} de ${ano}`;
    nomeArquivo = `FinanceIQ_${trim}_Trimestre_${ano}.pdf`;

  } else { // anual
    inicio      = `${ano}-01-01`;
    fim         = `${ano}-12-31`;
    label       = `Ano de ${ano}`;
    nomeArquivo = `FinanceIQ_Anual_${ano}.pdf`;
  }

  return { inicio, fim, label, nomeArquivo };
}

// ── BUSCA DE DADOS NO SUPABASE ─────────────────
// Reutiliza exatamente o mesmo padrão de query do renderDashboard()

async function buscarDadosPeriodo(inicio, fim) {
  const { data, error } = await window.supabase
    .from('lancamentos').select('*')
    .eq('user_id', currentUser.id)
    .gte('data', inicio).lte('data', fim)
    .order('data', { ascending: true });

  if (error) { console.error('Erro ao buscar lançamentos:', error); return []; }
  return data || [];
}

// ── CÁLCULO DE TOTAIS ──────────────────────────

function calcularTotaisPeriodo(lista) {
  const totaisMap = {
    entrada:0, saida:0, cartao_credito:0,
    investimento:0, emprestimo:0, reserva:0
  };
  lista.forEach(l => {
    const tipo = l.tipo?.trim();
    if (tipo && totaisMap[tipo] !== undefined)
      totaisMap[tipo] += parseFloat(l.valor) || 0;
  });
  const totalSaidas = totaisMap.saida + totaisMap.cartao_credito;
  const saldo       = totaisMap.entrada - totalSaidas;
  return { ...totaisMap, totalSaidas, saldo };
}

// ── RENDERIZAÇÃO DE GRÁFICO OFFSCREEN ──────────
// Cria canvas temporário fora da tela, renderiza Chart.js, exporta base64 PNG

function gerarGraficoOffscreen(tipo, dados, opcoes = {}) {
  return new Promise(resolve => {
    // Canvas invisível fora da viewport
    const canvas = document.createElement('canvas');
    canvas.width  = opcoes.width  || 700;
    canvas.height = opcoes.height || 300;
    canvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden';
    document.body.appendChild(canvas);

    const chart = new Chart(canvas, {
      type: tipo,
      data: dados,
      options: {
        responsive: false,
        animation: { duration: 0 }, // sem animação — exporta imediatamente
        plugins: {
          legend: opcoes.legend || { display: false },
        },
        ...opcoes.chartOptions,
      }
    });

    // Chart.js sem animação renderiza síncronamente, mas garantimos via requestAnimationFrame
    requestAnimationFrame(() => {
      const imgData = canvas.toDataURL('image/png', 1.0);
      chart.destroy();
      document.body.removeChild(canvas);
      resolve(imgData);
    });
  });
}

// ── GERAÇÃO DO GRÁFICO DE BARRAS (totais por tipo) ──

async function gerarGraficoBarras(tiposAtivos, totaisMap) {
  const dados = {
    labels: tiposAtivos.map(t => t.label),
    datasets: [{
      data: tiposAtivos.map(t => totaisMap[t.key]),
      backgroundColor: tiposAtivos.map(t => t.corHex),
      borderRadius: 6,
      borderSkipped: false,
    }]
  };
  return gerarGraficoOffscreen('bar', dados, {
    width: 700, height: 280,
    chartOptions: {
      scales: {
        y: {
          ticks: { color: '#6b7590', font: { size: 12 } },
          grid:  { color: '#e4e7ee' },
        },
        x: {
          ticks: { color: '#6b7590', font: { size: 12 } },
          grid:  { display: false },
        }
      }
    }
  });
}

// ── GERAÇÃO DO GRÁFICO DE ROSCA (distribuição) ──

async function gerarGraficoDoughnut(tiposAtivos, totaisMap) {
  const dados = {
    labels: tiposAtivos.map(t => t.label),
    datasets: [{
      data: tiposAtivos.map(t => totaisMap[t.key]),
      backgroundColor: tiposAtivos.map(t => t.corHex),
      borderWidth: 0,
    }]
  };
  return gerarGraficoOffscreen('doughnut', dados, {
    width: 420, height: 320,
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#6b7590', font: { size: 12 }, padding: 16, usePointStyle: true }
    },
    chartOptions: { cutout: '60%' }
  });
}

// ── SEÇÕES DO PDF ──────────────────────────────

function secaoCabecalho(doc, W, username, periodoLabel) {
  // Fundo azul
  doc.setFillColor(26, 86, 219);
  doc.rect(0, 0, W, 44, 'F');

  // Logo mark
  doc.setFillColor(255, 255, 255);
  doc.setGState(new doc.GState({ opacity: 0.15 }));
  doc.roundedRect(14, 9, 26, 26, 4, 4, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Fi', 27, 25, { align: 'center' });

  // Nome + subtítulo
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FinanceIQ', 46, 20);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório Financeiro Pessoal', 46, 27);

  const agora = new Date();
  doc.setFontSize(8.5);
  doc.text(
    `Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`,
    46, 34
  );

  // Período e usuário (direita)
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(periodoLabel, W - 14, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(username, W - 14, 28, { align: 'right' });
  doc.text(currentUser.email, W - 14, 35, { align: 'right' });

  return 54; // yPos após o cabeçalho
}

function secaoTitulo(doc, texto, yPos) {
  doc.setTextColor(30, 37, 65);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(texto, 14, yPos);

  // Linha decorativa abaixo do título
  doc.setDrawColor(228, 231, 238);
  doc.setLineWidth(0.4);
  doc.line(14, yPos + 3, 196, yPos + 3);

  return yPos + 10;
}

function secaoResumoCards(doc, W, totais, yPos) {
  yPos = secaoTitulo(doc, 'Resumo do período', yPos);

  // Monta os cards: apenas tipos com valor > 0 + saldo sempre
  const saldo = totais.saldo;

  const cards = [
    { label:'Entradas',     valor: totais.entrada,      cor:[10,124,66],   bg:[240,253,244] },
    { label:'Saídas',       valor: totais.totalSaidas,  cor:[192,57,43],   bg:[255,241,242] },
    { label:'Saldo',        valor: saldo,
      cor: saldo >= 0 ? [10,124,66] : [192,57,43],
      bg:  saldo >= 0 ? [240,253,244] : [255,241,242] },
    ...(totais.cartao_credito > 0 ? [{ label:'Cartão',        valor: totais.cartao_credito, cor:[180,83,9],  bg:[255,247,237] }] : []),
    ...(totais.investimento   > 0 ? [{ label:'Investimentos', valor: totais.investimento,   cor:[26,86,219], bg:[239,244,255] }] : []),
    ...(totais.emprestimo     > 0 ? [{ label:'Empréstimos',   valor: totais.emprestimo,     cor:[109,40,217],bg:[245,243,255] }] : []),
    ...(totais.reserva        > 0 ? [{ label:'Reserva',       valor: totais.reserva,        cor:[14,116,144],bg:[236,254,255] }] : []),
  ];

  const cols   = 3;
  const cardW  = (W - 28 - (cols - 1) * 6) / cols;
  const cardH  = 22;
  const gapCol = 6;
  const gapRow = 5;

  cards.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = 14 + col * (cardW + gapCol);
    const y   = yPos + row * (cardH + gapRow);

    doc.setFillColor(...c.bg);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');

    doc.setFillColor(...c.cor);
    doc.rect(x, y, 2.5, cardH, 'F');

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(c.label, x + 6, y + 8);

    doc.setTextColor(...c.cor);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrencyPDF(c.valor), x + 6, y + 17);
  });

  const linhas = Math.ceil(cards.length / cols);
  return yPos + linhas * (cardH + gapRow) + 6;
}

async function secaoGraficos(doc, W, tiposAtivos, totaisMap, yPos) {
  if (tiposAtivos.length === 0) return yPos;

  yPos = secaoTitulo(doc, 'Distribuição financeira', yPos);

  // Verifica se há espaço na página; se não, adiciona nova página
  if (yPos > 175) { doc.addPage(); yPos = 16; }

  // Gráfico de barras — ocupa largura total (com margem)
  const imgBarras = await gerarGraficoBarras(tiposAtivos, totaisMap);
  const barW = W - 28;       // 182mm
  const barH = barW * 0.38;  // proporção 700×280 → ~69mm

  doc.addImage(imgBarras, 'PNG', 14, yPos, barW, barH);
  yPos += barH + 8;

  // Gráfico de rosca — centralizado, menor
  const pizzaW = 80;
  const pizzaH = 80;
  const pizzaX = (W - pizzaW) / 2;

  // Verifica espaço para a rosca
  if (yPos + pizzaH + 30 > 280) { doc.addPage(); yPos = 16; }

  // Label acima da rosca
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Distribuição por tipo', W / 2, yPos - 1, { align: 'center' });

  const imgRosca = await gerarGraficoDoughnut(tiposAtivos, totaisMap);
  doc.addImage(imgRosca, 'PNG', pizzaX, yPos, pizzaW, pizzaH);
  yPos += pizzaH + 10;

  return yPos;
}

function secaoTabela(doc, W, lista, yPos) {
  // Verifica espaço; nova página se necessário
  if (yPos > 220) { doc.addPage(); yPos = 16; }

  yPos = secaoTitulo(doc, `Lançamentos do período (${lista.length})`, yPos);

  if (lista.length === 0) {
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Nenhum lançamento registrado neste período.', 14, yPos + 8);
    return yPos + 20;
  }

  const tipoLabels = {
    entrada:'Entrada', saida:'Saída', cartao_credito:'Cartão',
    investimento:'Investimento', emprestimo:'Empréstimo', reserva:'Reserva'
  };
  const tipoColors = {
    entrada:       [10,124,66],
    saida:         [192,57,43],
    cartao_credito:[180,83,9],
    investimento:  [26,86,219],
    emprestimo:    [109,40,217],
    reserva:       [14,116,144],
  };

  const rows = lista.map(l => [
    new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR'),
    l.descricao || '—',
    tipoLabels[l.tipo] || l.tipo,
    (l.tipo === 'entrada' ? '+' : '−') + ' ' + formatCurrencyPDF(l.valor),
    l.observacao || '—'
  ]);

  doc.autoTable({
    startY: yPos,
    head: [['Data', 'Descrição', 'Tipo', 'Valor', 'Observação']],
    body: rows,
    theme: 'plain',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
      textColor: [30, 37, 65],
      lineColor: [228, 231, 238],
      lineWidth: 0.3,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [248, 249, 252],
      textColor: [107, 117, 144],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [252, 252, 254] },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 60 },
      2: { cellWidth: 26 },
      3: { cellWidth: 38, halign: 'right' },
      4: { cellWidth: 32, textColor: [107, 117, 144] },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const tipo = lista[data.row.index]?.tipo;
      const cor  = tipoColors[tipo] || [30, 37, 65];
      // Coluna valor: cor + negrito
      if (data.column.index === 3) {
        data.cell.styles.textColor = cor;
        data.cell.styles.fontStyle = 'bold';
      }
      // Coluna tipo: cor
      if (data.column.index === 2) {
        data.cell.styles.textColor = cor;
      }
    },
    // Ao iniciar nova página, mantém o cabeçalho
    showHead: 'everyPage',
  });

  return doc.lastAutoTable.finalY;
}

function secaoTotaisFinais(doc, W, lista, totais, yPos) {
  // Barra de totais ao final da tabela
  const saldo = totais.saldo;

  doc.setFillColor(26, 86, 219);
  doc.roundedRect(14, yPos + 2, W - 28, 14, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${lista.length} lançamento${lista.length !== 1 ? 's' : ''} no período`, 20, yPos + 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Saldo: ${formatCurrencyPDF(saldo)}`, W - 20, yPos + 11, { align: 'right' });

  yPos += 22;

  // Verifica espaço para o resumo por tipo
  if (yPos + 40 > 275) { doc.addPage(); yPos = 16; }

  // Subtítulo
  doc.setTextColor(30, 37, 65);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Total por tipo de lançamento', 14, yPos + 8);
  yPos += 14;

  const tiposComMovimento = REL_TIPOS_CONFIG.filter(t => totais[t.key] > 0);
  if (tiposComMovimento.length > 0) {
    const cols   = Math.min(tiposComMovimento.length, 3);
    const itemW  = (W - 28 - (cols - 1) * 5) / cols;
    const itemH  = 18;

    tiposComMovimento.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = 14 + col * (itemW + 5);
      const y   = yPos + row * (itemH + 4);

      doc.setFillColor(...t.bg);
      doc.roundedRect(x, y, itemW, itemH, 2, 2, 'F');

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(t.label, x + 5, y + 6.5);

      doc.setTextColor(...t.cor);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrencyPDF(totais[t.key]), x + 5, y + 14);
    });

    yPos += Math.ceil(tiposComMovimento.length / cols) * (itemH + 4) + 4;
  }

  return yPos;
}

function secaoRodapePaginas(doc, W) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 231, 238);
    doc.setLineWidth(0.3);
    doc.line(14, 285, W - 14, 285);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('FinanceIQ — Controle Financeiro Pessoal', 14, 290);
    doc.text(`Página ${i} de ${total}`, W - 14, 290, { align: 'right' });
  }
}

// ── FUNÇÃO PRINCIPAL ───────────────────────────

async function gerarRelatorio() {
  // Lê parâmetros dos selects da tela de Relatórios
  const tipo = document.getElementById('relTipoPeriodo')?.value || 'mensal';
  const mes  = parseInt(document.getElementById('relMes')?.value  || new Date().getMonth() + 1);
  const trim = parseInt(document.getElementById('relTrimestre')?.value || Math.ceil((new Date().getMonth() + 1) / 3));
  const ano  = parseInt(document.getElementById('relAno')?.value  || new Date().getFullYear());

  showToast('Gerando relatório...', 'info', 10000);

  try {
    // ── 1. Dados do perfil ─────────────────────
    const { data: profile } = await window.supabase
      .from('profiles').select('username').eq('id', currentUser.id).single();
    const username = profile?.username || currentUser.email.split('@')[0];

    // ── 2. Range de datas ──────────────────────
    const { inicio, fim, label: periodoLabel, nomeArquivo } = calcularRangePeriodo(tipo, mes, trim, ano);

    // ── 3. Busca lançamentos ───────────────────
    const lista = await buscarDadosPeriodo(inicio, fim);

    // ── 4. Calcula totais ──────────────────────
    const totais     = calcularTotaisPeriodo(lista);
    const tiposAtivos = REL_TIPOS_CONFIG.filter(t => totais[t.key] > 0);

    // ── 5. Inicializa jsPDF ────────────────────
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W   = 210;

    // ── 6. Monta seções ────────────────────────
    let yPos = secaoCabecalho(doc, W, username, periodoLabel);
    yPos     = secaoResumoCards(doc, W, totais, yPos);
    yPos     = await secaoGraficos(doc, W, tiposAtivos, totais, yPos);
    yPos     = secaoTabela(doc, W, lista, yPos);
    yPos     = secaoTotaisFinais(doc, W, lista, totais, yPos);

    // ── 7. Rodapé em todas as páginas ──────────
    secaoRodapePaginas(doc, W);

    // ── 8. Salva o PDF ─────────────────────────
    doc.save(nomeArquivo);
    showToast(`PDF gerado: ${nomeArquivo}`, 'success');

  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    showToast('Erro ao gerar o PDF. Tente novamente.', 'error');
  }
}

// ── FORMATAÇÃO DE MOEDA (sem depender do DOM) ──

function formatCurrencyPDF(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(value || 0);
}