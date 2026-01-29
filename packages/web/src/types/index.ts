export interface Memory {
  id: string;
  content: string;
  tags: string[];
  source: string | null;
  confidence: number;
  isVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Device {
  id: string;
  name: string;
  lastActive: string;
  status: 'active' | 'inactive';
  current: boolean;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  syncEnabled: boolean;
  retentionDays: number;
}
