import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

const prisma = new PrismaClient();
const TZ = 'Asia/Bangkok';

export class SummaryService {
  static async getSummary(discordId: string, range: 'today' | 'week' | 'month' | 'custom', from?: Date, to?: Date) {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) return { totalExpense: 0, totalIncome: 0, byCategory: [] };

    let startDate = dayjs().tz(TZ).startOf('day');
    let endDate = dayjs().tz(TZ).endOf('day');

    if (range === 'week') {
      startDate = dayjs().tz(TZ).startOf('week');
    } else if (range === 'month') {
      startDate = dayjs().tz(TZ).startOf('month');
    } else if (range === 'custom' && from && to) {
      startDate = dayjs(from).tz(TZ);
      endDate = dayjs(to).tz(TZ);
    }

    const transactions = await prisma.transaction.groupBy({
      by: ['type'],
      where: {
        userId: user.id,
        occurredAt: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      _sum: {
        amount: true,
      },
    });

    const byCategory = await prisma.transaction.groupBy({
      by: ['categoryId', 'type'],
      where: {
        userId: user.id,
        occurredAt: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      _sum: {
        amount: true,
      },
    });

    // Fetch category names
    const categories = await prisma.category.findMany({
      where: { id: { in: byCategory.map(c => c.categoryId) } }
    });

    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    return {
      totalExpense: Number(transactions.find(t => t.type === 'expense')?._sum.amount || 0),
      totalIncome: Number(transactions.find(t => t.type === 'income')?._sum.amount || 0),
      byCategory: byCategory.map(c => ({
        name: categoryMap.get(c.categoryId),
        type: c.type,
        amount: Number(c._sum.amount || 0),
      })),
    };
  }
}
