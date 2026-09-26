import { defineConfig } from 'drizzle-kit'

// Hanya dipakai untuk membuat file migrasi (`drizzle-kit generate`).
// Migrasi diterapkan oleh aplikasi saat start, bukan oleh drizzle-kit.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
})
