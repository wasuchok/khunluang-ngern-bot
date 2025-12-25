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

  // 3. Summary keywords
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
    reply: `ข้าบันทึกรายการให้ท่านเรียบร้อยแล้วขอรับ`,
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
    reply: `ข้าตรวจตราสมุดบัญชีของท่านแล้ว พร้อมรายงานให้ทราบแล้วขอรับ`,
    transactions: [],
    query: { range, from: null, to: null, category: null },
    edit: { target: null, new_amount: null, new_category: null, new_note: null, new_date: null },
  };
}
