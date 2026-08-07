// ================================================
// RELATORIOS.JS — FinanceIQ v6
// Geração de PDF profissional: Mensal · Trimestral · Anual
// ================================================

const REL_TIPOS_CONFIG = [
  { key:'entrada',        label:'Entradas',      corHex:'#0a7c42', bg:[240,253,244], cor:[10,124,66]   },
  { key:'saida',          label:'Saídas',        corHex:'#c0392b', bg:[255,241,242], cor:[192,57,43]   },
  { key:'cartao_credito', label:'Cartão',        corHex:'#b45309', bg:[255,247,237], cor:[180,83,9]    },
  { key:'investimento',   label:'Investimentos', corHex:'#1a56db', bg:[239,244,255], cor:[26,86,219]   },
  { key:'emprestimo',     label:'Empréstimos',   corHex:'#6d28d9', bg:[245,243,255], cor:[109,40,217]  },
  { key:'reserva',        label:'Reserva',       corHex:'#0e7490', bg:[236,254,255], cor:[14,116,144]  },
];

const REL_MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const REL_NOMES_TRIM = [
  '1º Trimestre (Jan–Mar)', '2º Trimestre (Abr–Jun)',
  '3º Trimestre (Jul–Set)', '4º Trimestre (Out–Dez)'
];

// ── Constantes de layout A4 ────────────────────
const PDF_MARGIN   = 14;
const PDF_W        = 210;
const PDF_H        = 297;
const PDF_CONTENT  = 182; // 210 - 14*2 = 182mm exatos
const PDF_FOOTER_Y = 283;

// ── INICIALIZAÇÃO ──────────────────────────────

function initRelatorios() {
  const agora = new Date();
  const selMes  = document.getElementById('relMes');
  const selAno  = document.getElementById('relAno');
  const selTrim = document.getElementById('relTrimestre');
  if (selMes)  selMes.value  = agora.getMonth() + 1;
  if (selAno)  selAno.value  = agora.getFullYear();
  if (selTrim) selTrim.value = Math.ceil((agora.getMonth() + 1) / 3);
  relAtualizarControles();
}

function relAtualizarControles() {
  const tipo          = document.getElementById('relTipoPeriodo')?.value;
  const ctrlMes       = document.getElementById('relCtrlMes');
  const ctrlTrimestre = document.getElementById('relCtrlTrimestre');
  if (!ctrlMes || !ctrlTrimestre) return;
  ctrlMes.style.display       = 'none';
  ctrlTrimestre.style.display = 'none';
  if (tipo === 'mensal')     ctrlMes.style.display       = 'flex';
  if (tipo === 'trimestral') ctrlTrimestre.style.display = 'flex';
}

// ── CÁLCULO DE PERÍODO ─────────────────────────

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
  } else {
    inicio      = `${ano}-01-01`;
    fim         = `${ano}-12-31`;
    label       = `Ano de ${ano}`;
    nomeArquivo = `FinanceIQ_Anual_${ano}.pdf`;
  }
  return { inicio, fim, label, nomeArquivo };
}

// ── SUPABASE ───────────────────────────────────

async function buscarDadosPeriodo(inicio, fim) {
  const { data, error } = await window.supabase
    .from('lancamentos').select('*')
    .eq('user_id', currentUser.id)
    .gte('data', inicio).lte('data', fim)
    .order('data', { ascending: true });
  if (error) { console.error('Erro ao buscar lançamentos:', error); return []; }
  return data || [];
}

// ── TOTAIS ─────────────────────────────────────

function calcularTotaisPeriodo(lista) {
  const totaisMap = { entrada:0, saida:0, cartao_credito:0, investimento:0, emprestimo:0, reserva:0 };
  lista.forEach(l => {
    const tipo = l.tipo?.trim();
    if (tipo && totaisMap[tipo] !== undefined)
      totaisMap[tipo] += parseFloat(l.valor) || 0;
  });
  const totalSaidas = totaisMap.saida + totaisMap.cartao_credito;
  const saldo       = totaisMap.entrada - totalSaidas;
  return { ...totaisMap, totalSaidas, saldo };
}

// ── FORMATAÇÃO DE MOEDA ────────────────────────

