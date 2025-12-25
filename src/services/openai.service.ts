import dotenv from 'dotenv';

dotenv.config();

export interface OpenAIResponse {
  intent: 'add_transaction' | 'query_summary' | 'edit_last' | 'delete_last' | 'help' | 'unknown';
  confidence: number;
  transactions: {
    type: 'income' | 'expense' | null;
    amount: number | null;
    category: string | null;
    date: string | null; // ISO-8601
    note: string | null;
  }[];
  query: {
    range: 'today' | 'week' | 'month' | 'custom' | null;
    from: string | null;
    to: string | null;
    category: string | null;
  };
  edit: {
    target: 'last' | 'id' | null;
    new_amount: number | null;
    new_category: string | null;
    new_note: string | null;
    new_date: string | null;
  };
}

const SYSTEM_PROMPT = `
คุณคือ "ป้านวล" ผู้ช่วยบันทึกรายรับรายจ่ายที่แสนอบอุ่นและเป็นกันเอง
หน้าที่ของคุณคือรับข้อความภาษาไทยจากผู้ใช้และสกัดข้อมูลออกมาในรูปแบบ JSON ตามโครงสร้างที่กำหนดเท่านั้น

กฎการทำงาน:
1. วิเคราะห์ intent ของผู้ใช้ (add_transaction, query_summary, edit_last, delete_last, help, unknown)
2. สำหรับ add_transaction ให้สกัดข้อมูลใส่ในอาเรย์ transactions (รองรับหลายรายการในประโยคเดียว)
3. สกัดข้อมูลจำนวนเงิน (amount), ประเภท (type: income/expense), หมวดหมู่ (category), วันที่ (date), และหมายเหตุ (note)
4. สำหรับ query_summary ให้ระบุช่วงเวลา (range) และวันที่เริ่ม/สิ้นสุด (from/to)
5. ถ้าข้อมูลไม่ชัดเจน ให้ลดค่า confidence และใส่ค่า null ในฟิลด์ที่หาไม่ได้
6. วันที่ให้ใช้รูปแบบ ISO-8601 (Asia/Bangkok)
7. ห้ามตอบเป็นข้อความอื่นนอกจาก JSON

ตัวอย่างการสกัด:
- "ข้าวแกง 45" -> { "intent": "add_transaction", "transactions": [{ "amount": 45, "type": "expense", "category": "อาหาร" }] }
- "เงินเดือนเข้า 25000" -> { "intent": "add_transaction", "transactions": [{ "amount": 25000, "type": "income", "category": "เงินเดือน" }] }
- "ข้าวแกง 45 ไก่ทอด 10" -> { "intent": "add_transaction", "transactions": [{ "amount": 45, "category": "อาหาร" }, { "amount": 10, "category": "อาหาร" }] }
- "วันนี้ใช้ไปเท่าไหร่" -> { "intent": "query_summary", "query": { "range": "today" } }

Current Time: ${new Date().toISOString()} (Asia/Bangkok)
`;

export async function parseWithAI(text: string): Promise<OpenAIResponse> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    if (!content) throw new Error('Empty response from AI API');

    // Strip markdown code blocks if present
    content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    return JSON.parse(content) as OpenAIResponse;
  } catch (error) {
    console.error('AI API Error:', error);
    return {
      intent: 'unknown',
      confidence: 0,
      transactions: [],
      query: { range: null, from: null, to: null, category: null },
      edit: { target: null, new_amount: null, new_category: null, new_note: null, new_date: null },
    };
  }
}
