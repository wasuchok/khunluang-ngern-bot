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
        name_type: {
          name: data.categoryName,
          type: data.type as TransactionType,
        },
      },
      update: {},
      create: {
        name: data.categoryName,
        type: data.type as TransactionType,
      },
    });

    // 3. Create transaction
    return await prisma.transaction.create({
      data: {
        userId: user.id,
        categoryId: category.id,
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