function formatCurrencyPDF(value) {
  const num = parseFloat(String(value).replace(/[^\d.]/g, '')) || 0;
  return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(num);
}

// ── SEÇÃO: CABEÇALHO ──────────────────────────

function secaoCabecalho(doc, W, username, periodoLabel) {
  doc.setFillColor(26, 86, 219);
  doc.rect(0, 0, W, 46, 'F');

  doc.setFillColor(255, 255, 255);
  doc.setGState(new doc.GState({ opacity: 0.15 }));
  doc.roundedRect(14, 9, 28, 28, 4, 4, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17); doc.setFont('helvetica', 'bold');
  doc.text('Fi', 28, 26, { align: 'center' });

  doc.setFontSize(21); doc.setFont('helvetica', 'bold');
  doc.text('FinanceIQ', 48, 21);

  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
  doc.text('Relatório Financeiro Pessoal', 48, 29);

  const agora = new Date();
  doc.setFontSize(8.5);
  doc.text(`Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`, 48, 37);

  doc.setFontSize(12.5); doc.setFont('helvetica', 'bold');
  doc.text(periodoLabel, W - 14, 21, { align: 'right' });

  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(username, W - 14, 30, { align: 'right' });
  doc.text(currentUser.email, W - 14, 38, { align: 'right' });

  return 58;
}

// ── SEÇÃO: TÍTULO ─────────────────────────────

function secaoTitulo(doc, texto, yPos) {
  doc.setTextColor(30, 37, 65);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(texto, PDF_MARGIN, yPos);

  doc.setDrawColor(26, 86, 219);
  doc.setLineWidth(0.5);
  doc.line(PDF_MARGIN, yPos + 3.5, PDF_MARGIN + 28, yPos + 3.5);

  doc.setDrawColor(228, 231, 238);
  doc.setLineWidth(0.3);
  doc.line(PDF_MARGIN + 28, yPos + 3.5, PDF_W - PDF_MARGIN, yPos + 3.5);

  return yPos + 12;
}

// ── SEÇÃO: CARDS DE RESUMO ────────────────────

function secaoResumoCards(doc, W, totais, yPos) {
  yPos = secaoTitulo(doc, 'Resumo do período', yPos);
  const saldo = totais.saldo;

  const cards = [
    { label:'Entradas',    valor: totais.entrada,     cor:[10,124,66],   bg:[240,253,244] },
    { label:'Saídas',      valor: totais.totalSaidas, cor:[192,57,43],   bg:[255,241,242] },
    { label:'Saldo',       valor: saldo,
      cor: saldo >= 0 ? [10,124,66] : [192,57,43],
      bg:  saldo >= 0 ? [240,253,244] : [255,241,242] },
    ...(totais.cartao_credito > 0 ? [{ label:'Cartão',        valor: totais.cartao_credito, cor:[180,83,9],   bg:[255,247,237] }] : []),
    ...(totais.investimento   > 0 ? [{ label:'Investimentos', valor: totais.investimento,   cor:[26,86,219],  bg:[239,244,255] }] : []),
    ...(totais.emprestimo     > 0 ? [{ label:'Empréstimos',   valor: totais.emprestimo,     cor:[109,40,217], bg:[245,243,255] }] : []),
    ...(totais.reserva        > 0 ? [{ label:'Reserva',       valor: totais.reserva,        cor:[14,116,144], bg:[236,254,255] }] : []),
  ];

  const cols   = 3;
  const gapCol = 7;
  const cardW  = (PDF_CONTENT - (cols - 1) * gapCol) / cols;
  const cardH  = 24;
  const gapRow = 6;

  cards.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = PDF_MARGIN + col * (cardW + gapCol);
    const y   = yPos + row * (cardH + gapRow);

    doc.setFillColor(...c.bg);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');

    doc.setFillColor(...c.cor);
    doc.roundedRect(x, y, 3, cardH, 1.5, 1.5, 'F');

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text(c.label, x + 8, y + 9);

    doc.setTextColor(...c.cor);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(formatCurrencyPDF(c.valor), x + 8, y + 19);
  });

  const linhas = Math.ceil(cards.length / cols);
  return yPos + linhas * (cardH + gapRow) + 8;
}

