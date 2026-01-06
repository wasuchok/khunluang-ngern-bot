import dayjs from 'dayjs';
import { Client, GatewayIntentBits, Message } from 'discord.js';
import { parseMessage } from '../services/parser.service';
import { SlipService } from '../services/slip.service';
import { SummaryService } from '../services/summary.service';
import { TransactionService } from '../services/transaction.service';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log('ขุนหลวงเงินพร้อมดูแลบัญชีให้ท่านแล้วขอรับ! 🏛️');
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  try {
    let text = message.content;
    const attachment = message.attachments.first();
    let slipResult = null;

    if (attachment && attachment.contentType?.startsWith('image/')) {
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }
      slipResult = await SlipService.processSlip(attachment.url);

      if (slipResult && slipResult.amount) {
        text = `บันทึกรายจ่าย ${slipResult.amount} บาท จากสลิปธนาคาร`;
        if (slipResult.isVerified) {
          text += ` (ตรวจสอบแล้วว่าเป็นสลิปจริง รหัสอ้างอิง: ${slipResult.transRef})`;
        }
      }
    }

    const result = await parseMessage(text);

    if (result.confidence < 0.6 && result.intent !== 'help') {
      return message.reply('ขออภัย ขุนหลวงเงินยังตามเรื่องนี้ไม่ทันในขณะนี้ หากท่านโปรดบอกให้ชัดเจน ข้าจะจัดการให้ขอรับ');
    }

    switch (result.intent) {
      case 'add_transaction':
        await handleAddTransaction(message, result);
        break;
      case 'query_summary':
        await handleQuerySummary(message, result);
        break;
      case 'edit_last':
        await handleEditLast(message, result);
        break;
      case 'delete_last':
        await handleDeleteLast(message, result);
        break;
      case 'help':
        message.reply('ข้าขุนหลวงเงิน ยินดีช่วยท่านดูแลบัญชีทรัพย์สินขอรับ เพียงท่านบอกกล่าวการใช้จ่ายหรือรายรับมาในกล่องสนทนานี้ ข้าจะลงบัญชีไว้ให้มิให้ตกหล่นขอรับ');
        break;
      default:
        message.reply('ขออภัย ขุนหลวงเงินยังตามเรื่องนี้ไม่ทันในขณะนี้ขอรับ');
    }
  } catch (error) {
    console.error(error);
    message.reply('ขออภัย เครื่องเรืองแสงนี้ดูจะรวนเรไปเสียแล้ว ข้าจะพยายามแก้ไขให้เร็วที่สุดขอรับ');
  }
});

async function handleAddTransaction(message: Message, result: any) {
  const transactions = result.transactions || [];

  if (transactions.length === 0) {
    return message.reply('ข้ายังไม่อาจลงบัญชีได้ เพราะยังขาดจำนวนเงิน หากท่านโปรดบอกให้ชัดเจน ข้าจะจัดการให้ขอรับ');
  }

  const savedTransactions = [];
  for (const txData of transactions) {
    const { amount, type, category, note, date } = txData;
    if (!amount) continue;

    const tx = await TransactionService.addTransaction({
      discordId: message.author.id,
      amount,
      type: type || 'expense',
      categoryName: category || 'ทั่วไป',
      note: note || undefined,
      occurredAt: date ? new Date(date) : new Date(),
    });
    savedTransactions.push(tx);
  }

  if (savedTransactions.length === 0) {
    return message.reply('ข้ายังไม่อาจลงบัญชีได้ เพราะยังหาจำนวนเงินมิเจอขอรับ');
  }

  if (result.reply) {
    return message.reply(result.reply);
  }

  let response = '';
  if (savedTransactions.length === 1) {
    const tx = savedTransactions[0];
    if (tx.type === 'income') {
      const incomePhrases = [
        `รับทรัพย์ ${tx.amount} บาท โลกนี้เงินเข้าเร็วกว่าในเรือนหลวงนัก ข้าลงบัญชีไว้ให้แล้วขอรับ`,
        `โอ้โฮ… ทรัพย์ไหลมาเทมาถึง ${tx.amount} บาท ข้าลงตราในบัญชีให้ท่านเรียบร้อยแล้วขอรับ`,
        `เงินทองไหลมาเทมาดั่งน้ำหลาก รับเข้าบัญชี ${tx.amount} บาท เรียบร้อยแล้วขอรับ`
      ];
      response = incomePhrases[Math.floor(Math.random() * incomePhrases.length)];
    } else {
      const expensePhrases = [
        `ข้าบันทึกรายจ่าย ${tx.amount} บาท ในหมวด ${tx.category.name} ลงในตำราไร้กระดาษนี้ให้แล้วขอรับ`,
        `จ่ายทรัพย์ไป ${tx.amount} บาท เพื่อ ${tx.category.name} หรือขอรับ… ข้าจดลงบัญชีไว้มิให้ตกหล่นแล้วขอรับ`,
        `โอ้… ทรัพย์ออกจากคลังไปอีก ${tx.amount} บาท ข้าลงตราประทับในกล่องสนทนานี้ให้แล้วขอรับ`,
        `บันทึกรายจ่าย ${tx.amount} บาท หมวด ${tx.category.name} เรียบร้อยแล้ว ทรัพย์สินยุคนี้ช่างเปลี่ยนมือไวแท้ขอรับ`
      ];
      response = expensePhrases[Math.floor(Math.random() * expensePhrases.length)];
    }
  } else {
    response = `ข้าลงบัญชีทรัพย์สินให้ท่านเรียบร้อยแล้วขอรับ:\n`;
    savedTransactions.forEach(tx => {
      response += `- ${tx.type === 'income' ? 'รับทรัพย์' : 'รายจ่าย'} ${tx.amount} บาท (${tx.category.name})\n`;
    });
    response += `ช่างว่องไวยิ่งนักขอรับ`;
  }

  message.reply(response);
}

