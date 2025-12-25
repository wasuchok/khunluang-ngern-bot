import dotenv from 'dotenv';
import { client } from './bot/client';

dotenv.config();

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('ERROR: DISCORD_TOKEN is not defined in .env');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('Failed to login to Discord:', err);
});
