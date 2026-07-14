const { buildInvoicePDF } = require('../src/utils/pdfBuilder');

describe('buildInvoicePDF', () => {
  it('exports a function that can render a basic invoice document', () => {
    expect(typeof buildInvoicePDF).toBe('function');
  });
});