async function handleQuerySummary(message: Message, result: any) {
  const query = result.query || {};
  const range = query.range || 'today';

  const summary = await SummaryService.getSummary(
    message.author.id,
    range,
    query.from ? new Date(query.from) : undefined,
    query.to ? new Date(query.to) : undefined
  );

  let response = '';

  if (result.reply) {
    response = result.reply + '\n\n';
    response += `สรุป: รายจ่ายรวม ${summary.totalExpense} บาท และรายรับ ${summary.totalIncome} บาทขอรับ`;
  } else {
    if (range === 'today') {
      response = `วันนี้ท่านใช้จ่ายรวม ${summary.totalExpense} บาท หากเป็นสมัยข้า คงต้องนับเหรียญกันจนเมื่อยมือ ขอให้ใช้ทรัพย์แต่พอดีขอรับ`;
    } else if (range === 'month') {
      response = `เดือนนี้ทรัพย์ออกจากเรือนไป ${summary.totalExpense} บาท ข้าตรวจบัญชีแล้วอดคิดมิได้ว่า โลกนี้ใช้เงินไวกว่าเรือสำเภาเสียอีกขอรับ`;
    } else {
      response = `ข้าตรวจบัญชีในช่วงเวลาที่ท่านถามถึงแล้ว พบว่ามีรายจ่ายรวม ${summary.totalExpense} บาท และรายรับ ${summary.totalIncome} บาทขอรับ`;
    }

    if (Number(summary.totalExpense) > 1000 && range === 'today') {
      response += `\n\nขอขุนหลวงเงินกล่าวตามตรง การใช้ทรัพย์ช่วงนี้ออกจะคล่องมือเกินไปสักนิด แม้ยุคสมัยเปลี่ยน แต่เงินหมดก็ยังหมดเหมือนเดิมขอรับ`;
    }
  }

  message.reply(response);
}

async function handleEditLast(message: Message, result: any) {
  const lastTx = await TransactionService.getLastTransaction(message.author.id);
  if (!lastTx) return message.reply('ข้ายังมิเห็นบัญชีล่าสุดของท่านเลยขอรับ');

  const diff = dayjs().diff(dayjs(lastTx.createdAt), 'minute');
  if (diff > 10) return message.reply('บัญชีนี้ถูกลงตราไว้เกินสิบนาทีแล้ว ข้ามิอาจแก้ไขให้ได้แล้วขอรับ');

  const updateData: any = {};
  if (result.edit.new_amount) updateData.amount = result.edit.new_amount;
  if (result.edit.new_note) updateData.note = result.edit.new_note;

  await TransactionService.updateTransaction(lastTx.id, updateData);
  message.reply(result.reply || 'ข้าแก้ไขบัญชีให้ท่านตามที่ประสงค์เรียบร้อยแล้วขอรับ');
}

async function handleDeleteLast(message: Message, result: any) {
  const lastTx = await TransactionService.getLastTransaction(message.author.id);
  if (!lastTx) return message.reply('ข้ายังมิเห็นบัญชีล่าสุดของท่านเลยขอรับ');

  const diff = dayjs().diff(dayjs(lastTx.createdAt), 'minute');
  if (diff > 10) return message.reply('บัญชีนี้ถูกลงตราไว้เกินสิบนาทีแล้ว ข้ามิอาจลบออกให้ได้แล้วขอรับ');

  await TransactionService.deleteTransaction(lastTx.id);
  message.reply(result.reply || 'ข้าลบบัญชีล่าสุดออกให้ตามคำสั่งท่านแล้วขอรับ');
}

function getRangeText(range: string) {
  switch (range) {
    case 'today': return 'วันนี้';
    case 'yesterday': return 'เมื่อวาน';
    case 'week': return 'อาทิตย์นี้';
    case 'month': return 'เดือนนี้';
    default: return 'ช่วงที่เลือก';
  }
}

export { client };

