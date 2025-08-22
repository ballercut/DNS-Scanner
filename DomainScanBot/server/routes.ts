import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDomainScanSchema, type DomainEntry } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";

// Website checking function
async function checkWebsiteStatus(domain: string, timeoutSeconds: number = 30): Promise<{status: 'working' | 'broken', error?: string}> {
  try {
    const urls = [`http://${domain}`, `https://${domain}`];
    
    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          timeout: timeoutSeconds * 1000, // Convert to milliseconds
          maxRedirects: 10,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          validateStatus: (status) => status < 500 // Accept redirects and client errors
        });

        // Check if redirected to Securly or similar blocking services
        const finalUrl = response.request?.res?.responseUrl || url;
        const responseText = (response.data || '').toLowerCase();
        const finalUrlLower = finalUrl.toLowerCase();
        
        // Enhanced blocking service detection
        if (finalUrlLower.includes('securly') || 
            finalUrlLower.includes('blocked') ||
            finalUrlLower.includes('filter') ||
            finalUrlLower.includes('websense') ||
            finalUrlLower.includes('lightspeed') ||
            finalUrlLower.includes('barracuda') ||
            responseText.includes('securly') ||
            responseText.includes('this site has been blocked') ||
            responseText.includes('access denied') ||
            responseText.includes('content filtered') ||
            responseText.includes('blocked by') ||
            responseText.includes('website blocked') ||
            responseText.includes('content filter') ||
            responseText.includes('websense') ||
            responseText.includes('lightspeed') ||
            responseText.includes('barracuda')) {
          return { status: 'broken', error: 'Blocked by security filter (Securly/similar)' };
        }

        // Check for common error pages
        if (response.status >= 400 && response.status < 500) {
          return { status: 'broken', error: `HTTP ${response.status}` };
        }

        // If we get here, the site appears to be working
        return { status: 'working' };
        
      } catch (error: any) {
        // Try the next URL variant
        continue;
      }
    }
    
    // If both HTTP and HTTPS failed
    return { status: 'broken', error: 'Connection failed' };
    
  } catch (error: any) {
    return { status: 'broken', error: error.message || 'Unknown error' };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Scan FreeDNS domains
  app.post("/api/scan-domains", async (req, res) => {
    try {
      const { timeout = 30, pages = 1 } = req.body;
      const baseUrl = "https://freedns.afraid.org/domain/registry/";
      const allDomainEntries: DomainEntry[] = [];

      console.log(`Starting scan of ${pages} page(s) with ${timeout}s timeout per domain...`);

      // Scan each page
      for (let page = 1; page <= pages; page++) {
        console.log(`\n--- Scanning page ${page}/${pages} ---`);
        const targetUrl = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
      
        // Fetch the HTML content for this page
        const response = await axios.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 30000,
          maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        console.log(`Page ${page} title:`, $('title').text());
        console.log(`Looking for FreeDNS domain registry table on page ${page}...`);
        
        // Extract domains from the actual FreeDNS registry table for this page
        const pageEntries: DomainEntry[] = [];
      
        // Look for the specific table with domain data (has trl/trd classes)
        $('tr.trl, tr.trd').each((index, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 4) {
            // First cell contains domain info with link and host count
            const domainCell = cells.eq(0);
            const domainLink = domainCell.find('a').first();
            const domainName = domainLink.text().trim();
            
            // Extract host count from span
            const hostSpan = domainCell.find('span');
            let hostCount = 0;
            if (hostSpan.length > 0) {
              const hostText = hostSpan.text();
              const hostMatch = hostText.match(/\((\d+)\s+hosts in use\)/);
              if (hostMatch) {
                hostCount = parseInt(hostMatch[1]);
              }
            }
            
            // Second cell is status
            const status = cells.eq(1).text().trim();
            
            // Third cell is owner
            const ownerCell = cells.eq(2);
            const owner = ownerCell.find('a').text().trim() || ownerCell.text().trim();
            
            // Fourth cell is age
            const age = cells.eq(3).text().trim();
            
            if (domainName && status) {
              const entry: DomainEntry = {
                domain: domainName,
                status: status,
                owner: owner,
                age: age,
                hosts: hostCount,
                websiteStatus: 'unchecked'
              };
              
              // Check if this domain already exists in our collection
              if (!allDomainEntries.some(existing => existing.domain === domainName)) {
                pageEntries.push(entry);
                allDomainEntries.push(entry);
                console.log(`Page ${page} - Found domain: ${domainName} | Status: ${status} | Owner: ${owner} | Hosts: ${hostCount}`);
              }
            }
          }
        });
        
        console.log(`Page ${page}: Successfully extracted ${pageEntries.length} new domain entries (Total: ${allDomainEntries.length})`);
        
        // Add a small delay between pages to be respectful to the server
        if (page < pages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`\n--- Completed scanning ${pages} pages ---`);
      console.log(`Total unique domains extracted: ${allDomainEntries.length}`);
      
      // Check website status for each domain from all pages
      console.log('\n--- Starting website status checks ---');
      const checkPromises = allDomainEntries.map(async (entry, index) => {
        try {
          console.log(`Checking ${entry.domain} (${index + 1}/${allDomainEntries.length})...`);
          entry.websiteStatus = 'checking';
          
          const websiteCheck = await checkWebsiteStatus(entry.domain, timeout);
          entry.websiteStatus = websiteCheck.status;
          if (websiteCheck.error) {
            entry.websiteError = websiteCheck.error;
          }
          
          console.log(`${entry.domain}: ${entry.websiteStatus}${entry.websiteError ? ` (${entry.websiteError})` : ''}`);
        } catch (error) {
          console.error(`Error checking ${entry.domain}:`, error);
          entry.websiteStatus = 'broken';
          entry.websiteError = 'Check failed';
        }
      });

      // Wait for all website checks to complete (in parallel for efficiency)
      await Promise.all(checkPromises);
      
      const initialWorkingCount = allDomainEntries.filter(e => e.websiteStatus === 'working').length;
      const initialBrokenCount = allDomainEntries.filter(e => e.websiteStatus === 'broken').length;
      console.log(`Website status checks completed: ${initialWorkingCount} working, ${initialBrokenCount} broken`);
      
      // If no domains found in any page, try the old method as fallback
      if (allDomainEntries.length === 0) {
        console.log('No table data found in any page, trying fallback method...');
        // Only try fallback for the first page to avoid overcomplicating
        const response = await axios.get(baseUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        const domains: string[] = [];
        
        $('a[href]').each((index, link) => {
          const linkText = $(link).text().trim();
          if (linkText && 
              linkText.includes('.') && 
              !linkText.includes(' ') && 
              /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(linkText)) {
            domains.push(linkText);
          }
        });
        
        const uniqueDomains = Array.from(new Set(domains))
          .filter(domain => {
            if (!domain || domain.length === 0) return false;
            if (domain.includes('freedns') || domain.includes('afraid')) return false;
            if (domain.startsWith('www.')) domain = domain.substring(4);
            return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
          });
        
        // Convert to DomainEntry format
        uniqueDomains.forEach(domain => {
          allDomainEntries.push({
            domain,
            status: 'unknown',
            owner: 'unknown',
            age: 'unknown',
            hosts: 0,
            websiteStatus: 'unchecked'
          });
        });
      }
      
      // Store the scan results
      const scanData = {
        domains: allDomainEntries,
        status: "completed" as const
      };
      
      const validatedData = insertDomainScanSchema.parse(scanData);
      const savedScan = await storage.createDomainScan(validatedData);
      
      const workingCount = allDomainEntries.filter(e => e.websiteStatus === 'working').length;
      const brokenCount = allDomainEntries.filter(e => e.websiteStatus === 'broken').length;
      const message = `Successfully extracted ${allDomainEntries.length} domains from ${pages} page(s) of FreeDNS registry. Website checks: ${workingCount} working, ${brokenCount} broken.`;
      
      res.json({
        success: true,
        scan: savedScan,
        message
      });
      
    } catch (error) {
      console.error('Domain scan failed:', error);
      
      // Store failed scan
      const failedScanData = {
        domains: [],
        status: "failed" as const
      };
      
      try {
        await storage.createDomainScan(failedScanData);
      } catch (storageError) {
        console.error('Failed to store failed scan:', storageError);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        message: "Failed to scan FreeDNS registry"
      });
    }
  });

  // Get latest scan results
  app.get("/api/latest-scan", async (req, res) => {
    try {
      const latestScan = await storage.getLatestDomainScan();
      res.json({
        success: true,
        scan: latestScan
      });
    } catch (error) {
      console.error('Failed to get latest scan:', error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve scan results"
      });
    }
  });

  // Get all scans
  app.get("/api/scans", async (req, res) => {
    try {
      const scans = await storage.getAllDomainScans();
      res.json({
        success: true,
        scans
      });
    } catch (error) {
      console.error('Failed to get scans:', error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve scans"
      });
    }
  });

  // Test endpoint to check specific domain status
  app.post("/api/check-domain", async (req, res) => {
    try {
      const { domain } = req.body;
      if (!domain) {
        return res.status(400).json({ success: false, error: "Domain is required" });
      }

      console.log(`Testing domain: ${domain}`);
      const result = await checkWebsiteStatus(domain);
      console.log(`Result for ${domain}:`, result);

      res.json({
        success: true,
        domain,
        websiteStatus: result.status,
        websiteError: result.error
      });
    } catch (error) {
      console.error('Domain check failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
