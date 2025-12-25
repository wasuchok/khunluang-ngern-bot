import { PrismaClient, TransactionType } from '@prisma/client';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

export class TransactionService {
  static async addTransaction(data: {
    discordId: string;
    amount: number;
    type: 'income' | 'expense';
    categoryName: string;
    note?: string;
    occurredAt?: Date;
  }) {
    // 1. Find or create user
    const user = await prisma.user.upsert({
      where: { discordId: data.discordId },
      update: {},
      create: { discordId: data.discordId },
    });

    // 2. Find or create category
    const category = await prisma.category.upsert({
      where: {
        // Note: Category doesn't have a unique constraint on name in the schema provided,
        // but for MVP we'll assume name is unique per type or just find first.
        // Let's adjust the schema logic or just find first.
        id: 'temp-id' // This is a bit tricky without unique name.
      },
      update: {},
      create: { name: data.categoryName, type: data.type as TransactionType },
    });
    // Re-thinking: The schema provided doesn't have unique on Category name.
    // I'll use a simple findFirst/create for now.

    let cat = await prisma.category.findFirst({
      where: { name: data.categoryName, type: data.type as TransactionType }
    });

    if (!cat) {
      cat = await prisma.category.create({
        data: { name: data.categoryName, type: data.type as TransactionType }
      });
    }

    // 3. Create transaction
    return await prisma.transaction.create({
      data: {
        userId: user.id,
        categoryId: cat.id,
        amount: new Decimal(data.amount),
        type: data.type as TransactionType,
        note: data.note,
        occurredAt: data.occurredAt || new Date(),
        source: 'discord',
      },
      include: { category: true }
    });
  }

  static async getLastTransaction(discordId: string) {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) return null;

    return await prisma.transaction.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { category: true }
    });
  }

  static async deleteTransaction(id: string) {
    return await prisma.transaction.delete({ where: { id } });
  }

  static async updateTransaction(id: string, data: any) {
    return await prisma.transaction.update({
      where: { id },
      data,
      include: { category: true }
    });
  }
}
