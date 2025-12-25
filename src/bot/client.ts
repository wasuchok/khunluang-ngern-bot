import dayjs from 'dayjs';
import { Client, GatewayIntentBits, Message } from 'discord.js';
import { parseMessage } from '../services/parser.service';
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
  console.log('ป้านวลพร้อมทำงานแล้วจ้า! 👵✨');
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  // Simple mention or DM check (optional, here we respond to all messages in the channel for simplicity or you can filter)
  // For production, you might want to only respond to mentions or specific channels.

  try {
    const text = message.content;
    const result = await parseMessage(text);

    if (result.confidence < 0.6 && result.intent !== 'help') {
      return message.reply('ขอโทษทีจ้า ป้านวลไม่ค่อยแน่ใจว่าเราหมายถึงอะไร ลองพิมพ์ใหม่ชัดๆ หน่อยนะจ๊ะ 😊');
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
        await handleDeleteLast(message);
        break;
      case 'help':
        message.reply('ป้านวลช่วยบันทึกรายรับรายจ่ายได้นะจ๊ะ! พิมพ์บอกป้าได้เลย เช่น "ข้าวแกง 45" หรือ "วันนี้ใช้ไปเท่าไหร่" จ้า');
        break;
      default:
        message.reply('ป้านวลยังไม่ค่อยเข้าใจจ้ะ ลองบอกใหม่อีกทีนะ 😊');
    }
  } catch (error) {
    console.error(error);
    message.reply('อุ๊ย! ป้านวลเวียนหัวนิดหน่อยจ้ะ ระบบขัดข้องนิดหน่อย ลองใหม่นะ');
  }
});

async function handleAddTransaction(message: Message, result: any) {
  const transactions = result.transactions || [];

  if (transactions.length === 0) {
    return message.reply('ลืมบอกจำนวนเงินหรือเปล่าจ๊ะ? บอกป้าหน่อยว่ากี่บาท');
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
    return message.reply('ป้านวลหาจำนวนเงินไม่เจอเลยจ้ะ ลองพิมพ์ใหม่นะ');
  }

  let response = `โอเคจ้า บันทึกให้แล้วนะ! 😊\n`;
  savedTransactions.forEach(tx => {
    const typeEmoji = tx.type === 'income' ? '💰' : '💸';
    response += `- ${typeEmoji} ${tx.category.name} ${tx.amount} บาท ${tx.note ? `(${tx.note})` : ''}\n`;
  });

  message.reply(response);
}

async function handleQuerySummary(message: Message, result: any) {
  const summary = await SummaryService.getSummary(
    message.author.id,
    result.query.range || 'today',
    result.query.from ? new Date(result.query.from) : undefined,
    result.query.to ? new Date(result.query.to) : undefined
  );

  let response = `สรุปรายการของ${getRangeText(result.query.range)}นะจ๊ะ:\n`;
  response += `🟢 รายรับ: ${summary.totalIncome} บาท\n`;
  response += `🔴 รายจ่าย: ${summary.totalExpense} บาท\n`;

  if (summary.byCategory.length > 0) {
    response += `\nแยกตามหมวดหมู่:\n`;
    summary.byCategory.forEach(c => {
      response += `- ${c.name}: ${c.amount} บาท (${c.type === 'income' ? 'รับ' : 'จ่าย'})\n`;
    });
  }

  if (Number(summary.totalExpense) > 1000 && result.query.range === 'today') {
    response += `\nวันนี้ใช้เก่งแท้ ป้านวลเป็นห่วงเด้อ! 👵💖`;
  } else {
    response += `\nเก่งมากจ้า บันทึกไว้จะได้รู้ว่าเงินไปไหนเนอะ 😊`;
  }

  message.reply(response);
}

async function handleEditLast(message: Message, result: any) {
  const lastTx = await TransactionService.getLastTransaction(message.author.id);
  if (!lastTx) return message.reply('ป้ายังไม่เห็นรายการล่าสุดของเราเลยจ้ะ');

  // Check 10 mins rule
  const diff = dayjs().diff(dayjs(lastTx.createdAt), 'minute');
  if (diff > 10) return message.reply('รายการล่าสุดมันนานเกิน 10 นาทีแล้วจ้ะ ป้าแก้ให้ไม่ได้แล้วนะ');

  const updateData: any = {};
  if (result.edit.new_amount) updateData.amount = result.edit.new_amount;
  if (result.edit.new_note) updateData.note = result.edit.new_note;
  // ... handle other fields

  await TransactionService.updateTransaction(lastTx.id, updateData);
  message.reply('แก้ให้แล้วจ้า! เรียบร้อยแล้วนะ 😊');
}

async function handleDeleteLast(message: Message) {
  const lastTx = await TransactionService.getLastTransaction(message.author.id);
  if (!lastTx) return message.reply('ป้ายังไม่เห็นรายการล่าสุดของเราเลยจ้ะ');

  const diff = dayjs().diff(dayjs(lastTx.createdAt), 'minute');
  if (diff > 10) return message.reply('รายการล่าสุดมันนานเกิน 10 นาทีแล้วจ้ะ ป้าลบให้ไม่ได้แล้วนะ');

  await TransactionService.deleteTransaction(lastTx.id);
  message.reply('ลบรายการล่าสุดให้แล้วนะจ๊ะ สบายใจได้! 😊');
}

function getRangeText(range: string) {
  switch (range) {
    case 'today': return 'วันนี้';
    case 'week': return 'อาทิตย์นี้';
    case 'month': return 'เดือนนี้';
    default: return 'ช่วงที่เลือก';
  }
}

export { client };

