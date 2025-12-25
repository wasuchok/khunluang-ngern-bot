import { OpenAIResponse, parseWithAI } from './openai.service';

export async function parseMessage(text: string): Promise<OpenAIResponse> {
  // 1. Rule-based parsing (Simple cases)
  const ruleBased = tryRuleBased(text);
  if (ruleBased && ruleBased.confidence > 0.9) {
    return ruleBased;
  }

  // 2. OpenAI parsing
  return await parseWithAI(text);
}

function tryRuleBased(text: string): OpenAIResponse | null {
  const input = text.trim();

  // 1. Simple Number only: "45", "100.50"
  const simpleAmount = /^(\d+(\.\d+)?)$/.exec(input);
  if (simpleAmount) {
    return createAddTransaction(parseFloat(simpleAmount[1]), 'expense', 'ทั่วไป');
  }

  // 2. Amount + Currency: "60 บาท", "100.50บาท"
  const amountCurrency = /^(\d+(\.\d+)?)\s*บาท$/.exec(input);
  if (amountCurrency) {
    return createAddTransaction(parseFloat(amountCurrency[1]), 'expense', 'ทั่วไป');
  }

  // 3. Common Thai patterns: "ค่าข้าว 50", "ค่าน้ำมัน 500", "ซื้อของ 120"
  // Pattern: (ค่า|ซื้อ|จ่าย)(หมวดหมู่) (จำนวน)
  const thaiPattern = /^(ค่า|ซื้อ|จ่าย|รับ|ได้เงิน|เงินเดือน)\s*([^\s\d]+)\s*(\d+(\.\d+)?)$/.exec(input);
  if (thaiPattern) {
    const prefix = thaiPattern[1];
    const category = thaiPattern[2];
    const amount = parseFloat(thaiPattern[3]);
    const type = (prefix === 'รับ' || prefix === 'ได้เงิน' || prefix === 'เงินเดือน') ? 'income' : 'expense';

    return createAddTransaction(amount, type, category);
  }

  // 4. Summary keywords
  if (['วันนี้', 'สรุปวันนี้', 'วันนี้ใช้ไปเท่าไหร่'].includes(input)) {
    return createQuerySummary('today');
  }
  if (['เดือนนี้', 'สรุปเดือนนี้'].includes(input)) {
    return createQuerySummary('month');
  }

  return null;
}

function createAddTransaction(amount: number, type: 'income' | 'expense', category: string): OpenAIResponse {
  return {
    intent: 'add_transaction',
    confidence: 0.95,
    transactions: [{
      amount,
      type,
      category,
      date: new Date().toISOString(),
      note: null,
    }],
    query: { range: null, from: null, to: null, category: null },
    edit: { target: null, new_amount: null, new_category: null, new_note: null, new_date: null },
  };
}

function createQuerySummary(range: 'today' | 'month'): OpenAIResponse {
  return {
    intent: 'query_summary',
    confidence: 1.0,
    transactions: [],
    query: { range, from: null, to: null, category: null },
    edit: { target: null, new_amount: null, new_category: null, new_note: null, new_date: null },
  };
}
