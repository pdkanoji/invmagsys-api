// buildTaxInvoicePDF.js
// Recreates the "TAX INVOICE" layout shown in the sample (Rajdhani Motors style)
// using pdfkit. Drop-in replacement for buildInvoicePDF — same call signature,
// plus a few extra optional fields (gstin, irn, ackNo, ewayBill, terms, bank, qty).

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  return numeric.toFixed(2);
};

const getNestedValue = (source, path, fallback = '') => {
  if (!source) return fallback;
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : fallback), source);
};

const buildTaxInvoicePDF = (doc, options = {}) => {
  const {
    docType = 'TAX INVOICE',
    number = '',
    date = '',
    poNo = '',
    poDate = '',
    despatchDocNo = '',
    destination = '',
    ewayBill = '',
    irnNo = '',
    ackNo = '',
    terms = '',
    entity = {},
    items = [],
    totals = {},
    gstBreakup = [],       // [{ rate, taxable, total, sch, disc, igst, cgst, sgst }]
    notes = '',
    company = {},
    bank = {},
  } = options;

  // ---------- helpers ----------
  const pageWidth = doc.page.width;
  const left = 30;
  const right = pageWidth - 30;
  const contentWidth = right - left;

  const line = (x1, y1, x2, y2, w = 0.5) => {
    doc.lineWidth(w).moveTo(x1, y1).lineTo(x2, y2).stroke('#000000');
  };
  const rect = (x, y, w, h, lw = 0.5) => {
    doc.lineWidth(lw).rect(x, y, w, h).stroke('#000000');
  };
  const text = (str, x, y, opts = {}) => doc.text(String(str ?? ''), x, y, opts);

  const companyName = company.name || 'Company Name';
  const companyAddress = company.address || '';
  const companyPhone = company.phone || '';
  const companyEmail = company.email || '';
  const companyGstin = company.gstin || '';

  const billTo = entity.billTo || {};
  const shipTo = entity.shipTo || billTo;

  // ---------- HEADER ----------
  let y = 30;
  doc.fontSize(11).font('Helvetica-Bold').text(docType, left, y, { width: contentWidth, align: 'center' });
  y += 18;
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#c0392b')
    .text(companyName, left, y, { width: contentWidth, align: 'center' });
  doc.fillColor('#000000');
  y += 24;

  doc.fontSize(8).font('Helvetica');
  if (companyAddress) {
    text(companyAddress, left, y, { width: contentWidth, align: 'center' });
    y += 12;
  }
  const contactLine = [companyPhone ? `Phone : ${companyPhone}` : '', companyEmail ? `E-Mail : ${companyEmail}` : '']
    .filter(Boolean).join('     ');
  if (contactLine) {
    text(contactLine, left, y, { width: contentWidth, align: 'center' });
    y += 12;
  }

  // QR placeholder box (top right), if a QR image buffer is supplied via company.qrImage
  if (company.qrImage) {
    try { doc.image(company.qrImage, right - 70, 30, { width: 70, height: 70 }); } catch (e) { /* ignore bad image */ }
  }

  if (companyGstin) {
    doc.fontSize(9).font('Helvetica-Bold');
    text(`GSTIN/UIN:${companyGstin}`, left, y, { continued: true });
    doc.font('Helvetica-Bold').text(`     EWAY BILL NO: ${ewayBill || ''}`, { align: 'right' });
    y += 14;
  }

  // ---------- BILL TO / SHIP TO + INVOICE META BOX ----------
  const boxTop = y;
  const leftColW = contentWidth * 0.55;
  const rightColX = left + leftColW;
  const rightColW = contentWidth - leftColW;

  // Left block: Bill To (top) / Ship To (bottom), split by a horizontal rule
  const billToRowH = 78;
  rect(left, boxTop, leftColW, billToRowH);
  doc.fontSize(8).font('Helvetica-Bold').text('BILL TO:', left + 4, boxTop + 4);
  doc.font('Helvetica-Bold').fontSize(9).text(billTo.name || 'N/A', left + 4, boxTop + 15);
  doc.font('Helvetica').fontSize(7.5);
  let by = boxTop + 27;
  if (billTo.address) { text(billTo.address, left + 4, by, { width: leftColW - 8 }); by += 10; }
  if (billTo.gstin) { text(`GSTIN/UIN : ${billTo.gstin}`, left + 4, by); by += 10; }
  if (billTo.fssai) { text(`FSSAI NO : ${billTo.fssai}`, left + 4, by); by += 10; }
  if (billTo.phone) { text(`PHONE: ${billTo.phone}`, left + 4, by); by += 10; }

  // Right block: Invoice meta
  rect(rightColX, boxTop, rightColW, billToRowH);
  const metaColX = rightColX + rightColW * 0.5;
  doc.fontSize(8).font('Helvetica');
  text('Invoice No. :', rightColX + 6, boxTop + 6);
  doc.font('Helvetica-Bold').text(number || 'N/A', rightColX + 6, boxTop + 17);
  doc.font('Helvetica').text('Date:', metaColX, boxTop + 6);
  doc.font('Helvetica-Bold').text(date || '', metaColX, boxTop + 17);

  doc.font('Helvetica').fontSize(8);
  text('PO.NO', rightColX + 6, boxTop + 34);
  text(poNo || '', rightColX + 6, boxTop + 45);
  text('Dated', metaColX, boxTop + 34);
  text(poDate || '', metaColX, boxTop + 45);

  text('Despatch Document No', rightColX + 6, boxTop + 60);
  text(despatchDocNo || '', rightColX + 6, boxTop + 70);
  text('Destination', metaColX, boxTop + 60);
  text(destination || '', metaColX, boxTop + 70);

  y = boxTop + billToRowH;

  const shipToRowH = 78;
  rect(left, y, leftColW, shipToRowH);
  doc.fontSize(8).font('Helvetica-Bold').text('SHIP TO:', left + 4, y + 4);
  doc.font('Helvetica-Bold').fontSize(9).text(shipTo.name || billTo.name || 'N/A', left + 4, y + 15);
  doc.font('Helvetica').fontSize(7.5);
  let sy = y + 27;
  if (shipTo.address) { text(shipTo.address, left + 4, sy, { width: leftColW - 8 }); sy += 10; }
  if (shipTo.gstin) { text(`GSTIN/UIN : ${shipTo.gstin}`, left + 4, sy); sy += 10; }
  if (shipTo.fssai) { text(`FSSAI NO : ${shipTo.fssai}`, left + 4, sy); sy += 10; }
  if (shipTo.placeOfSupply) { text(`Place of supply : ${shipTo.placeOfSupply}`, left + 4, sy); sy += 10; }
  if (shipTo.phone) { text(`PHONE: ${shipTo.phone}`, left + 4, sy); sy += 10; }

  // Right block: IRN / ACK / Terms of Delivery
  rect(rightColX, y, rightColW, shipToRowH);
  doc.fontSize(7).font('Helvetica');
  if (irnNo) text(`IRN NO.:${irnNo}`, rightColX + 6, y + 6, { width: rightColW - 12 });
  if (ackNo) text(`ACK NO.:${ackNo}`, rightColX + 6, y + 20, { width: rightColW - 12 });
  doc.fontSize(8).font('Helvetica-Bold').text('TERMS OF DELIVERY:', rightColX + 6, y + 36);
  doc.font('Helvetica').fontSize(7.5).text(terms || '', rightColX + 6, y + 48, { width: rightColW - 12 });

  y += shipToRowH;

  // ---------- ITEMS TABLE ----------
  const cols = [
    { key: 'sr', label: 'Sr', w: 22, align: 'left' },
    { key: 'partNo', label: 'PART NO', w: 62, align: 'left' },
    { key: 'name', label: 'PRODUCT NAME', w: 118, align: 'left' },
    { key: 'brand', label: 'BRAND', w: 52, align: 'left' },
    { key: 'hsn', label: 'HSN', w: 44, align: 'left' },
    { key: 'qty', label: 'QTY', w: 30, align: 'right' },
    { key: 'mrp', label: 'MRP', w: 46, align: 'right' },
    { key: 'disc', label: 'DISC', w: 40, align: 'right' },
    { key: 'price', label: 'PRICE', w: 46, align: 'right' },
    { key: 'gst', label: 'GST%', w: 34, align: 'right' },
    { key: 'amount', label: 'AMOUNT', w: 0, align: 'right' }, // fills remaining width
  ];
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = contentWidth - fixedW;

  const tableTop = y;
  const headH = 18;
  doc.rect(left, tableTop, contentWidth, headH).fillAndStroke('#e8e8e8', '#000000');
  doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
  let cx = left;
  cols.forEach((c) => {
    text(c.label, cx + 2, tableTop + 5, { width: c.w - 4, align: c.align });
    cx += c.w;
  });

  let rowY = tableTop + headH;
  doc.font('Helvetica').fontSize(7.5);
  let totalQty = 0;

  items.forEach((item, index) => {
    const partNo = getNestedValue(item, 'part_no', getNestedValue(item, 'product.code', ''));
    const name = getNestedValue(item, 'product.name', getNestedValue(item, 'product_name', 'Item'));
    const brand = getNestedValue(item, 'brand', '');
    const hsn = getNestedValue(item, 'hsn', '');
    const qty = Number(getNestedValue(item, 'quantity', 0));
    const mrp = Number(getNestedValue(item, 'mrp', 0));
    const disc = Number(getNestedValue(item, 'discount', 0));
    const price = Number(getNestedValue(item, 'unit_price', mrp - (mrp * disc) / 100));
    const gstPct = getNestedValue(item, 'gst_percent', '');
    const amount = Number(getNestedValue(item, 'total_price', qty * price));

    totalQty += qty;

    // measure row height across every column that can wrap (part no, product name, brand)
    const partNoHeight = doc.heightOfString(String(partNo || ''), { width: cols[1].w - 4 });
    const nameHeight = doc.heightOfString(String(name || ''), { width: cols[2].w - 4 });
    const brandHeight = doc.heightOfString(String(brand || ''), { width: cols[3].w - 4 });
    const rowH = Math.max(16, partNoHeight + 6, nameHeight + 6, brandHeight + 6);

    cx = left;
    const rowVals = [
      { v: index + 1, align: cols[0].align, w: cols[0].w },
      { v: partNo, align: cols[1].align, w: cols[1].w },
      { v: name, align: cols[2].align, w: cols[2].w },
      { v: brand, align: cols[3].align, w: cols[3].w },
      { v: hsn, align: cols[4].align, w: cols[4].w },
      { v: qty, align: cols[5].align, w: cols[5].w },
      { v: formatCurrency(mrp), align: cols[6].align, w: cols[6].w },
      { v: formatCurrency(disc), align: cols[7].align, w: cols[7].w },
      { v: formatCurrency(price), align: cols[8].align, w: cols[8].w },
      { v: gstPct !== '' ? `${gstPct}%` : '', align: cols[9].align, w: cols[9].w },
      { v: formatCurrency(amount), align: cols[10].align, w: cols[10].w },
    ];
    rowVals.forEach((rv) => {
      text(rv.v, cx + 2, rowY + 4, { width: rv.w - 4, align: rv.align });
      cx += rv.w;
    });

    rowY += rowH;
    line(left, rowY, right, rowY);

    // page break guard
    if (rowY > doc.page.height - 220 && index < items.length - 1) {
      doc.addPage();
      rowY = 40;
    }
  });

  // vertical borders around table
  rect(left, tableTop, contentWidth, rowY - tableTop);
  cx = left;
  cols.forEach((c) => { line(cx, tableTop, cx, rowY); cx += c.w; });
  line(right, tableTop, right, rowY);

  // total qty row
  const qtyRowH = 16;
  rect(left, rowY, contentWidth, qtyRowH);
  doc.font('Helvetica-Bold').fontSize(8);
  text(totalQty, left + cols[0].w + cols[1].w + cols[2].w + cols[3].w + cols[4].w + 2, rowY + 3,
    { width: cols[5].w - 4, align: 'right' });
  y = rowY + qtyRowH;

  // ---------- AMOUNT IN WORDS ----------
  y += 6;
  doc.font('Helvetica-Bold').fontSize(8);
  text(`AMOUNT IN WORD : ${totals.amountInWords || ''}`, left, y);
  y += 16;

  // ---------- GST BREAKUP + TOTALS ----------
  const gstTableW = contentWidth * 0.62;
  const sumTableX = left + gstTableW;
  const sumTableW = contentWidth - gstTableW;
  const gstHeadH = 22; // tall enough for 2-line wrapped headers like "TAXABLE AMT"
  const gstRowH = 14;
  const gstRows = gstBreakup.length ? gstBreakup : [];

  // Summary box always needs room for 4 label rows + a divider + grand total row.
  const summaryRowH = 15;
  const summaryRowsCount = 4; // Sub Total, Discount, GST AMT, Cr/Dr Note
  const minSummaryH = 10 + summaryRowsCount * summaryRowH + 22; // + divider + grand total

  const gstNaturalH = gstHeadH + gstRowH * (gstRows.length + 1); // +1 for TOTAL row
  const gstTableH = Math.max(gstNaturalH, minSummaryH);

  const gstCols = [
    { label: 'GST TAX %', w: 0.16 },
    { label: 'TOTAL', w: 0.14 },
    { label: 'SCH.', w: 0.12 },
    { label: 'DISC.', w: 0.14 },
    { label: 'TAXABLE AMT', w: 0.16 },
    { label: 'IGST', w: 0.14 },
    { label: 'CGST/SGST', w: 0.14 },
  ];
  rect(left, y, gstTableW, gstTableH);
  let gx = left;
  doc.font('Helvetica-Bold').fontSize(6.5);
  gstCols.forEach((c) => {
    const w = c.w * gstTableW;
    text(c.label, gx + 2, y + 3, { width: w - 4, align: 'center' });
    gx += w;
  });
  let gy = y + gstHeadH;
  doc.font('Helvetica').fontSize(7);
  let sumTaxable = 0, sumTotal = 0, sumDisc = 0, sumIgst = 0, sumCgstSgst = 0, sumSch = 0;
  gstRows.forEach((row) => {
    gx = left;
    const vals = [
      `${row.rate}%`, formatCurrency(row.total), formatCurrency(row.sch || 0),
      formatCurrency(row.disc || 0), formatCurrency(row.taxable),
      formatCurrency(row.igst || 0), formatCurrency((row.cgst || 0) + (row.sgst || 0)),
    ];
    vals.forEach((v, i) => {
      const w = gstCols[i].w * gstTableW;
      text(v, gx + 2, gy + 3, { width: w - 4, align: 'center' });
      gx += w;
    });
    sumTotal += Number(row.total || 0);
    sumSch += Number(row.sch || 0);
    sumDisc += Number(row.disc || 0);
    sumTaxable += Number(row.taxable || 0);
    sumIgst += Number(row.igst || 0);
    sumCgstSgst += Number((row.cgst || 0) + (row.sgst || 0));
    gy += gstRowH;
  });
  // TOTAL row
  gx = left;
  doc.font('Helvetica-Bold');
  const totalVals = [
    'TOTAL', formatCurrency(sumTotal), formatCurrency(sumSch),
    formatCurrency(sumDisc), formatCurrency(sumTaxable),
    formatCurrency(sumIgst), formatCurrency(sumCgstSgst),
  ];
  totalVals.forEach((v, i) => {
    const w = gstCols[i].w * gstTableW;
    text(v, gx + 2, gy + 3, { width: w - 4, align: 'center' });
    gx += w;
  });
  // internal column lines
  gx = left;
  gstCols.forEach((c) => { line(gx, y, gx, y + gstTableH); gx += c.w * gstTableW; });
  line(left + gstTableW, y, left + gstTableW, y + gstTableH);
  line(left, y + gstHeadH, left + gstTableW, y + gstHeadH);

  // Summary box (Sub Total / Discount / GST Amt / Cr-Dr Note / Grand Total)
  rect(sumTableX, y, sumTableW, gstTableH);
  const summaryRows = [
    ['Sub Total', totals.subtotal],
    ['Discount', totals.discount],
    ['GST AMT', totals.tax_amount],
    ['Cr/Dr Note', totals.crDrNote || 0],
  ];
  let sry = y + 6;
  doc.font('Helvetica').fontSize(8);
  summaryRows.forEach(([label, val]) => {
    text(label, sumTableX + 6, sry);
    text(formatCurrency(val || 0), sumTableX + sumTableW - 70, sry, { width: 64, align: 'right' });
    sry += summaryRowH;
  });
  doc.font('Helvetica-Bold').fontSize(9);
  line(sumTableX + 4, sry, sumTableX + sumTableW - 4, sry);
  sry += 6;
  text('GRAND TOTAL', sumTableX + 6, sry);
  text(formatCurrency(totals.total_amount || 0), sumTableX + sumTableW - 70, sry, { width: 64, align: 'right' });

  y += gstTableH + 14;

  // ---------- BANK DETAILS + SIGNATURE ----------
  // Both blocks share the same starting y and grow independently, so an empty
  // bank section never pushes/overlaps the signature (or vice versa).
  const bankStartY = y;
  doc.font('Helvetica-Bold').fontSize(8).text('BANK DETAILS', left, bankStartY);
  let bankY = bankStartY + 12;
  doc.font('Helvetica').fontSize(7.5);
  if (bank.name) { text(`BANK NAME : ${bank.name}`, left, bankY); bankY += 11; }
  if (bank.accountName) { text(`ACCOUNT NAME :${bank.accountName}`, left, bankY); bankY += 11; }
  if (bank.accountNo) { text(`A/C NO : ${bank.accountNo}`, left, bankY); bankY += 11; }
  if (bank.ifsc) { text(`IFSC CODE : ${bank.ifsc}`, left, bankY); bankY += 11; }

  // Signature block: fixed offset from bankStartY, independent of how many
  // bank-detail lines were actually printed.
  const signatureY = bankStartY + 20;
  doc.font('Helvetica-Bold').fontSize(8).text(`for ${companyName}`, right - 160, signatureY, { width: 160, align: 'right' });
  doc.font('Helvetica').fontSize(7.5).text('Authorised Signatory', right - 160, signatureY + 32, { width: 160, align: 'right' });

  y = Math.max(bankY, signatureY + 44);

  if (notes) {
    y += 6;
    doc.font('Helvetica').fontSize(7.5).text(String(notes), left, y, { width: contentWidth });
  }

  return doc;
};

module.exports = { buildTaxInvoicePDF };