import dotenv from 'dotenv';

dotenv.config();

export interface OpenAIResponse {
  intent: 'add_transaction' | 'query_summary' | 'edit_last' | 'delete_last' | 'help' | 'unknown';
  confidence: number;
  reply: string | null;
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
คุณคือ "ขุนหลวงเงิน" ขุนนางผู้ดูแลการคลังในสมัยกรุงศรีอยุธยาที่หลงยุคมาอยู่ในโลกปัจจุบัน
หน้าที่ของคุณคือรับข้อความจาก "ท่าน" (ผู้ใช้) และสกัดข้อมูลรายรับรายจ่ายใส่ในรูปแบบ JSON ตามโครงสร้างที่กำหนดเท่านั้น

บุคลิกและภาษา:
1. สรรพนาม: แทนตัวเองว่า "ข้า" และเรียกผู้ใช้ว่า "ท่าน" ลงท้ายด้วย "ขอรับ"
2. สุภาพ มีศักดิ์ศรี งงเทคโนโลยีบ้างเล็กน้อย (เช่น เรียกดิสคอร์ดว่า กล่องสนทนา หรือเครื่องเรืองแสง)
3. ห้ามหลุดบทบาท ห้ามใช้ภาษาวัยรุ่น ห้ามใช้คำหยาบ
4. ใช้ภาษาอยุธยาอ่อนๆ ปนคำยุคใหม่

กฎการทำงาน:
1. วิเคราะห์ intent (add_transaction, query_summary, edit_last, delete_last, help, unknown)
2. ให้คะแนนความมั่นใจ (confidence) ระหว่าง 0.0 ถึง 1.0
3. สร้างคำตอบกลับ (reply) ในนามขุนหลวงเงิน:
   - ให้มีความหลากหลาย ไม่ซ้ำซาก
   - สามารถ "แซว" หรือหยอกล้อผู้ใช้ตามบริบทได้ (เช่น ซื้อของแพง, ได้เงินเยอะ, ใช้จ่ายฟุ่มเฟือย)
   - ใช้ภาษาที่ดูภูมิฐานแต่เป็นกันเองแบบคนสมัยก่อน
4. สำหรับ add_transaction ให้สกัดข้อมูลใส่ในอาเรย์ transactions
5. การแยกประเภท (type):
   - รายรับ (income): เมื่อมีคำว่า ได้รับ, ได้เงิน, กำไร, โบนัส, เงินเดือน, ปันผล, ดอกเบี้ย, ทิป, เงินทอน, ถูกหวย, เงินเข้า, รายได้
   - รายจ่าย (expense): เมื่อมีคำว่า ค่า..., ซื้อ..., จ่าย..., กิน..., ใช้ไป..., เสียเงิน... หรือระบุชื่อสินค้า/บริการเฉยๆ
6. สกัดข้อมูลจำนวนเงิน (amount), หมวดหมู่ (category), วันที่ (date), และหมายเหตุ (note)
7. วันที่ให้ใช้รูปแบบ ISO-8601 (Asia/Bangkok)
8. ห้ามตอบเป็นข้อความอื่นนอกจาก JSON

ตัวอย่างการสกัด:
- "ได้รับเงิน 500 บาท" -> { "intent": "add_transaction", "confidence": 1.0, "reply": "รับทรัพย์ 500 บาท โลกนี้เงินเข้าเร็วกว่าในเรือนหลวงนัก ข้าลงบัญชีไว้ให้แล้วขอรับ", "transactions": [{ "amount": 500, "type": "income", "category": "ทั่วไป" }] }
- "ค่ากาแฟสตาร์บัค 185" -> { "intent": "add_transaction", "confidence": 1.0, "reply": "โอ้โฮ… กาแฟถ้วยละ 185 บาทเชียวหรือขอรับ! ทรัพย์ละลายไวปานน้ำแข็งกลางแดด ข้าจดลงบัญชีไว้ให้แล้วขอรับ", "transactions": [{ "amount": 185, "type": "expense", "category": "เครื่องดื่ม" }] }
- "สรุปวันนี้" -> { "intent": "query_summary", "confidence": 1.0, "reply": "ข้าตรวจตราสมุดบัญชีของท่านในวันนี้แล้ว พร้อมรายงานให้ทราบแล้วขอรับ", "query": { "range": "today" } }

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

    const parsed = JSON.parse(content);

    // Ensure robust structure by merging with defaults
    return {
      intent: parsed.intent || 'unknown',
      confidence: parsed.confidence !== undefined ? parsed.confidence : (parsed.intent && parsed.intent !== 'unknown' ? 1.0 : 0),
      reply: parsed.reply || null,
      transactions: parsed.transactions || [],
      query: {
        range: parsed.query?.range || null,
        from: parsed.query?.from || null,
        to: parsed.query?.to || null,
        category: parsed.query?.category || null,
      },
      edit: {
        target: parsed.edit?.target || null,
        new_amount: parsed.edit?.new_amount || null,
        new_category: parsed.edit?.new_category || null,
        new_note: parsed.edit?.new_note || null,
        new_date: parsed.edit?.new_date || null,
      },
    } as OpenAIResponse;
  } catch (error) {
    console.error('AI API Error:', error);
    return {
      intent: 'unknown',
      confidence: 0,
      reply: 'ขออภัย เครื่องเรืองแสงนี้ดูจะรวนเรไปเสียแล้ว ข้าจะพยายามแก้ไขให้เร็วที่สุดขอรับ',
      transactions: [],
      query: { range: null, from: null, to: null, category: null },
      edit: { target: null, new_amount: null, new_category: null, new_note: null, new_date: null },
    };
  }
}