// ── SEÇÃO: TABELA ─────────────────────────────
// Larguras: 22 + 68 + 26 + 38 + 28 = 182mm (PDF_CONTENT exato)

function secaoTabela(doc, W, lista, yPos) {
  if (yPos + 55 > PDF_FOOTER_Y) { doc.addPage(); yPos = 20; }
  yPos = secaoTitulo(doc, `Lançamentos do período (${lista.length})`, yPos);

  if (lista.length === 0) {
    doc.setFillColor(248, 249, 252);
    doc.roundedRect(PDF_MARGIN, yPos, PDF_CONTENT, 18, 3, 3, 'F');
    doc.setTextColor(150, 160, 175);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    doc.text('Nenhum lançamento registrado neste período.', W / 2, yPos + 11, { align: 'center' });
    return yPos + 26;
  }

  const tipoLabels = {
    entrada:'Entrada', saida:'Saída', cartao_credito:'Cartão',
    investimento:'Investimento', emprestimo:'Empréstimo', reserva:'Reserva'
  };
  const tipoColors = {
    entrada:[10,124,66], saida:[192,57,43], cartao_credito:[180,83,9],
    investimento:[26,86,219], emprestimo:[109,40,217], reserva:[14,116,144],
  };
  const sinais = {
    entrada:'+', saida:'-', cartao_credito:'-',
    investimento:'-', emprestimo:'-', reserva:'-',
  };

  const rows = lista.map(l => {
    // Força interpretação como data LOCAL (sem fuso) para evitar dia -1
    const partes = String(l.data).split('-');
    const dataLocal = partes.length === 3
      ? new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]))
      : new Date(l.data + 'T12:00:00');
    const dataFormatada = dataLocal.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

    return [
      dataFormatada,
      l.descricao || '-',
      tipoLabels[l.tipo] || l.tipo,
      (sinais[l.tipo] || '-') + ' ' + formatCurrencyPDF(parseFloat(l.valor) || 0),
      l.observacao || '-'
    ];
  });

  doc.autoTable({
    startY: yPos,
    head: [['Data', 'Descrição', 'Tipo', 'Valor', 'Observação']],
    body: rows,
    theme: 'plain',
    tableWidth: PDF_CONTENT,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, top: 20, bottom: 20 },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: [30, 37, 65],
      lineColor: [228, 231, 238],
      lineWidth: 0.3,
      font: 'helvetica',
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 244, 251],
      textColor: [80, 95, 130],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
    },
    alternateRowStyles: { fillColor: [249, 250, 253] },
    columnStyles: {
      0: { cellWidth: 24, halign: 'left'   },  // Data (era 22, aumentado para caber dd/mm/aaaa)
      1: { cellWidth: 62, halign: 'left'   },  // Descrição (ajustado para manter soma = 182)
      2: { cellWidth: 28, halign: 'left'   },  // Tipo (era 26, pequena folga)
      3: { cellWidth: 42, halign: 'right',
           overflow: 'hidden'              },  // Valor (era 38, aumentado para caber sinal + moeda)
      4: { cellWidth: 26, halign: 'left',
           textColor: [140, 150, 165]      },  // Observação (ajustado; 24+62+28+42+26 = 182)
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const l   = lista[data.row.index];
      if (!l) return;
      const cor = tipoColors[l.tipo] || [30, 37, 65];
      if (data.column.index === 3) {
        data.cell.styles.textColor = cor;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 2) {
        data.cell.styles.textColor = cor;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize  = 8;
      }
    },
    showHead: 'everyPage',
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setTextColor(150, 160, 175);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
        doc.text('(continuação)', PDF_W - PDF_MARGIN, data.settings.startY - 2, { align: 'right' });
      }
    },
  });

  return doc.lastAutoTable.finalY + 4;
}

// ── SEÇÃO: TOTAIS FINAIS ──────────────────────

