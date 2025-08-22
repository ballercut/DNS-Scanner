import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Globe, Search, Trash2, Download, Copy, ExternalLink, AlertCircle, CheckCircle, Info, Loader2, Activity, Zap, Clock } from "lucide-react";

interface DomainEntry {
  domain: string;
  status: string;
  owner: string;
  age: string;
  hosts: number;
  websiteStatus: 'working' | 'broken' | 'checking' | 'unchecked';
  websiteError?: string;
}

interface DomainScan {
  id: string;
  domains: DomainEntry[];
  scannedAt: string;
  status: string;
}

interface ScanResponse {
  success: boolean;
  scan?: DomainScan;
  message?: string;
  error?: string;
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortType, setSortType] = useState("asc");
  const [websiteFilter, setWebsiteFilter] = useState<'all' | 'working' | 'broken'>('all');
  const [timeoutSetting, setTimeoutSetting] = useState<'10' | '15' | '30' | '60'>('30');
  const [pageCount, setPageCount] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState<'idle' | 'extracting' | 'checking' | 'completed'>('idle');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dark mode effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Fetch latest scan
  const { data: latestScanData, isLoading: isLoadingLatest } = useQuery<ScanResponse>({
    queryKey: ["/api/latest-scan"],
  });

  const latestScan = latestScanData?.scan;
  const domains = latestScan?.domains || [];

  // Filter and sort domains with useMemo to prevent infinite re-renders
  const filteredDomains = useMemo(() => {
    let filtered = domains.filter(entry => {
      // Search filter
      const searchMatch = entry.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.owner.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Website status filter
      const websiteMatch = websiteFilter === 'all' || entry.websiteStatus === websiteFilter;
      
      return searchMatch && websiteMatch;
    });

    if (sortType === "desc") {
      filtered.sort((a, b) => b.domain.localeCompare(a.domain));
    } else if (sortType === "length") {
      filtered.sort((a, b) => a.domain.length - b.domain.length);
    } else if (sortType === "status") {
      filtered.sort((a, b) => a.status.localeCompare(b.status));
    } else if (sortType === "hosts") {
      filtered.sort((a, b) => b.hosts - a.hosts);
    } else if (sortType === "website") {
      filtered.sort((a, b) => a.websiteStatus.localeCompare(b.websiteStatus));
    } else {
      filtered.sort((a, b) => a.domain.localeCompare(b.domain));
    }

    return filtered;
  }, [domains, searchTerm, sortType, websiteFilter]);

  // Scan domains mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanProgress(0);
      setScanStage('extracting');
      
      const response = await apiRequest("POST", "/api/scan-domains", { 
        timeout: parseInt(timeoutSetting),
        pages: pageCount
      });
      return response.json();
    },
    onSuccess: (data: ScanResponse) => {
      setScanProgress(100);
      setScanStage('completed');
      queryClient.invalidateQueries({ queryKey: ["/api/latest-scan"] });
      toast({
        title: "Scan Complete",
        description: data.message || `Successfully scanned ${data.scan?.domains.length || 0} domains`,
      });
      
      // Reset after a delay
      setTimeout(() => {
        setScanStage('idle');
        setScanProgress(0);
      }, 3000);
    },
    onError: (error: Error) => {
      setScanStage('idle');
      setScanProgress(0);
      toast({
        variant: "destructive",
        title: "Scan Failed",
        description: error.message || "Failed to scan FreeDNS registry",
      });
    },
  });

  // Simulate progress during scanning
  useEffect(() => {
    if (!scanMutation.isPending) return;

    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (scanStage === 'extracting') {
          // First 30% for page extraction
          const maxProgress = 30;
          const increment = maxProgress / (pageCount * 10); // Slower for more pages
          if (prev < maxProgress) {
            return Math.min(prev + increment, maxProgress);
          } else {
            setScanStage('checking');
            return prev;
          }
        } else if (scanStage === 'checking') {
          // Remaining 70% for website checking
          const startProgress = 30;
          const maxProgress = 95;
          const increment = (maxProgress - startProgress) / 100; // Gradual increase
          return Math.min(prev + increment, maxProgress);
        }
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [scanMutation.isPending, scanStage, pageCount]);

  const handleScan = () => {
    scanMutation.mutate();
  };

  const handleClear = () => {
    setSearchTerm("");
    setSortType("asc");
    setWebsiteFilter("all");
  };

  const handleCopy = async () => {
    try {
      const text = filteredDomains.map(entry => 
        `${entry.domain}\t${entry.status}\t${entry.owner}\t${entry.hosts} hosts\t${entry.age}\t${entry.websiteStatus}${entry.websiteError ? ` (${entry.websiteError})` : ''}`
      ).join("\n");
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Domain table copied to clipboard",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
      });
    }
  };

  const handleExport = () => {
    const csvHeader = "Domain,Status,Owner,Hosts,Age,Website Status,Website Error\n";
    const csvContent = filteredDomains.map(entry => 
      `"${entry.domain}","${entry.status}","${entry.owner}",${entry.hosts},"${entry.age}","${entry.websiteStatus}","${entry.websiteError || ''}"`
    ).join("\n");
    const csvText = csvHeader + csvContent;
    const blob = new Blob([csvText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freedns-domains-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = () => {
    if (scanMutation.isPending) {
      return (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            <div className="absolute inset-0 rounded-full border-2 border-blue-200 animate-pulse"></div>
          </div>
          <div className="flex gap-1">
            <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0ms'}}></div>
            <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '200ms'}}></div>
            <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '400ms'}}></div>
          </div>
        </div>
      );
    }
    if (scanMutation.isError) {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
    if (latestScan && latestScan.status === "completed") {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    return <Info className="h-5 w-5 text-slate-400" />;
  };

  const getStatusText = () => {
    if (scanMutation.isPending) {
      return (
        <div className="flex items-center gap-2">
          <span className="animate-pulse font-medium text-blue-600">Scanning FreeDNS Registry</span>
          <div className="flex gap-1">
            <span className="animate-bounce text-blue-500" style={{animationDelay: '0ms'}}>•</span>
            <span className="animate-bounce text-blue-500" style={{animationDelay: '200ms'}}>•</span>
            <span className="animate-bounce text-blue-500" style={{animationDelay: '400ms'}}>•</span>
          </div>
        </div>
      );
    }
    if (scanMutation.isError) {
      return "Scan Failed";
    }
    if (latestScan && latestScan.status === "completed") {
      return "Scan Complete";
    }
    return "Ready to scan";
  };

  const getStatusDetails = () => {
    if (scanMutation.isPending) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Activity className={`h-4 w-4 ${scanStage === 'extracting' ? 'animate-pulse text-blue-600' : 'text-gray-400'}`} />
            <span className={scanStage === 'extracting' ? 'text-blue-600 font-medium' : 'text-gray-500'}>
              {scanStage === 'extracting' ? 'Extracting' : 'Extracted'} domain data from {pageCount} page{pageCount > 1 ? 's' : ''}
            </span>
            {scanStage !== 'extracting' && scanStage !== 'idle' && <span className="text-green-500">✓</span>}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Zap className={`h-4 w-4 ${scanStage === 'checking' ? 'animate-pulse text-orange-600' : 'text-gray-400'}`} />
            <span className={scanStage === 'checking' ? 'text-orange-600 font-medium' : 'text-gray-500'}>
              {scanStage === 'checking' ? 'Checking' : 'Check'} website status with {timeoutSetting}s timeout
            </span>
            {scanStage === 'completed' && <span className="text-green-500">✓</span>}
          </div>
          <div className="w-full bg-blue-100 dark:bg-blue-900 rounded-full h-3 overflow-hidden relative">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
              style={{ width: `${scanProgress}%` }}
            >
              <div className="absolute inset-0 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            </div>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs font-medium text-blue-700 dark:text-blue-300">
              {Math.round(scanProgress)}%
            </div>
          </div>
        </div>
      );
    }
    if (scanMutation.isError) {
      return "Unable to fetch data. Check console for details.";
    }
    if (latestScan && latestScan.status === "completed") {
      return `Found ${domains.length} domains • ${new Date(latestScan.scannedAt).toLocaleString()}`;
    }
    return 'Click "Start Scan" to begin fetching domain names';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Globe className="text-primary text-xl h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">FreeDNS Domain Scanner</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">Automatically scan and extract domain names from FreeDNS registry</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Control Panel */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">Scan Control</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Fetch domain names from https://freedns.afraid.org/domain/registry/</p>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  onClick={handleScan} 
                  disabled={scanMutation.isPending}
                  className={`relative overflow-hidden transition-all duration-300 ${
                    scanMutation.isPending 
                      ? 'bg-blue-600 animate-pulse shadow-lg shadow-blue-200 dark:shadow-blue-800' 
                      : 'bg-primary hover:bg-blue-700'
                  }`}
                >
                  {scanMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <div className="absolute inset-0 rounded-full border border-white/30 animate-ping"></div>
                      </div>
                      <span className="animate-pulse">Scanning...</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      <span>Start Scan</span>
                    </div>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleClear}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {isDarkMode ? '☀️' : '🌙'}
                </Button>
              </div>
            </div>
            
            {/* Scan Settings */}
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Website Check Timeout
                </label>
                <Select value={timeoutSetting} onValueChange={(value: '10' | '15' | '30' | '60') => setTimeoutSetting(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">Low (10 seconds)</SelectItem>
                    <SelectItem value="15">Medium (15 seconds)</SelectItem>
                    <SelectItem value="30">High (30 seconds)</SelectItem>
                    <SelectItem value="60">Ultra High (60 seconds)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Higher timeout allows more thorough checking but takes longer
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Pages to Scan
                </label>
                <Input
                  type="number"
                  min="1"
                  max="230"
                  value={pageCount}
                  onChange={(e) => setPageCount(Math.min(230, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full"
                  placeholder="Number of pages"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Scan multiple pages (1-230) for more domain results
                </p>
              </div>
            </div>
            
            {/* Status Bar */}
            <div className={`rounded-lg p-4 flex items-center gap-3 ${
              scanMutation.isPending ? 'bg-blue-50' :
              scanMutation.isError ? 'bg-red-50' :
              latestScan?.status === 'completed' ? 'bg-green-50' :
              'bg-slate-50'
            }`}>
              {getStatusIcon()}
              <div>
                <div className="text-sm font-medium text-slate-700">{getStatusText()}</div>
                <div className="text-xs text-slate-500">{getStatusDetails()}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          {/* Results Header */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-medium text-slate-800">Scan Results</h3>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  {filteredDomains.length} domain{filteredDomains.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleExport}
                  disabled={filteredDomains.length === 0}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleCopy}
                  disabled={filteredDomains.length === 0}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {scanMutation.isPending && (
            <div className="p-12 text-center">
              <div className="inline-flex items-center gap-3 text-slate-600 mb-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Scanning domains...</span>
              </div>
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden max-w-md mx-auto">
                <div className="bg-primary h-full rounded-full animate-pulse" style={{width: '45%'}}></div>
              </div>
              <p className="text-sm text-slate-500 mt-2">This may take a few moments</p>
            </div>
          )}

          {/* Empty State */}
          {!scanMutation.isPending && domains.length === 0 && (
            <div className="p-12 text-center">
              <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Search className="text-slate-400 h-6 w-6" />
              </div>
              <h4 className="text-slate-700 font-medium mb-2">No domains scanned yet</h4>
              <p className="text-slate-500 text-sm">Click "Start Scan" to fetch domain names from FreeDNS registry</p>
            </div>
          )}

          {/* Error State */}
          {scanMutation.isError && (
            <div className="p-12 text-center">
              <div className="bg-red-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="text-red-500 h-6 w-6" />
              </div>
              <h4 className="text-slate-700 font-medium mb-2">Scanning Failed</h4>
              <p className="text-slate-500 text-sm mb-4">
                {scanMutation.error?.message || "Unable to fetch data from FreeDNS registry"}
              </p>
              <Button 
                variant="outline" 
                onClick={handleScan}
                className="text-primary hover:text-blue-700"
              >
                <Search className="h-4 w-4 mr-1" />
                Try Again
              </Button>
            </div>
          )}

          {/* Results List */}
          {!scanMutation.isPending && domains.length > 0 && (
            <div>
              {/* Search and Filter */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                    <Input
                      placeholder="Search domains..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Website Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      <SelectItem value="working">Working Only</SelectItem>
                      <SelectItem value="broken">Broken Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortType} onValueChange={setSortType}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">A-Z</SelectItem>
                      <SelectItem value="desc">Z-A</SelectItem>
                      <SelectItem value="length">By Length</SelectItem>
                      <SelectItem value="status">By Status</SelectItem>
                      <SelectItem value="hosts">By Host Count</SelectItem>
                      <SelectItem value="website">By Website Status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Domain Table */}
              <div className="overflow-hidden">
                {isLoadingLatest || scanMutation.isPending ? (
                  <div className="p-6 space-y-3">
                    {scanMutation.isPending && (
                      <div className="text-center py-4">
                        <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg border border-blue-200 dark:border-blue-700 shadow-lg">
                          <div className="relative">
                            <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-700 rounded-full animate-pulse"></div>
                            <div className="absolute inset-0 w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <div className="absolute -inset-2 border border-blue-300 rounded-full animate-pulse-ring opacity-50"></div>
                          </div>
                          <div className="text-blue-700 dark:text-blue-300">
                            <div className="font-medium flex items-center gap-2">
                              <span>Processing domain data</span>
                              <div className="flex gap-1">
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '200ms'}}></div>
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '400ms'}}></div>
                              </div>
                            </div>
                            <div className="text-sm opacity-75">Scanning {pageCount} page{pageCount > 1 ? 's' : ''} • {timeoutSetting}s timeout</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {[...Array(scanMutation.isPending ? 8 : 5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 p-4 border border-slate-200 dark:border-slate-600 rounded-lg animate-pulse hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <div className="w-4 h-4 bg-gradient-to-r from-green-400 to-green-500 rounded-full animate-pulse"></div>
                        <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 rounded w-32 animate-pulse"></div>
                        <div className="h-4 bg-gradient-to-r from-blue-200 to-blue-300 dark:from-blue-600 dark:to-blue-700 rounded w-20 animate-pulse"></div>
                        <div className="h-4 bg-gradient-to-r from-orange-200 to-orange-300 dark:from-orange-600 dark:to-orange-700 rounded w-16 animate-pulse"></div>
                        <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 rounded w-24 animate-pulse"></div>
                        <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 rounded w-16 animate-pulse"></div>
                        <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 rounded w-12 animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Domain</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Website</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Owner</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hosts</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Age</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-600 max-h-80 overflow-y-auto">
                        {filteredDomains.map((entry, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-150">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="font-mono text-sm text-slate-800 dark:text-slate-200">{entry.domain}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                entry.status === 'public' ? 'bg-green-100 text-green-800' :
                                entry.status === 'private' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                entry.websiteStatus === 'working' ? 'bg-green-100 text-green-800' :
                                entry.websiteStatus === 'broken' ? 'bg-red-100 text-red-800' :
                                entry.websiteStatus === 'checking' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.websiteStatus === 'working' && '✓ Working'}
                                {entry.websiteStatus === 'broken' && '✗ Broken'}
                                {entry.websiteStatus === 'checking' && '⏳ Checking'}
                                {entry.websiteStatus === 'unchecked' && '? Unchecked'}
                              </span>
                              {entry.websiteError && (
                                <div className="text-xs text-red-500 mt-1 truncate max-w-32" title={entry.websiteError}>
                                  {entry.websiteError}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                              {entry.owner}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                              {entry.hosts.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                              {entry.age}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-slate-400 hover:text-slate-600"
                                onClick={() => window.open(`http://${entry.domain}`, '_blank')}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Results Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-between">
                  <span>
                    Last updated: {latestScan ? new Date(latestScan.scannedAt).toLocaleString() : "Never"}
                  </span>
                  <span>Total domains: {domains.length}</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Info Notice */}
        <Card className="mt-6 bg-amber-50 border border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="text-amber-600 h-5 w-5 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-800 mb-1">How It Works</h4>
                <p className="text-sm text-amber-700">
                  This application uses a backend server to fetch and parse the FreeDNS registry, 
                  bypassing browser CORS restrictions. Domain names are extracted from the HTML table 
                  and stored for easy searching and filtering.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
