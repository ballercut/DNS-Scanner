import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const domainScans = pgTable("domain_scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domains: jsonb("domains").notNull().$type<DomainEntry[]>(),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  status: text("status").notNull().default("completed"),
});

export interface DomainEntry {
  domain: string;
  status: string;
  owner: string;
  age: string;
  hosts: number;
  websiteStatus: 'working' | 'broken' | 'checking' | 'unchecked';
  websiteError?: string;
}

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDomainScanSchema = createInsertSchema(domainScans).omit({
  id: true,
  scannedAt: true,
}).extend({
  timeout: z.number().min(10).max(60).optional().default(30),
  pages: z.number().min(1).max(230).optional().default(1)
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type DomainScan = typeof domainScans.$inferSelect;
export type InsertDomainScan = z.infer<typeof insertDomainScanSchema>;