function secaoTotaisFinais(doc, W, lista, totais, yPos) {
  const saldo = totais.saldo;

  if (yPos + 18 > PDF_FOOTER_Y) { doc.addPage(); yPos = 20; }

  // Barra de saldo
  doc.setFillColor(26, 86, 219);
  doc.roundedRect(PDF_MARGIN, yPos + 2, PDF_CONTENT, 15, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.text(`${lista.length} lançamento${lista.length !== 1 ? 's' : ''} no período`, PDF_MARGIN + 6, yPos + 11.5);
  doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
  doc.text(`Saldo: ${formatCurrencyPDF(saldo)}`, W - PDF_MARGIN - 5, yPos + 11.5, { align: 'right' });

  yPos += 24;

  // Total por tipo
  const tiposComMovimento = REL_TIPOS_CONFIG.filter(t => totais[t.key] > 0);
  const alturaResumo = 14 + Math.ceil(tiposComMovimento.length / 3) * 26;
  if (yPos + alturaResumo > PDF_FOOTER_Y) { doc.addPage(); yPos = 20; }

  doc.setTextColor(30, 37, 65);
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
  doc.text('Total por tipo de lançamento', PDF_MARGIN, yPos + 8);
  yPos += 14;

  if (tiposComMovimento.length > 0) {
    const cols  = Math.min(tiposComMovimento.length, 3);
    const itemW = (PDF_CONTENT - (cols - 1) * 6) / cols;
    const itemH = 20;

    tiposComMovimento.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = PDF_MARGIN + col * (itemW + 6);
      const y   = yPos + row * (itemH + 5);

      doc.setFillColor(...t.bg);
      doc.roundedRect(x, y, itemW, itemH, 2.5, 2.5, 'F');
      doc.setFillColor(...t.cor);
      doc.roundedRect(x, y, 3, itemH, 1.5, 1.5, 'F');

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(t.label, x + 7, y + 7.5);

      doc.setTextColor(...t.cor);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(formatCurrencyPDF(totais[t.key]), x + 7, y + 16);
    });

    yPos += Math.ceil(tiposComMovimento.length / cols) * (itemH + 5) + 4;
  }

  return yPos;
}

// ── SEÇÃO: RODAPÉ ─────────────────────────────

function secaoRodapePaginas(doc, W) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 231, 238);
    doc.setLineWidth(0.4);
    doc.line(PDF_MARGIN, PDF_FOOTER_Y, W - PDF_MARGIN, PDF_FOOTER_Y);
    doc.setTextColor(170, 175, 190);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('FinanceIQ — Controle Financeiro Pessoal', PDF_MARGIN, PDF_FOOTER_Y + 5);
    doc.text(`Página ${i} de ${total}`, W - PDF_MARGIN, PDF_FOOTER_Y + 5, { align: 'right' });
  }
}

// ── FUNÇÃO PRINCIPAL ───────────────────────────

async function gerarRelatorio() {
  const tipo = document.getElementById('relTipoPeriodo')?.value || 'mensal';
  const mes  = parseInt(document.getElementById('relMes')?.value  || new Date().getMonth() + 1);
  const trim = parseInt(document.getElementById('relTrimestre')?.value || Math.ceil((new Date().getMonth() + 1) / 3));
  const ano  = parseInt(document.getElementById('relAno')?.value  || new Date().getFullYear());

  showToast('Gerando relatório...', 'info', 10000);

  try {
    const { data: profile } = await window.supabase
      .from('profiles').select('username').eq('id', currentUser.id).single();
    const username = profile?.username || currentUser.email.split('@')[0];

    const { inicio, fim, label: periodoLabel, nomeArquivo } = calcularRangePeriodo(tipo, mes, trim, ano);
    const lista  = await buscarDadosPeriodo(inicio, fim);
    const totais = calcularTotaisPeriodo(lista);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W   = PDF_W;

    let yPos = secaoCabecalho(doc, W, username, periodoLabel);
    yPos     = secaoResumoCards(doc, W, totais, yPos);
    yPos     = secaoTabela(doc, W, lista, yPos);
    yPos     = secaoTotaisFinais(doc, W, lista, totais, yPos);
    secaoRodapePaginas(doc, W);

    doc.save(nomeArquivo);
    showToast(`PDF gerado: ${nomeArquivo}`, 'success');

  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    showToast('Erro ao gerar o PDF. Tente novamente.', 'error');
  }
}

