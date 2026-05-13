export interface ArticleVersion {
  id: string;
  topic: string;
  title: string;
  content: string;
  metaDescription: string;
  keywords: string[];
  imageSuggestions: { description: string; searchUrl: string }[];
  sources: { title: string; url: string }[];
  createdAt: number;
}

export interface ExtractedInfo {
  name: string;
  text: string;
}

export type WritingStyle = 'formal' | 'informal' | 'academic' | 'creative' | 'technical';

export interface SEOAnalysis {
  score: number;
  suggestions: string[];
  keywordsDetected: string[];
}

export interface PlagiarismCheck {
  score: number;
  details: string;
}

export interface WordPressConfig {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export interface WPPattern {
  name: string;
  title: string;
  content: string;
  source: 'core' | 'user';
  categories?: string[];
  description?: string;
}
