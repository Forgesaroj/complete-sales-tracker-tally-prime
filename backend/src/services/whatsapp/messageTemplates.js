/**
 * WhatsApp message templates
 * Uses WhatsApp formatting: *bold*, _italic_, ```monospace```
 */

export function formatPaymentReminder(partyName, data, businessName = 'Rush Wholesale') {
  // data: { totalOutstanding, overdueAmount, oldestBillDate, billCount }
  let msg = `*Payment Reminder*\n\nDear ${partyName},\n\n`;
  msg += `Your outstanding balance is *Rs ${(data.totalOutstanding || 0).toLocaleString('en-IN')}*.\n`;
  if (data.overdueAmount > 0) {
    msg += `Overdue amount: Rs ${data.overdueAmount.toLocaleString('en-IN')}\n`;
  }
  if (data.billCount) {
    msg += `Bills pending: ${data.billCount}\n`;
  }
  msg += `\nKindly arrange payment at your earliest convenience.\n\nThank you,\n_${businessName}_`;
  return msg;
}

export function formatReceiptConfirmation(partyName, data, businessName = 'Rush Wholesale') {
  // data: { voucherNumber, amount, paymentModes: [{ name, amount }], date, remainingBalance }
  let msg = `*Payment Received*\n\nDear ${partyName},\n\n`;
  msg += `We have received your payment of *Rs ${(data.amount || 0).toLocaleString('en-IN')}*.\n\n`;
  msg += `Receipt: ${data.voucherNumber || '-'}\n`;
  msg += `Date: ${data.date || '-'}\n`;
  if (data.paymentModes && data.paymentModes.length > 0) {
    const modeLines = data.paymentModes
      .filter(m => m.amount > 0)
      .map(m => `  ${m.name}: Rs ${m.amount.toLocaleString('en-IN')}`)
      .join('\n');
    if (modeLines) msg += `\nBreakdown:\n${modeLines}\n`;
  }
  if (data.remainingBalance > 0) {
    msg += `\nRemaining balance: Rs ${data.remainingBalance.toLocaleString('en-IN')}\n`;
  } else {
    msg += `\nYour account is now clear.\n`;
  }
  msg += `\nThank you,\n_${businessName}_`;
  return msg;
}

export function formatChequeNotification(data) {
  // data: { chequeNumber, amount, bankName, chequeDate, partyName }
  let msg = `*Cheque Details*\n\n`;
  msg += `Party: ${data.partyName || '-'}\n`;
  msg += `Cheque No: ${data.chequeNumber || '-'}\n`;
  msg += `Bank: ${data.bankName || '-'}\n`;
  msg += `Amount: Rs ${(data.amount || 0).toLocaleString('en-IN')}\n`;
  msg += `Date: ${data.chequeDate || '-'}\n`;
  msg += `\nPlease confirm the details.`;
  return msg;
}

export function formatOutstandingReport(partyName, bills, businessName = 'Rush Wholesale') {
  // bills: array of { billName, amount, dueDate, ageingDays }
  let msg = `*Outstanding Statement*\n\nDear ${partyName},\n\nYour pending bills:\n`;
  const billLines = (bills || []).map((b, i) =>
    `${i + 1}. ${b.billName || b.bill_name || '-'} — Rs ${Math.abs(b.amount || 0).toLocaleString('en-IN')}${b.ageingDays ? ` (${b.ageingDays}d)` : ''}`
  ).join('\n');
  msg += billLines || '(none)';
  const total = (bills || []).reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
  msg += `\n\n*Total: Rs ${total.toLocaleString('en-IN')}*\n`;
  msg += `\nThank you,\n_${businessName}_`;
  return msg;
}
