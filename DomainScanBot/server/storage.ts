import { type User, type InsertUser, type DomainScan, type InsertDomainScan, type DomainEntry } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createDomainScan(scan: InsertDomainScan): Promise<DomainScan>;
  getLatestDomainScan(): Promise<DomainScan | undefined>;
  getAllDomainScans(): Promise<DomainScan[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private domainScans: Map<string, DomainScan>;

  constructor() {
    this.users = new Map();
    this.domainScans = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createDomainScan(insertScan: InsertDomainScan): Promise<DomainScan> {
    const id = randomUUID();
    const scan: DomainScan = {
      id,
      domains: insertScan.domains as DomainEntry[],
      status: insertScan.status || "completed",
      scannedAt: new Date(),
    };
    this.domainScans.set(id, scan);
    return scan;
  }

  async getLatestDomainScan(): Promise<DomainScan | undefined> {
    const scans = Array.from(this.domainScans.values());
    return scans.sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime())[0];
  }

  async getAllDomainScans(): Promise<DomainScan[]> {
    return Array.from(this.domainScans.values())
      .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());
  }
}

export const storage = new MemStorage();
