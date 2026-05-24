export function expenses(row) {
  return (Number(row?.fuelCost) || 0) + (Number(row?.driverCost) || 0) + (Number(row?.tollCost) || 0) + (Number(row?.otherCost) || 0);
}

export function realProfit(row) {
  return (Number(row?.tutar) || 0) - (Number(row?.portifUcr) || 0) - expenses(row);
}

export function paymentStatus(row) {
  const total = Number(row?.tutar) || 0;
  const paid = Number(row?.paidAmount) || 0;
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}
