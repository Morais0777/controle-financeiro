// ================================================
// RELATORIOS.JS — Geração de PDF profissional
// Usa jsPDF + AutoTable (carregados via CDN)
// ================================================

async function gerarRelatorio() {
  showToast('Gerando relatório...', 'info', 8000);

  try {
    // Busca dados do usuário
    const { data: profile } = await window.supabase
      .from('profiles').select('*')
      .eq('id', currentUser.id).single();

    const username = profile?.username || currentUser.email.split('@')[0];

    // Busca lançamentos do mês atual
    const agora  = new Date();
    const mes    = agora.getMonth() + 1;
    const ano    = agora.getFullYear();
    const inicio = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const fim    = `${ano}-${String(mes).padStart(2,'0')}-31`;

    const { data: lancData } = await window.supabase
      .from('lancamentos').select('*')
      .eq('user_id', currentUser.id)
      .gte('data', inicio).lte('data', fim)
      .order('data', { ascending: true });

    const lista = lancData || [];

    // Inicializa jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W = 210; // largura A4
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const periodoLabel = `${meses[mes-1]} de ${ano}`;

    // ── CABEÇALHO ──────────────────────────────
    // Fundo azul
    doc.setFillColor(26, 86, 219);
    doc.rect(0, 0, W, 42, 'F');

    // Logo mark
    doc.setFillColor(255, 255, 255, 0.2);
    doc.roundedRect(14, 8, 24, 24, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Fi', 26, 24, { align: 'center' });

    // Nome do sistema
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('FinanceIQ', 44, 18);

    // Subtítulo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório Financeiro Pessoal', 44, 25);

    // Período
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`, 44, 32);

    // Período (direita)
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(periodoLabel, W - 14, 18, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(username, W - 14, 25, { align: 'right' });
    doc.text(currentUser.email, W - 14, 32, { align: 'right' });

    // ── TOTALIZADORES ──────────────────────────
    let yPos = 52;

    // Calcula totais
    const totais = { entrada:0, saida:0, cartao:0, investimento:0, emprestimo:0, reserva:0 };
    lista.forEach(l => {
      if (l.tipo === 'entrada')       totais.entrada      += parseFloat(l.valor);
      if (l.tipo === 'saida')         totais.saida        += parseFloat(l.valor);
      if (l.tipo === 'cartao_credito')totais.cartao       += parseFloat(l.valor);
      if (l.tipo === 'investimento')  totais.investimento += parseFloat(l.valor);
      if (l.tipo === 'emprestimo')    totais.emprestimo   += parseFloat(l.valor);
      if (l.tipo === 'reserva')       totais.reserva      += parseFloat(l.valor);
    });

    const totalSaidas = totais.saida + totais.cartao;
    const saldo       = totais.entrada - totalSaidas;

    // Título da seção
    doc.setTextColor(30, 37, 65);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo do período', 14, yPos);
    yPos += 6;

    // Cards de totais
    const cards = [
      { label: 'Entradas',     valor: totais.entrada,      cor: [10, 124, 66],   bg: [240, 253, 244] },
      { label: 'Saídas',       valor: totalSaidas,         cor: [192, 57, 43],   bg: [255, 241, 242] },
      { label: 'Saldo',        valor: saldo,               cor: saldo>=0?[10,124,66]:[192,57,43], bg: saldo>=0?[240,253,244]:[255,241,242] },
      { label: 'Investimentos',valor: totais.investimento, cor: [26, 86, 219],   bg: [239, 244, 255] },
      { label: 'Empréstimos',  valor: totais.emprestimo,   cor: [109, 40, 217],  bg: [245, 243, 255] },
      { label: 'Reserva',      valor: totais.reserva,      cor: [14, 116, 144],  bg: [236, 254, 255] },
    ];

    const cardW = (W - 28 - 10) / 3;
    const cardH = 20;
    const cardGap = 5;

    cards.forEach((c, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x   = 14 + col * (cardW + cardGap);
      const y   = yPos + row * (cardH + 4);

      // Fundo do card
      doc.setFillColor(...c.bg);
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');

      // Borda esquerda colorida
      doc.setFillColor(...c.cor);
      doc.rect(x, y, 2, cardH, 'F');

      // Label
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(c.label, x + 5, y + 7);

      // Valor
      doc.setTextColor(...c.cor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrencyPDF(c.valor), x + 5, y + 15);
    });

    yPos += 2 * (cardH + 4) + 10;

    // ── TABELA DE LANÇAMENTOS ──────────────────
    doc.setTextColor(30, 37, 65);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Lançamentos do período', 14, yPos);
    yPos += 4;

    if (lista.length === 0) {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Nenhum lançamento registrado neste período.', 14, yPos + 10);
    } else {
      const tipoLabels = {
        entrada: 'Entrada', saida: 'Saída', cartao_credito: 'Cartão',
        investimento: 'Investimento', emprestimo: 'Empréstimo', reserva: 'Reserva'
      };

      const tipoColors = {
        entrada:       [10, 124, 66],
        saida:         [192, 57, 43],
        cartao_credito:[180, 83, 9],
        investimento:  [26, 86, 219],
        emprestimo:    [109, 40, 217],
        reserva:       [14, 116, 144],
      };

      const rows = lista.map(l => [
        new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR'),
        l.descricao,
        tipoLabels[l.tipo] || l.tipo,
        (l.tipo === 'entrada' ? '+' : '-') + ' ' + formatCurrencyPDF(l.valor),
        l.observacao || '-'
      ]);

      doc.autoTable({
        startY: yPos,
        head: [['Data', 'Descrição', 'Tipo', 'Valor', 'Observação']],
        body: rows,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
          textColor: [30, 37, 65],
          lineColor: [228, 231, 238],
          lineWidth: 0.3,
        },
        headStyles: {
          fillColor: [248, 249, 252],
          textColor: [107, 117, 144],
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [252, 252, 254] },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 55 },
          2: { cellWidth: 28 },
          3: { cellWidth: 38, halign: 'right' },
          4: { cellWidth: 33, textColor: [107, 117, 144] },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const tipo = lista[data.row.index]?.tipo;
            const cor = tipoColors[tipo] || [30, 37, 65];
            data.cell.styles.textColor = cor;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'body' && data.column.index === 2) {
            const tipo = lista[data.row.index]?.tipo;
            const cor = tipoColors[tipo] || [30, 37, 65];
            data.cell.styles.textColor = cor;
          }
        },
      });

      // ── RODAPÉ DA TABELA ──────────────────────
      const finalY = doc.lastAutoTable.finalY + 6;

      doc.setFillColor(26, 86, 219);
      doc.roundedRect(14, finalY, W - 28, 14, 3, 3, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`${lista.length} lançamento${lista.length !== 1 ? 's' : ''} no período`, 20, finalY + 9);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Saldo: ${formatCurrencyPDF(saldo)}`, W - 20, finalY + 9, { align: 'right' });
    }

    // ── RODAPÉ DA PÁGINA ──────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(228, 231, 238);
      doc.setLineWidth(0.3);
      doc.line(14, 285, W - 14, 285);
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('FinanceIQ — Controle Financeiro Pessoal', 14, 290);
      doc.text(`Página ${i} de ${pageCount}`, W - 14, 290, { align: 'right' });
    }

    // ── SALVA O PDF ───────────────────────────
    const nomeArquivo = `FinanceIQ_${meses[mes-1]}_${ano}.pdf`;
    doc.save(nomeArquivo);
    showToast(`PDF gerado: ${nomeArquivo}`, 'success');

  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    showToast('Erro ao gerar o PDF. Tente novamente.', 'error');
  }
}

// Formata moeda para o PDF (sem depender do DOM)
function formatCurrencyPDF(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(value || 0);
}