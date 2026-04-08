#!/usr/bin/env node

/**
 * Manual Seed Script
 * Run: npm run seed
 * This script runs the development seed independently
 */

import dotenv from 'dotenv';
dotenv.config();

import { seedDevelopmentData } from './src/services/seedService';

async function main() {
  try {
    console.log('🌱 Running development seed script...\n');
    await seedDevelopmentData();
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  }
}

main();
